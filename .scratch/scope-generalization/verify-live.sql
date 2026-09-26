-- ═══════════════════════════════════════════════════════════════════════════
-- 教学作用域改造的线上验证（只读，整段 rollback，自带身份模拟）
-- ═══════════════════════════════════════════════════════════════════════════
-- 跑法（CLI 直连云端，走 Management API，不需要 DB 密码、不需要 Docker、不开 Studio）：
--     cd web && supabase db query --linked -f ../.scratch/scope-generalization/verify-live.sql
--
-- 覆盖 20260926110000 / 20260926111000 两条迁移落地后的真实行为。
--
-- 为什么 CI 绿了还不算完：`supabase db push` 只执行 DDL，**不求值策略**，
-- 也**不做写路径求值**。下面几类错误它一个都抓不到：
--   · 策略递归   infinite recursion detected in policy（求值期才炸）
--   · 收窄过头   学生读不到自己的会话 —— 直接生产事故
--   · 跨租户     公司级管理员读到别家公司的数据
--   · 写路径     add_class_membership 在真实身份下能不能插入
--   · 静默空集   无班级学生的数据「读不到」和「确实没有」长得一模一样
--
-- 沿用 .scratch/multi-space-tenancy/verify-live.sql 的两个约定：
--   1) db query 只回最后一条语句的结果集，结论写进 GUC，末尾一条 select 汇总。
--   2) 必须 set local role anon —— 直连进来的是 postgres，它绕过 RLS。

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

-- ── 固定身份 ────────────────────────────────────────────────────────────────
select set_config('probe.student', coalesce((
  select c.owner_id::text from public.conversations c
    join public.profiles p on p.id = c.owner_id
   where p.role = 'student' and c.class_id is not null
   group by c.owner_id order by count(*) desc limit 1), ''), true);
select set_config('probe.teacher', coalesce((
  select cm.profile_id::text from public.class_memberships cm
   where cm.role = 'teacher' limit 1), ''), true);
select set_config('probe.admin', coalesce((
  select p.id::text from public.profiles p
   where p.role = 'admin' and p.status = 'active' limit 1), ''), true);
select set_config('probe.orgadmin', coalesce((
  select p.id::text from public.profiles p
   where p.role = 'org_admin' and p.status = 'active' limit 1), ''), true);

-- 0 · schema 到位（不依赖身份，先查）
select set_config('probe.s0_multi_class_idx_gone', (
  select case when to_regclass('public.class_memberships_one_student_class_idx') is null then '是' else '否' end), true);
select set_config('probe.s0_primary_idx', (
  select case when exists (select 1 from pg_indexes
    where schemaname='public' and indexname='class_memberships_primary_student_idx') then '是' else '否' end), true);
select set_config('probe.s0_audit_class_nullable', (
  select case when is_nullable='YES' then '是' else '否（仍是 NOT NULL）' end
    from information_schema.columns
   where table_schema='public' and table_name='audit_records' and column_name='class_id'), true);
select set_config('probe.s0_school_anchor_filled', (
  select case when count(*) filter (where school_id is null) = 0 then '全部有 school_id'
              else '仍有 ' || count(*) filter (where school_id is null)::text || ' 行缺 school_id' end
    from public.conversations), true);
select set_config('probe.s0_multi_primary_violation', (
  select coalesce(count(*)::text, '0') from (
    select profile_id from public.class_memberships
     where role='student' and is_primary
     group by profile_id having count(*) > 1) x), true);

-- 1 · 学生读自己的会话：> 0 = 没误伤；无策略递归
select pg_temp.act_as(nullif(current_setting('probe.student', true), '')::uuid);
set local role anon;
select set_config('probe.p01_identity', coalesce(public.current_app_user_id()::text, 'NULL —— 身份没立起来'), true);
select set_config('probe.p01_student_sees_own_conv', (select count(*)::text from public.conversations), true);
select set_config('probe.p01_student_sees_own_msg', (select count(*)::text from public.conversation_messages), true);
-- 自己的项目是否带上了 school_id 锚点
select set_config('probe.p01_own_project_has_anchor', (
  select case when count(*) filter (where school_id is not null) = count(*) and count(*) > 0
              then '是' else '否（' || count(*)::text || ' 个项目）' end
    from public.projects where owner_id = public.current_app_user_id()), true);
reset role;

