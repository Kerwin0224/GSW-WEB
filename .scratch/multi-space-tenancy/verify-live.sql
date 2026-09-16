-- ══════════════════════════════════════════════════════════════════════════════
-- 迁移落地后的线上验证（只读，整段 rollback，自带身份模拟）
-- ══════════════════════════════════════════════════════════════════════════════
-- 跑法（CLI 直连云端，走 Management API，不需要 DB 密码、不需要 Docker、不开 Studio）：
--     cd web && supabase db query --linked -f ../.scratch/multi-space-tenancy/verify-live.sql
--
-- 覆盖 20260916152531 / 20260916160943 / 20260916164331 三条迁移落地后的真实行为。
--
-- 为什么 CI 绿了还不算完：`supabase db push` 只执行 DDL，**不求值策略**。
-- 下面四类错误它一个都抓不到，只有真读一次才暴露：
--   · 策略递归  infinite recursion detected in policy（本仓最贵的坑，求值期才炸）
--   · 收窄过头  学生读不到自己的会话 —— 那是一场直接的生产事故
--   · 跨租户   org_admin 仍能读外公司的会话消息（本次要修的那条）
--   · 写路径   create_space / pull_class_into_space 在实际身份下能否插进去
--             （INSERT 的 WITH CHECK 用语句开始时的快照求值，回查表的函数恒假 ——
--               classes 上已经踩过一次，见 20260916160943）
--
-- ── 两个必须绕开的坑（都是实际踩出来的）──────────────────────────────────
-- 1) `db query` 只回**最后一条语句**的结果集，中间的 select 与 raise notice 都不显示。
--    所以各段把结论写进 GUC，末尾用一条 select 汇总成一张表。
-- 2) 汇总不能用临时表：临时表要额外 grant 给 anon，而 temp schema 的名字
--    （pg_temp_43）每个会话都不同，按 pg_temp.x 授权不生效，anon 一读就 42501。
--    GUC 任何角色都能读写，没有授权问题。
--
-- 身份模拟：本仓身份来自 request.headers 的 x-cwb-user-id + HMAC 签名
-- （current_app_user_id，baseline:143）。这里手工注入一对合法值；并且必须
-- set local role anon —— 直连进来的是 postgres，它会绕过 RLS，不切角色等于没测。

begin;

-- 签名口径**必须**与库里那份 has_valid_app_session_signature 逐字一致：
--     subject = session_version = 0 ? id::text : id::text || ':' || session_version::text
-- 只签 id::text 是最容易犯的错——签名对不上时 has_valid_app_session_signature 返回 false，
-- current_app_user_id() 静默回落到 auth.uid()（直连时是 NULL），于是下面的探针全都读到 0，
-- 看上去像「策略收窄过头」，实际是身份根本没立起来。所以这里照抄库里的规则，
-- 并且额外把 anon 视角下解析到的身份打出来（见汇总表的 0 号行）。
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

-- ── 固定几个真实身份 ────────────────────────────────────────────────────────
select set_config('probe.student', coalesce((
  select c.owner_id::text from public.conversations c
    join public.profiles p on p.id = c.owner_id
   where p.role = 'student'
   group by c.owner_id order by count(*) desc limit 1), ''), true);
select set_config('probe.teacher', coalesce((
  select cm.profile_id::text from public.class_memberships cm
   where cm.role = 'teacher' limit 1), ''), true);
select set_config('probe.orgadmin', coalesce((
  select p.id::text from public.profiles p
   where p.role = 'org_admin' and p.status = 'active' limit 1), ''), true);
-- 一条「管理员本该公司看得到」的真实会话：class_id 非空，can_admin_class 这一支才有意义
select set_config('probe.own_conv', coalesce((
  select c.id::text from public.conversations c
   where c.class_id is not null
   order by c.created_at desc limit 1), ''), true);

-- ── B · 学生读自己的会话：不炸 = 无策略递归；> 0 = 没误伤 ────────────────────
select pg_temp.act_as(nullif(current_setting('probe.student', true), '')::uuid);
set local role anon;

-- 身份自证：拿不到身份时下面全是 0，那就不是「策略收窄过头」，是探针坏了。
select set_config('probe.b_ident', coalesce(public.current_app_user_id()::text, '（NULL —— 身份没立起来，B1/C1 的数字无意义）'), true);
select set_config('probe.b_conv', (select count(*)::text from public.conversations), true);
select set_config('probe.b_msg', (select count(*)::text from public.conversation_messages), true);
select set_config('probe.b_spaces', (select count(*)::text from public.spaces), true);

reset role;

-- ── C · 跨租户：org_admin 读不到外公司的会话消息（本次修复的那条）────────────
select pg_temp.act_as(nullif(current_setting('probe.orgadmin', true), '')::uuid);
set local role anon;

