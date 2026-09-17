-- ══════════════════════════════════════════════════════════════════════════════
-- 20260917172916_ponytail_cleanup.sql §4 的落地前验证（只读，整段 rollback）
-- ══════════════════════════════════════════════════════════════════════════════
-- 跑法（CLI 直连云端，Management API，不需要 DB 密码、不需要 Docker、不开 Studio）：
--     cd web && supabase db query --linked -f ../.scratch/ponytail-audit-fixes/verify-org-admin-scope.sql
--
-- 为什么要有这个文件：`db push` 只执行 DDL，**从不求值策略**。策略递归与
-- 「租户谓词收窄过头」在 CI 全绿的情况下照样存在，只有真身份读一次才暴露。
--
-- 这条迁移还没落地（本地推不动，只有 push main → CI 才推），所以探针把 §4 的
-- 三条 create policy **在事务内先应用一遍**，再验，末尾 rollback。这样跑一次拿到
-- 的是「新策略表达式到底对不对」的答案，而不是「旧策略确实漏」这个已知结论。
--
-- ── 要证明的六件事 ──────────────────────────────────────────────────────────
--   A 修复前：公司1 的 org_admin 读得到公司2 的学校与公司 —— 漏洞真实存在
--   B 只补两条 select 策略的谓词：schools 立刻收窄；
--     而 organizations **仍然漏**（B4/B5 是故意留的反例）—— 因为
--     organizations_org_admin_all 是 for all，permissive 策略按 OR 合并。
--     这一步是用来证明「第三条策略不是顺手改的」
--   C 再补 organizations_org_admin_all 的 USING：organizations 才真正收窄，
--     且写路径（改本公司组织）没被打死
--   D 反面：把同一个 org_admin 挪进公司2，他立刻看得到公司2、看不到公司1
--     —— 证明 B/C 里的 0 是谓词在起作用，不是「这条路根本读不到东西」
--   E 本校 admin 那一支没被收窄打死
--   F 裸 anon（无签名头）什么都读不到
--
-- ── 三个必须绕开的坑（见 docs/agents/deployment.md）──────────────────────────
--   1) db query 只回**最后一条语句**的结果集 → 结论全写进 GUC，末尾一条 select 汇总
--   2) 直连进来的是 postgres，**绕过 RLS** → 每个身份段必须 set local role anon
--   3) 生产是单租户（1 家公司 / 1 所学校），「读不到别家」在单租户下恒为 0 无信息量
--      → 事务内现造第二个租户夹具，rollback 后零残留
--
--   签名口径必须与库里那份 has_valid_app_session_signature 逐字一致：
--   subject = session_version = 0 ? id::text : id::text || ':' || session_version::text
--   签错时 current_app_user_id() 静默回落到 auth.uid()（直连时 NULL），
--   下面所有 0 都变成噪音 —— 所以每个身份段都要把解析到的身份打出来自证。

begin;

create or replace function pg_temp.act_as(p_user uuid) returns void
  language plpgsql as $fn$
declare
  v_subject text;
begin
  select case when p.session_version = 0 then p.id::text
              else p.id::text || ':' || p.session_version::text end
    into v_subject
    from public.profiles p
   where p.id = p_user and p.status = 'active';
  if v_subject is null then
    raise exception '探针：profile % 不存在或非 active，无法立身份', p_user;
  end if;
  perform set_config('request.headers', jsonb_build_object(
    'x-cwb-user-id', p_user::text,
    'x-cwb-session-signature',
    encode(hmac(v_subject::bytea,
                (select value from private.runtime_secrets where name = 'cwb_auth_secret')::bytea,
                'sha256'), 'hex')
  )::text, true);
end $fn$;

-- ── 夹具：第二个租户 ─────────────────────────────────────────────────────────
-- 只插 organizations / schools 两行（不碰 auth.users，那边有 FK）。
-- 「公司2 的 org_admin」不新造账号，改为在事务内把真实的 org_admin 临时挪进公司2
-- —— 同一个人、同一个签名、只换 organization_id，正反两面用的是同一个身份，
-- 排除了「两个人有什么别的差别」这种解释。
do $fixture$
declare
  v_org2    uuid;
  v_school2 uuid;
begin
  insert into public.organizations (name) values ('__探针公司2__') returning id into v_org2;
  insert into public.schools (org_id, name) values (v_org2, '__探针学校2__') returning id into v_school2;
  perform set_config('probe.fx_org',    v_org2::text,    true);
  perform set_config('probe.fx_school', v_school2::text, true);
end $fixture$;