-- 2 · 校管理员读本校会话：锚点换学校后，管理员不再依赖 class_id
select pg_temp.act_as(nullif(current_setting('probe.admin', true), '')::uuid);
set local role anon;
select set_config('probe.p02_admin_sees_school_conv', (select count(*)::text from public.conversations), true);
select set_config('probe.p02_admin_sees_practice', (select count(*)::text from public.practice_records), true);
select set_config('probe.p02_admin_sees_audit', (select count(*)::text from public.audit_records), true);
reset role;

-- 3 · 教师读学生会话：并存集（任教班级 ∪ 自己拥有的空间）
select pg_temp.act_as(nullif(current_setting('probe.teacher', true), '')::uuid);
set local role anon;
select set_config('probe.p03_teacher_sees_conv', (select count(*)::text from public.conversations), true);
select set_config('probe.p03_teacher_sees_practice', (select count(*)::text from public.practice_records), true);
select set_config('probe.p03_teacher_space_fn_exec', (
  select case when has_function_privilege('anon', 'public.teacher_can_access_space(uuid)'::regprocedure, 'execute')
              then '是' else '否 —— 教师侧会 42501' end), true);
reset role;

-- 4 · 跨租户：org_admin 读不到外公司的会话（新增的 school_id 分支不能开天窗）
select pg_temp.act_as(nullif(current_setting('probe.orgadmin', true), '')::uuid);
set local role anon;
select set_config('probe.p04_orgadmin_own_conv', (select count(*)::text from public.conversations), true);
-- 外公司会话数量：> 0 且上面也 > 0 才说明确实有别的公司数据可读
select set_config('probe.p04_cross_company_conv_total', (
  select count(*)::text from public.conversations c
    join public.profiles p on p.id = c.owner_id
   where p.school_id is null
      or p.school_id not in (select s.id from public.schools s
                              where s.org_id in (select me.organization_id from public.profiles me
                                                  where me.id = public.current_app_user_id()))), true);
reset role;

-- 5 · 写路径：多重班级归属（事务内插入，随即回滚）
select pg_temp.act_as(nullif(current_setting('probe.admin', true), '')::uuid);
set local role anon;

-- 5a · 同一学生可以同时属于两个班
select set_config('probe.p05_student', coalesce((
  select cm.profile_id::text from public.class_memberships cm
    join public.classes c on c.id = cm.class_id
   where cm.role='student' group by cm.profile_id
   having count(*) = 1 limit 1), ''), true);
select set_config('probe.p05_other_class', coalesce((
  select c.id::text from public.classes c
   where c.school_id = (select p.school_id from public.profiles p
                         where p.id = nullif(current_setting('probe.p05_student', true),'')::uuid)
     and c.id not in (select cm.class_id from public.class_memberships cm
                       where cm.profile_id = nullif(current_setting('probe.p05_student', true),'')::uuid)
   limit 1), ''), true);
select set_config('probe.p05_second_class_add', coalesce((
  select public.add_class_membership(
    nullif(current_setting('probe.p05_student', true),'')::uuid,
    nullif(current_setting('probe.p05_other_class', true),'')::uuid,
    false)::text), '跳过：找不到可加入的第二个班级'), true);
select set_config('probe.p05_membership_count_now', (
  select count(*)::text from public.class_memberships
   where profile_id = nullif(current_setting('probe.p05_student', true),'')::uuid and role='student'), true);
select set_config('probe.p05_replay_idempotent', coalesce((
  select public.add_class_membership(
    nullif(current_setting('probe.p05_student', true),'')::uuid,
    nullif(current_setting('probe.p05_other_class', true),'')::uuid,
    false)::text), '跳过'), true);
select set_config('probe.p05_remove_one', coalesce((
  select public.remove_class_membership(
    nullif(current_setting('probe.p05_student', true),'')::uuid,
    nullif(current_setting('probe.p05_other_class', true),'')::uuid)::text), '跳过'), true);
select set_config('probe.p05_membership_count_after_remove', (
  select count(*)::text from public.class_memberships
   where profile_id = nullif(current_setting('probe.p05_student', true),'')::uuid and role='student'), true);
-- 移除后项目/会话的 class_id 不应被动过（增量路径承诺「不动历史」）
select set_config('probe.p05_history_class_intact', (
  select case when count(*) filter (where class_id is not null) = count(*) and count(*) > 0
              then '是' else '否（' || count(*)::text || ' 个项目）' end
    from public.projects
   where owner_id = nullif(current_setting('probe.p05_student', true),'')::uuid), true);