select set_config('probe.c_foreign', (select count(*)::text from public.conversation_messages
  where conversation_id = nullif(current_setting('probe.foreign', true), '')::uuid), true);
-- 期望 0。修复前这里 > 0 —— 就是那条跨租户读通路。

reset role;

-- ── C2 · 二租户夹具：生产库只有 1 家公司，C1 的 0 是空的 ────────────────────
-- 「org_admin 读不到外公司消息」不能只在结构上成立（策略文本里没有 is_admin 了），
-- 得真的跨一次公司读一次。生产库只有一个公司、一个学校，所以现造第二个租户。
-- 整段在同一个 begin…rollback 里，库里不留痕迹。
--
-- 两处踩出来的约束：
--   · profiles.id 有 FK 到 auth.users —— 不为探针往 auth schema 插行，
--     改为**借一个真实学生**，临时把他挪进探针班（一个学生只能属一个班，
--     唯一索引拦着），rollback 后原样复原。
--   · validate_conversation_contract 强制「老师会话不能绑班、学生会话必须是
--     student_chat」，所以会话只能由学生拥有、且 class_id 必须是他在的班。
do $fixture$
declare
  v_org uuid; v_school uuid; v_class uuid; v_conv uuid; v_student uuid;
begin
  insert into public.organizations (name) values ('__探针公司2__') returning id into v_org;
  insert into public.schools (org_id, name) values (v_org, '__探针学校2__') returning id into v_school;
  insert into public.classes (name, school_id) values ('__探针班2__', v_school) returning id into v_class;

  select c.owner_id into v_student
    from public.conversations c join public.profiles p on p.id = c.owner_id
   where p.role = 'student' group by c.owner_id order by count(*) desc limit 1;

  delete from public.class_memberships where profile_id = v_student and role = 'student';
  insert into public.class_memberships (class_id, profile_id, role) values (v_class, v_student, 'student');

  insert into public.conversations (owner_id, class_id, source, title)
    values (v_student, v_class, 'student_chat', '__探针会话2__') returning id into v_conv;
  insert into public.conversation_messages (conversation_id, role, content)
    values (v_conv, 'user', '__探针消息：只有公司2 的人该看得到__');

  perform set_config('probe.fx_conv', v_conv::text, true);
  perform set_config('probe.fx_student', v_student::text, true);
end $fixture$;

-- C2c 学生本人读自己那条：必须 > 0 —— 否则 0 是「夹具本身没人读得到」的假象
select pg_temp.act_as(nullif(current_setting('probe.fx_student', true), '')::uuid);
set local role anon;
select set_config('probe.c2_student', (select count(*)::text from public.conversation_messages
  where conversation_id = nullif(current_setting('probe.fx_conv', true), '')::uuid), true);
reset role;

-- C2a 公司1 的管理员读**本公司**的真实会话：必须 > 0
-- —— 证明收窄没有把管理员这个分支整个打死，只是按公司收敛了
select pg_temp.act_as(nullif(current_setting('probe.orgadmin', true), '')::uuid);
set local role anon;
select set_config('probe.c2_own', (select count(*)::text from public.conversation_messages
  where conversation_id = nullif(current_setting('probe.own_conv', true), '')::uuid), true);

-- C2b 同一个管理员读**公司2**那条：必须 0 —— 本次修复的全部意义
select set_config('probe.c2_foreign', (select count(*)::text from public.conversation_messages
  where conversation_id = nullif(current_setting('probe.fx_conv', true), '')::uuid), true);
reset role;

-- ── D · 写路径：以真实教师身份建空间 + 拉班 ─────────────────────────────────
select pg_temp.act_as(nullif(current_setting('probe.teacher', true), '')::uuid);
set local role anon;

do $probe$
declare
  v_id uuid;
begin
  v_id := public.create_space(
    '__探针空间（跑完即回滚）__',
    '探针口径：只验写路径，不参与任何真实归类。',
    (select cm.class_id from public.class_memberships cm
      where cm.profile_id = public.current_app_user_id() and cm.role = 'teacher' limit 1)
  );
  perform set_config('probe.d_create', 'OK，space id = ' || v_id::text, true);
  perform set_config('probe.d_idem',
    case when public.create_space('__探针空间（跑完即回滚）__', '', null) = v_id
         then 'OK，同名复用同一个 id' else 'FAILED，同名建出了第二个空间' end, true);
exception when others then
  perform set_config('probe.d_create', 'FAILED：' || sqlerrm || ' (sqlstate ' || sqlstate || ')', true);
end $probe$;

reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 汇总：db query 只回最后一条语句的结果集，所以全部结论在这里合成一张表
-- ══════════════════════════════════════════════════════════════════════════════