-- ── 固定几个真实身份 ─────────────────────────────────────────────────────────
select set_config('probe.orgadmin', (
  select p.id::text from public.profiles p where p.role = 'org_admin' and p.status = 'active' limit 1), true);
select set_config('probe.admin', (
  select p.id::text from public.profiles p
   where p.role = 'admin' and p.status = 'active' and p.school_id is not null limit 1), true);
select set_config('probe.admin_school', (
  select p.school_id::text from public.profiles p
   where p.role = 'admin' and p.status = 'active' and p.school_id is not null limit 1), true);
select set_config('probe.own_org', (
  select p.organization_id::text from public.profiles p
   where p.id = nullif(current_setting('probe.orgadmin', true), '')::uuid), true);

-- ══════════════════════════════════════════════════════════════════════════════
-- A · 修复前：公司1 的 org_admin 读公司2 的资产
-- ══════════════════════════════════════════════════════════════════════════════
select pg_temp.act_as(nullif(current_setting('probe.orgadmin', true), '')::uuid);
set local role anon;

select set_config('probe.a_ident', coalesce(public.current_app_user_id()::text, '（NULL，身份没立起来）'), true);
select set_config('probe.a_schools_all', (select count(*)::text from public.schools), true);
select set_config('probe.a_schools_fx',  (select count(*)::text from public.schools
  where id = nullif(current_setting('probe.fx_school', true), '')::uuid), true);
select set_config('probe.a_orgs_all',    (select count(*)::text from public.organizations), true);
select set_config('probe.a_orgs_fx',     (select count(*)::text from public.organizations
  where id = nullif(current_setting('probe.fx_org', true), '')::uuid), true);

reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- B · 只补两条 select 策略的 org_admin 谓词（与迁移 §4 头两条逐字一致）
-- ══════════════════════════════════════════════════════════════════════════════
drop policy if exists "schools_admin_read" on public.schools;
create policy "schools_admin_read" on public.schools for select
  using (
    (
      public.is_org_admin()
      and schools.org_id in (
        select organization_id from public.profiles where id = public.current_app_user_id()
      )
    )
    or exists (
      select 1 from public.profiles me
      where me.id = public.current_app_user_id()
        and me.role = 'admin' and me.school_id = schools.id
    )
  );

drop policy if exists "organizations_admin_read" on public.organizations;
create policy "organizations_admin_read" on public.organizations for select
  using (
    (
      public.is_org_admin()
      and organizations.id in (
        select organization_id from public.profiles where id = public.current_app_user_id()
      )
    )
    or exists (
      select 1 from public.profiles me
      join public.schools s on s.id = me.school_id
      where me.id = public.current_app_user_id()
        and me.role = 'admin' and s.org_id = organizations.id
    )
  );

select pg_temp.act_as(nullif(current_setting('probe.orgadmin', true), '')::uuid);
set local role anon;

select set_config('probe.b_ident', coalesce(public.current_app_user_id()::text, '（NULL）'), true);
select set_config('probe.b_schools_all', (select count(*)::text from public.schools), true);
select set_config('probe.b_schools_own', (select count(*)::text from public.schools
  where org_id = nullif(current_setting('probe.own_org', true), '')::uuid), true);
select set_config('probe.b_schools_fx',  (select count(*)::text from public.schools
  where id = nullif(current_setting('probe.fx_school', true), '')::uuid), true);
-- organizations 这一对是**故意留下的反例**：只改 organizations_admin_read 不够，
-- 因为 organizations_org_admin_all 是 for all，permissive 策略按 OR 合并，它的
-- using (is_org_admin()) 照样把 SELECT 放行。C 段补上那条，这一对才会掉到 1/0。
select set_config('probe.b_orgs_all',    (select count(*)::text from public.organizations), true);
select set_config('probe.b_orgs_fx',     (select count(*)::text from public.organizations
  where id = nullif(current_setting('probe.fx_org', true), '')::uuid), true);

reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- C · 再补 organizations_org_admin_all 的 USING（迁移 §4 第三条）
-- ══════════════════════════════════════════════════════════════════════════════
-- USING 收窄到本公司，WITH CHECK 保持 is_org_admin() 不动：
--   · USING 管 SELECT/UPDATE/DELETE 的行可见性 → 读不到别家、改不动别家
--   · INSERT 只看 WITH CHECK，而新公司的行还不存在、不可能满足「属于我」，
--     把谓词写进 WITH CHECK 会让「建公司」这件事直接失败
drop policy if exists "organizations_org_admin_all" on public.organizations;
create policy "organizations_org_admin_all" on public.organizations
  using (
    public.is_org_admin()
    and organizations.id in (
      select organization_id from public.profiles where id = public.current_app_user_id()
    )
  )
  with check (public.is_org_admin());