-- 5b · 老师能看到无班级学生的会话吗（空间分支）
select set_config('probe.p05_classless_student', coalesce((
  select p.id::text from public.profiles p
   where p.role = 'student' and p.status = 'active'
     and not exists (select 1 from public.class_memberships cm
                      where cm.profile_id = p.id and cm.role = 'student')
     and exists (select 1 from public.conversations c where c.owner_id = p.id)
   limit 1), ''), true);
select set_config('probe.p05_classless_conv_count', (
  select count(*)::text from public.conversations
   where owner_id = nullif(current_setting('probe.p05_classless_student', true),'')::uuid), true);
reset role;

select set_config('probe.p05b_admin_sees_classless', '待查', true);
select pg_temp.act_as(nullif(current_setting('probe.admin', true), '')::uuid);
set local role anon;
select set_config('probe.p05b_admin_sees_classless', (
  select case when current_setting('probe.p05_classless_student', true) = '' then '无此样本，跳过'
              when count(*) > 0 then '是（读到 ' || count(*)::text || ' 条）'
              else '否 —— 仍然对管理员不可见' end
    from public.conversations
   where owner_id = nullif(current_setting('probe.p05_classless_student', true),'')::uuid), true);
reset role;

-- ── 汇总 ────────────────────────────────────────────────────────────────────
select
  '0  schema'            as 分区, '多班级旧索引已删除'      as 检查项, current_setting('probe.s0_multi_class_idx_gone') as 结果
union all select '0  schema', '主班部分唯一索引存在',            current_setting('probe.s0_primary_idx')
union all select '0  schema', 'audit_records.class_id 可空',      current_setting('probe.s0_audit_class_nullable')
union all select '0  schema', 'conversations.school_id 回填',     current_setting('probe.s0_school_anchor_filled')
union all select '0  schema', '多主班违例数（应为 0）',            current_setting('probe.s0_multi_primary_violation')
union all select '1  学生',   '身份是否立起来',                 current_setting('probe.p01_identity')
union all select '1  学生',   '读到自己会话（>0 未误伤）',         current_setting('probe.p01_student_sees_own_conv')
union all select '1  学生',   '读到自己消息',                   current_setting('probe.p01_student_sees_own_msg')
union all select '1  学生',   '自己的项目带 school_id 锚点',        current_setting('probe.p01_own_project_has_anchor')
union all select '2  校admin','按学校锚点读会话',                current_setting('probe.p02_admin_sees_school_conv')
union all select '2  校admin','读挑战记录',                     current_setting('probe.p02_admin_sees_practice')
union all select '2  校admin','读核实记录',                     current_setting('probe.p02_admin_sees_audit')
union all select '3  教师',   '读会话（班级 ∪ 空间并存集）',        current_setting('probe.p03_teacher_sees_conv')
union all select '3  教师',   '读挑战记录（本次新开的一路）',        current_setting('probe.p03_teacher_sees_practice')
union all select '3  教师',   'teacher_can_access_space 可执行',   current_setting('probe.p03_teacher_space_fn_exec')
union all select '4  跨租户', 'orgadmin 读本公司会话',           current_setting('probe.p04_orgadmin_own_conv')
union all select '4  跨租户', '外公司会话总数（对照项）',          current_setting('probe.p04_cross_company_conv_total')
union all select '5  多重班', '加入第二个班返回行数（1=新增）',       current_setting('probe.p05_second_class_add')
union all select '5  多重班', '加入后班级关系数',                 current_setting('probe.p05_membership_count_now')
union all select '5  多重班', '重复加入（0=幂等，非失败）',         current_setting('probe.p05_replay_idempotent')
union all select '5  多重班', '移出返回行数',                     current_setting('probe.p05_remove_one')
union all select '5  多重班', '移出后班级关系数（应回到 1）',       current_setting('probe.p05_membership_count_after_remove')
union all select '5  多重班', '历史项目 class_id 未被动过',         current_setting('probe.p05_history_class_intact')
union all select '5b 无班级', '无班级学生的会话数',               current_setting('probe.p05_classless_conv_count')
union all select '5b 无班级', '管理员是否读得到（修复目标）',        current_setting('probe.p05b_admin_sees_classless');

rollback;