select 检查项, 结果 from (
  select '0 探针身份·学生' as 检查项, coalesce(nullif(current_setting('probe.student', true), ''), '（无，库中没有学生会话）') as 结果
  union all select '0 探针身份·教师', coalesce(nullif(current_setting('probe.teacher', true), ''), '（无）')
  union all select '0 探针身份·org管理员', coalesce(nullif(current_setting('probe.orgadmin', true), ''), '（无，C 项未覆盖）')
  union all select '0 探针身份·本公司对照会话', coalesce(nullif(current_setting('probe.own_conv', true), ''), '（无绑定班级的会话，C2a 未覆盖）')

  union all select 'A1 conversations 读策略', string_agg(policyname, ' | ' order by policyname)
    from pg_policies where schemaname='public' and tablename='conversations' and cmd in ('SELECT','ALL')
  union all select 'A1 子表读策略', string_agg(policyname, ' | ' order by policyname)
    from pg_policies where schemaname='public' and tablename='conversation_messages' and cmd='SELECT'
  union all select 'A1 conversations_teacher_read（应为空）', coalesce(string_agg(policyname, ', '), '（已移除 ✓）')
    from pg_policies where schemaname='public' and tablename='conversations' and policyname='conversations_teacher_read'
  union all select 'A2 spaces 策略数（应 3、无 DELETE）',
    (select count(*)::text from pg_policies where schemaname='public' and tablename='spaces')
    || ' 条；DELETE ' || (select count(*)::text from pg_policies where schemaname='public' and tablename='spaces' and cmd='DELETE') || ' 条'

  union all select 'A3 KEEP 缺 anon EXECUTE（应为空）', coalesce(string_agg(p.proname, ', ' order by p.proname), '（无 ✓）')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public'
     and p.proname = any(array[
       'current_app_user_id','current_school_id','current_profile_role','is_admin','is_org_admin',
       'can_admin_class','can_admin_profile','can_admin_school_scope','can_read_school_scope',
       'teacher_can_access_class','is_my_space','can_manage_space','can_manage_space_row',
       'space_class_same_school','can_read_conversation','authenticate_school_account_v3',
       'change_own_password','update_own_avatar','provision_school_account',
       'set_initial_password_by_profile','get_model_tier_provider','get_provider_capability_provider',
       'get_role_mcp_servers','is_student_conversation_finalized','match_document_chunks',
       'match_conversation_document_chunks','save_model_tier_binding_and_sync',
       'save_scenario_tier_bindings_and_sync','write_app_log_event','create_space','pull_class_into_space'])
     and not has_function_privilege('anon', p.oid, 'execute')
  union all select 'A4 REVOKE 仍对 anon 开放（应为空）', coalesce(string_agg(p.proname, ', ' order by p.proname), '（无 ✓）')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public'
     and p.proname = any(array[
       'refresh_project_highest_bloom_level','get_profile','rls_auto_enable',
       'authenticate_school_account','authenticate_school_account_v2','authenticate_user',
       'rebuild_scenario_provider_capabilities','clear_school_model_tier_binding',
       'has_valid_app_session_signature','sync_project_contract','validate_conversation_contract',
       'validate_space_contract'])
     and has_function_privilege('anon', p.oid, 'execute')
  union all select 'A5 建班写侧（不应含 can_admin_class(id)）',
    coalesce((select with_check::text from pg_policies where schemaname='public' and tablename='classes' and policyname='classes_app_admin_all'), '（策略缺失！）')
  union all select 'A6 无学校归属的班级数', (select count(*)::text from public.classes where school_id is null)

  union all select 'B0b anon 视角解析到的身份（必须是上面那个学生）', current_setting('probe.b_ident', true)
  union all select 'B1 学生可见会话/消息/空间（应均 > 0）',
    current_setting('probe.b_conv', true) || ' / ' || current_setting('probe.b_msg', true)
    || ' / ' || current_setting('probe.b_spaces', true)
    || '  ← 没报 infinite recursion 就说明策略无环'
  union all select 'C1 真实数据跨公司可见数（生产单租户，恒 0 无信息量）', current_setting('probe.c_foreign', true)
  -- C2 是本次修复的核心证据：同一个管理员、同一个谓词，本公司 > 0、外公司 = 0。
  union all select 'C2c 夹具学生读自己那条（应 > 0，证明夹具真实可读）', coalesce(current_setting('probe.c2_student', true), '（未执行）')
  union all select 'C2a 公司1 管理员读本公司会话（应 > 0）', coalesce(current_setting('probe.c2_own', true), '（未执行）')
  union all select 'C2b 公司1 管理员读公司2 会话（必须 0 ← 修复的意义）', coalesce(current_setting('probe.c2_foreign', true), '（未执行）')
  union all select 'D1 create_space 写路径', coalesce(current_setting('probe.d_create', true), '（未执行：无教师身份）')
  union all select 'D2 同名幂等', coalesce(current_setting('probe.d_idem', true), '（未执行）')
) report
order by 检查项;

rollback;
