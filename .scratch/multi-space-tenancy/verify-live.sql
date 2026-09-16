-- ══════════════════════════════════════════════════════════════════════════════
-- 迁移落地后的线上验证（Supabase Studio → SQL Editor，整段执行，只读）
-- ══════════════════════════════════════════════════════════════════════════════
-- 覆盖 20260916152531 / 20260916160943 / 20260916164331 三条迁移落地后的真实行为。
-- 整段包在 begin … rollback 里：不改任何数据，探针自己也会被回滚。
--
-- 为什么 CI 绿了还不算完：`supabase db push` 只执行 DDL，**不求值策略**。
-- 下面这四类错误它一个都抓不到，只有真读一次才暴露：
--   · 策略递归  infinite recursion detected in policy（本仓最贵的坑，求值期才炸）
--   · 收窄过头  学生读不到自己的会话 —— 那是一场直接的生产事故
--   · 跨租户   org_admin 仍能读外公司的会话消息（本次要修的那条）
--   · 写路径   create_space / pull_class_into_space 在实际身份下能否插进去
--             （INSERT 的 WITH CHECK 用语句开始时的快照求值，回查表的函数恒假 ——
--               classes 上已经踩过一次，见 20260916160943）
--
-- 身份模拟：本仓身份来自 request.headers 的 x-cwb-user-id + HMAC 签名
-- （current_app_user_id，baseline:143）。Studio 里没有这些头，所以下面手工注入一对合法值；
-- 并且必须 set local role anon —— postgres 会绕过 RLS，不切角色等于没测。

begin;

create or replace function pg_temp.act_as(p_user uuid) returns void
  language plpgsql as $fn$
begin
  perform set_config('request.headers', jsonb_build_object(
    'x-cwb-user-id', p_user::text,
    'x-cwb-session-signature',
    encode(hmac(p_user::text::bytea,
                (select value from private.runtime_secrets where name = 'cwb_auth_secret')::bytea,
                'sha256'), 'hex')
  )::text, true);
end $fn$;

-- 固定几个真实身份，供下面复用。用临时表而不是变量：Studio 没有变量，
-- 而切到 anon 之后就读不到全表了。
create temp table probe_case on commit drop as
select
  (select c.owner_id from public.conversations c
     join public.profiles p on p.id = c.owner_id
    where p.role = 'student'
    group by c.owner_id order by count(*) desc limit 1) as student_id,
  (select cm.profile_id from public.class_memberships cm
    where cm.role = 'teacher' limit 1) as teacher_id,
  (select p.id from public.profiles p
    where p.role = 'org_admin' and p.status = 'active' limit 1) as org_admin_id,
  (select c.id from public.conversations c
     join public.profiles o on o.id = c.owner_id
    where o.organization_id is distinct from
          (select p.organization_id from public.profiles p
            where p.role = 'org_admin' and p.status = 'active' limit 1)
    limit 1) as foreign_conversation_id;

select 'B0 探针身份' as 检查项, student_id as 学生, teacher_id as 教师,
       org_admin_id as org管理员, foreign_conversation_id as 外公司会话
  from pg_temp.probe_case;
-- 期望：四个都有值。foreign_conversation_id 为 null 说明库里没有跨公司数据，
-- 那么 C 项等于没验到，需要在报告里写明「未覆盖」。

-- ══════════════════════════════════════════════════════════════════════════════
-- A · 目录态：策略、旧策略是否消失、anon EXECUTE 清单
-- ══════════════════════════════════════════════════════════════════════════════

select 'A1 会话读策略' as 检查项, tablename as 表, policyname as 策略, cmd as 命令
  from pg_policies
 where schemaname = 'public' and tablename in ('conversations', 'conversation_messages')
 order by tablename, cmd, policyname;
-- 期望：conversations_teacher_read **不出现**；conversations_read 与
--       messages_conversation_scope 都在。

select 'A2 空间策略' as 检查项, policyname as 策略, cmd as 命令
  from pg_policies where schemaname = 'public' and tablename = 'spaces'
 order by cmd, policyname;
-- 期望：恰好 3 条（select / insert / update），**没有 delete** —— 空间只归档。