select pg_temp.act_as(nullif(current_setting('probe.orgadmin', true), '')::uuid);
set local role anon;

select set_config('probe.c_ident', coalesce(public.current_app_user_id()::text, '（NULL）'), true);
select set_config('probe.c_orgs_all', (select count(*)::text from public.organizations), true);
select set_config('probe.c_orgs_fx',  (select count(*)::text from public.organizations
  where id = nullif(current_setting('probe.fx_org', true), '')::uuid), true);

-- 写路径：改本公司组织名（必须动到行）、改公司2（必须 0 行，且不报错）
do $w$
declare v_own integer; v_fx integer;
begin
  update public.organizations set name = name
   where id = nullif(current_setting('probe.own_org', true), '')::uuid;
  get diagnostics v_own = row_count;
  update public.organizations set name = name
   where id = nullif(current_setting('probe.fx_org', true), '')::uuid;
  get diagnostics v_fx = row_count;
  perform set_config('probe.c_write_own', v_own::text, true);
  perform set_config('probe.c_write_fx',  v_fx::text,  true);
exception when others then
  -- 子事务回滚会丢掉 is_local=true 的 GUC，所以这里必须 is_local=false
  perform set_config('probe.c_write_own', 'ERROR: ' || sqlerrm, false);
  perform set_config('probe.c_write_fx',  'ERROR: ' || sqlerrm, false);
end $w$;

reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- D · 反面：同一个 org_admin 挪进公司2 —— B/C 的 0 必须是谓词造成的
-- ══════════════════════════════════════════════════════════════════════════════
update public.profiles
   set organization_id = nullif(current_setting('probe.fx_org', true), '')::uuid
 where id = nullif(current_setting('probe.orgadmin', true), '')::uuid;

select pg_temp.act_as(nullif(current_setting('probe.orgadmin', true), '')::uuid);
set local role anon;

select set_config('probe.d_ident', coalesce(public.current_app_user_id()::text, '（NULL）'), true);
select set_config('probe.d_schools_fx', (select count(*)::text from public.schools
  where id = nullif(current_setting('probe.fx_school', true), '')::uuid), true);
select set_config('probe.d_schools_own', (select count(*)::text from public.schools
  where org_id = nullif(current_setting('probe.own_org', true), '')::uuid), true);
select set_config('probe.d_orgs_fx', (select count(*)::text from public.organizations
  where id = nullif(current_setting('probe.fx_org', true), '')::uuid), true);

reset role;

update public.profiles
   set organization_id = nullif(current_setting('probe.own_org', true), '')::uuid
 where id = nullif(current_setting('probe.orgadmin', true), '')::uuid;

-- ══════════════════════════════════════════════════════════════════════════════
-- E · 本校 admin 那一支没被收窄打死
-- ══════════════════════════════════════════════════════════════════════════════
select pg_temp.act_as(nullif(current_setting('probe.admin', true), '')::uuid);
set local role anon;

select set_config('probe.e_ident', coalesce(public.current_app_user_id()::text, '（NULL）'), true);
select set_config('probe.e_schools_own', (select count(*)::text from public.schools
  where id = nullif(current_setting('probe.admin_school', true), '')::uuid), true);
select set_config('probe.e_schools_fx', (select count(*)::text from public.schools
  where id = nullif(current_setting('probe.fx_school', true), '')::uuid), true);

reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- F · 裸 anon（没有签名头）必须什么都读不到
-- ══════════════════════════════════════════════════════════════════════════════
select set_config('request.headers', '', true);
set local role anon;
select set_config('probe.f_ident', coalesce(public.current_app_user_id()::text, 'NULL'), true);
select set_config('probe.f_schools', (select count(*)::text from public.schools), true);
select set_config('probe.f_orgs', (select count(*)::text from public.organizations), true);
reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 汇总（db query 只回最后一条语句）
-- ══════════════════════════════════════════════════════════════════════════════
select 检查项, 结果, 期望 from (
  select '0 夹具·公司2 id' as 检查项, coalesce(current_setting('probe.fx_org', true), '（无）') as 结果, '非空' as 期望
  union all select '0 夹具·学校2 id', coalesce(current_setting('probe.fx_school', true), '（无）'), '非空'
  union all select '0 身份·org_admin', coalesce(current_setting('probe.orgadmin', true), '（无）'), '非空'
  union all select '0 身份·本校 admin', coalesce(current_setting('probe.admin', true), '（无）'), '非空'

  union all select 'A0 修复前 anon 解析到的身份', coalesce(current_setting('probe.a_ident', true), '（未执行）'), '= 上面的 org_admin'
  union all select 'A1 修复前 org_admin 可见学校总数', coalesce(current_setting('probe.a_schools_all', true), '（未执行）'), '2（含别家 → 漏洞）'
  union all select 'A2 修复前 org_admin 可见【公司2 的学校】', coalesce(current_setting('probe.a_schools_fx', true), '（未执行）'), '1（跨租户，漏洞）'
  union all select 'A3 修复前 org_admin 可见公司总数', coalesce(current_setting('probe.a_orgs_all', true), '（未执行）'), '2（含别家 → 漏洞）'
  union all select 'A4 修复前 org_admin 可见【公司2】', coalesce(current_setting('probe.a_orgs_fx', true), '（未执行）'), '1（跨租户，漏洞）'

  union all select 'B0 补 select 谓词后 anon 解析到的身份', coalesce(current_setting('probe.b_ident', true), '（未执行）'), '= 上面的 org_admin'
  union all select 'B1 org_admin 可见学校总数', coalesce(current_setting('probe.b_schools_all', true), '（未执行）'), '1（只剩本公司）'
  union all select 'B2 org_admin 可见【本公司学校】', coalesce(current_setting('probe.b_schools_own', true), '（未执行）'), '1（收窄没打死）'
  union all select 'B3 org_admin 可见【公司2 的学校】', coalesce(current_setting('probe.b_schools_fx', true), '（未执行）'), '0 ← schools 修复的意义'
  union all select 'B4 【故意留的反例】只改读策略时可见公司总数', coalesce(current_setting('probe.b_orgs_all', true), '（未执行）'), '2 —— organizations_org_admin_all 仍在放行'
  union all select 'B5 【故意留的反例】只改读策略时可见【公司2】', coalesce(current_setting('probe.b_orgs_fx', true), '（未执行）'), '1 —— 所以下面第三条策略是必需的'

  union all select 'C0 补 for all 策略后 anon 解析到的身份', coalesce(current_setting('probe.c_ident', true), '（未执行）'), '= 同一个 org_admin'
  union all select 'C1 org_admin 可见公司总数', coalesce(current_setting('probe.c_orgs_all', true), '（未执行）'), '1'
  union all select 'C2 org_admin 可见【公司2】', coalesce(current_setting('probe.c_orgs_fx', true), '（未执行）'), '0 ← organizations 修复的意义'
  union all select 'C3 写·org_admin 改本公司组织（行数）', coalesce(current_setting('probe.c_write_own', true), '（未执行）'), '1（写路径没被打死）'
  union all select 'C4 写·org_admin 改公司2组织（行数）', coalesce(current_setting('probe.c_write_fx', true), '（未执行）'), '0'

  union all select 'D0 反面时 anon 解析到的身份', coalesce(current_setting('probe.d_ident', true), '（未执行）'), '= 同一个 org_admin'
  union all select 'D1 挪进公司2 后可见【公司2 的学校】', coalesce(current_setting('probe.d_schools_fx', true), '（未执行）'), '1（证明 B3 的 0 不是死路）'
  union all select 'D2 挪进公司2 后可见【公司1 的学校】', coalesce(current_setting('probe.d_schools_own', true), '（未执行）'), '0（对称，另一面）'
  union all select 'D3 挪进公司2 后可见【公司2】', coalesce(current_setting('probe.d_orgs_fx', true), '（未执行）'), '1'

  union all select 'E0 本校 admin anon 解析到的身份', coalesce(current_setting('probe.e_ident', true), '（未执行）'), '= 上面的 admin'
  union all select 'E1 本校 admin 可见本校', coalesce(current_setting('probe.e_schools_own', true), '（未执行）'), '1'
  union all select 'E2 本校 admin 可见【公司2 的学校】', coalesce(current_setting('probe.e_schools_fx', true), '（未执行）'), '0'

  union all select 'F0 裸 anon 解析到的身份', coalesce(current_setting('probe.f_ident', true), '（未执行）'), 'NULL'
  union all select 'F1 裸 anon 可见学校', coalesce(current_setting('probe.f_schools', true), '（未执行）'), '0'
  union all select 'F2 裸 anon 可见公司', coalesce(current_setting('probe.f_orgs', true), '（未执行）'), '0'
) report
order by 检查项;

rollback;