-- 该保留 anon EXECUTE 的函数：必须一个都不缺。
-- 任何一个缺失都意味着线上对应功能当场 42501（运行角色就是 anon）。
select 'A3 KEEP 缺 anon EXECUTE' as 检查项,
       coalesce(string_agg(p.proname, ', ' order by p.proname), '无（全部正常）') as 缺失函数
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = any(array[
     'current_app_user_id','current_school_id','current_profile_role','is_admin','is_org_admin',
     'has_valid_app_session_signature','can_admin_class','can_admin_profile','can_admin_school_scope',
     'can_read_school_scope','teacher_can_access_class','is_my_space','can_manage_space',
     'can_manage_space_row','space_class_same_school','can_read_conversation',
     'authenticate_school_account_v3','change_own_password','update_own_avatar',
     'provision_school_account','set_initial_password_by_profile','get_model_tier_provider',
     'get_provider_capability_provider','get_role_mcp_servers','is_student_conversation_finalized',
     'match_document_chunks','match_conversation_document_chunks','save_model_tier_binding_and_sync',
     'save_scenario_tier_bindings_and_sync','write_app_log_event','create_space','pull_class_into_space'])
   and not has_function_privilege('anon', p.oid, 'execute');

-- 该收回的函数：必须全是 f。
select 'A4 REVOKE 仍对 anon 开放' as 检查项,
       coalesce(string_agg(p.proname, ', ' order by p.proname), '无（全部已收回）') as 未收回函数
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = any(array[
     'refresh_project_highest_bloom_level','get_profile','rls_auto_enable',
     'authenticate_school_account','authenticate_school_account_v2','authenticate_user',
     'rebuild_scenario_provider_capabilities','clear_school_model_tier_binding',
     'sync_project_contract','validate_conversation_contract','validate_space_contract'])
   and has_function_privilege('anon', p.oid, 'execute');

-- 建班的写侧不能再回退成按 id 回查表（INSERT 恒假，建班直接不可用）。
select 'A5 建班写侧条件' as 检查项, coalesce(with_check::text, '(无)') as 写侧条件
  from pg_policies
 where schemaname = 'public' and tablename = 'classes' and policyname = 'classes_app_admin_all';

select 'A6 还有多少班级没归属学校' as 检查项, count(*) as 数量
  from public.classes where school_id is null;
-- 期望：0。不为 0 的班拉不进空间（space_class_same_school 等值失败），需人工补归属。

-- ══════════════════════════════════════════════════════════════════════════════
-- B · 学生读自己的会话：不炸 = 无策略递归；> 0 = 没误伤
-- ══════════════════════════════════════════════════════════════════════════════

select pg_temp.act_as((select student_id from pg_temp.probe_case));
set local role anon;

select 'B1 学生可见' as 检查项,
       (select count(*) from public.conversations) as 自己的会话数,
       (select count(*) from public.conversation_messages) as 自己的消息数;
-- 期望：两个都 > 0，且整条语句不报
--       infinite recursion detected in policy for relation "conversations"

reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- C · 跨租户：org_admin 读不到外公司的会话消息（本次修复的那条）
-- ══════════════════════════════════════════════════════════════════════════════

select pg_temp.act_as((select org_admin_id from pg_temp.probe_case));
set local role anon;

select 'C1 跨公司越权' as 检查项, count(*) as 外公司可见消息数
  from public.conversation_messages
 where conversation_id = (select foreign_conversation_id from pg_temp.probe_case);
-- 期望：0。修复前这里是 > 0 —— 就是那条跨租户读通路。

reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- D · 写路径：以真实教师身份建空间 + 拉班（插入失败会被 savepoint 抓住，不炸整段）
-- ══════════════════════════════════════════════════════════════════════════════

select pg_temp.act_as((select teacher_id from pg_temp.probe_case));
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
  raise notice 'D1 写路径 OK：create_space 返回 %，该班已拉入', v_id;

  -- 幂等复查：同名再调一次应复用同一个空间，不该建出第二个。
  if public.create_space('__探针空间（跑完即回滚）__', '', null) <> v_id then
    raise notice 'D2 幂等 FAILED：同名复用没有返回同一个 space id';
  else
    raise notice 'D2 幂等 OK：同名复用返回同一个 space id';
  end if;
exception when others then
  raise notice 'D 写路径 FAILED：% (sqlstate %)', sqlerrm, sqlstate;
end $probe$;

reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 一切归零
-- ══════════════════════════════════════════════════════════════════════════════
rollback;
