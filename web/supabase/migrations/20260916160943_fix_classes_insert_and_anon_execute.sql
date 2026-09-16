-- 存量高危修复：建班不可用 + security definer 函数对匿名角色开放。
--
-- 两条都是本次做「空间」功能时顺出来的既有缺陷，与空间本身无关，但都在同一条链路上。
-- 分两个互不依赖的段落，任何一段单独回滚都不影响另一段。

-- ══════════════════════════════════════════════════════════════════════════════
-- 一、管理员建班在生产上根本插不进去
-- ══════════════════════════════════════════════════════════════════════════════
-- 复现（真 postgres，一校管理员会话）：
--   ERROR: new row violates row-level security policy for table "classes"
--
-- 根因：classes_app_admin_all 是 `for all`，with check 用 can_admin_class(id)。
-- 而 can_admin_class 是 STABLE 的 security definer 函数，**按 id 回查 classes 表**；
-- INSERT 的 WITH CHECK 求值时用的是语句开始时的快照，本语句正在插的那一行还不在表里，
-- exists 恒假 → 拒。这与 spaces_select 踩的是同一个坑（按 id 回查表 vs 按列求值）。
--
-- 影响：createClass（src/lib/data/admin.ts:517）与 CSV 导入的建班分支全部不可用。
--
-- 修法：写侧改成**按新行的列**求值——新行的 school_id 落在我的管理范围内即可。
-- USING 保持 can_admin_class(id)（那里行已存在，回查是对的），于是
-- 「改/删本校的班」与「把班改成别校」两个方向同时被钉住。
--
-- 注意 classes 上**没有** name 唯一约束（基线只有 classes_pkey），
-- 所以 admin.ts:911 的 upsert(..., { onConflict: 'name' }) 本来就会挂在 42P10——
-- 那条路要改代码，不在本迁移里。

drop policy if exists "classes_app_admin_all" on public.classes;
create policy "classes_app_admin_all" on public.classes for all
  using (public.can_admin_class(id))
  with check (
    public.is_admin()
    and (school_id is null or public.can_admin_school_scope(school_id))
  );

-- SELECT 侧同样要能对**新行**求值，否则 .insert().select() / upsert(...).select()
-- 的 RETURNING 会被 SELECT 策略拒掉（Supabase JS 的常见形状）。
-- 管理员的可见范围本来就与写范围一致，这里只是把它按列表达一遍。
drop policy if exists "classes_app_member_select" on public.classes;
create policy "classes_app_member_select" on public.classes for select
  using (
    public.can_admin_class(id)
    or (public.is_admin() and (school_id is null or public.can_admin_school_scope(school_id)))
    or exists (
      select 1 from public.class_memberships cm
      where cm.class_id = classes.id and cm.profile_id = public.current_app_user_id()
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 二、security definer 函数对 anon 开放
-- ══════════════════════════════════════════════════════════════════════════════
-- 背景：PostgreSQL **默认给 PUBLIC 授 EXECUTE**，所以每个新函数 anon 都能调。
-- 本仓的迁移里散落着 `revoke ... from public, authenticated`——那样写**抵不掉**
-- 默认授给 anon 的那一份，看起来做了防护，实际没有。加上 baseline 的
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon`，新函数一律对匿名开放。
--
-- 为什么不能一刀切 revoke：**运行角色就是 anon**。src/lib/supabase/server.ts 用
-- publishable key + x-cwb-user-id 头，应用层的每一次查询与 RPC 都以 anon 身份执行；
-- RLS 策略也是以调用者身份求值的。revoke 错一个，对应功能直接 42501。
--
-- 判定口径（三份清单交叉比对得出）：
--   · 保留 anon：应用层 .rpc() 实际调用的、以及**出现在 RLS 策略表达式里**的函数
--   · 可以 revoke：触发器函数、以及只被其它 definer 函数调用的内部函数
--     —— 后者的调用发生在 owner 上下文里，不看 anon 的 EXECUTE；触发器更是不校验
--     （PG 对触发器函数不检查 EXECUTE）。
--
-- 最实的一条：refresh_project_highest_bloom_level 是 security definer，函数体里
-- **0 处身份校验**，直接 UPDATE public.projects WHERE id = p_project_id。
-- 拿 publishable key（NEXT_PUBLIC_，本来就在客户端 bundle 里）就能以 postgres 身份
-- 改掉别人学校项目的行，RLS 完全不适用。它只被触发器调用，所以 revoke 是安全的。

-- 为什么要走循环按名字查、而不是写死一串 revoke：**函数会先于这条迁移消失**。
-- 这条迁移第一次推送就是死在 `revoke execute on function public.sync_text_project_contract()`
-- ——它在 20260916132700 里被 `alter function ... rename to sync_project_contract` 改掉了，
-- 同组的 project_catalog_path 也在 20260916132600 被 drop，而写死的 revoke 不知道。
-- revoke **没有** IF EXISTS 语法，所以只能先查存在性再执行；
-- 查不到就是本来就不存在，无从 revoke，跳过是正确的，不该让整条迁移失败。
-- 按 proname 遍历而不是按固定签名：同名重载（authenticate_user 有 (text) 与 (text,text)
-- 两个版本，见 20260907120000）会全部覆盖，也不会因为签名写错而静默漏掉一个。
--
-- 四组按「为什么可以 revoke」分开列，理由各不相同：
--   触发器函数   由触发器调用，PG 不校验调用者的 EXECUTE
--   内部函数     只被其它 definer 函数调用，调用发生在 owner 上下文，不看 anon 的 EXECUTE
--   已无人调用   且本身是攻击面或泄漏面
--   旧登录入口   被 _v3 取代；它们接受密码、对匿名开放，留着就是多余的密码校验面
--                （_v3 内部若调用它们，走的是 owner 上下文，不受影响）
do $$
declare
  v_targets text[] := array[
    -- 触发器函数
    'sync_project_contract', 'sync_text_project_contract', 'sync_prompt_preset_scope',
    'sync_provider_capability_school', 'validate_audit_record_contract',
    'validate_class_membership_contract', 'validate_conversation_contract',
    'validate_conversation_message_contract', 'validate_document_chunk_scope_contract',
    'validate_document_scope_contract', 'validate_practice_record_contract',
    'validate_space_contract', 'refresh_project_highest_bloom_level',
    -- 内部函数
    'authenticate_user', 'has_valid_app_session_signature',
    'rebuild_scenario_provider_capabilities', 'clear_school_model_tier_binding',
    -- 已无人调用
    'get_profile', 'project_catalog_path', 'set_initial_password_by_login', 'rls_auto_enable',
    -- 旧登录入口
    'authenticate_school_account', 'authenticate_school_account_v2'
  ];
  v_rec record;
  v_revoked integer := 0;
begin
  for v_rec in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any(v_targets)
  loop
    execute format('revoke execute on function public.%I(%s) from public, anon, authenticated', v_rec.proname, v_rec.args);
    v_revoked := v_revoked + 1;
  end loop;
  raise notice 'definer 面已按调用方收敛，收回 % 个函数签名', v_revoked;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 三、自检
-- ══════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_kept text[] := array[
    -- RLS 策略表达式里引用的：必须对 anon 可执行，否则策略整体 42501
    -- 列入前请确认它**真的**出现在某条策略里：has_valid_app_session_signature 曾经也在这份
    -- 清单上，但它只是被其它 definer 函数调用（authenticate_school_account_v3 等），
    -- 一条策略都没引用过 —— 把它列在这里，就会和下面的 revoke 正面冲突、自检必炸。
    'current_app_user_id', 'current_school_id', 'current_profile_role',
    'is_admin', 'is_org_admin',
    'can_admin_class', 'can_admin_profile', 'can_admin_school_scope', 'can_read_school_scope',
    'teacher_can_access_class', 'is_my_space', 'can_manage_space', 'can_manage_space_row',
    'space_class_same_school',
    -- 应用层 .rpc() 实际调用的
    'authenticate_school_account_v3', 'change_own_password', 'update_own_avatar',
    'provision_school_account', 'set_initial_password_by_profile',
    'get_model_tier_provider', 'get_provider_capability_provider', 'get_role_mcp_servers',
    'is_student_conversation_finalized', 'match_document_chunks', 'match_conversation_document_chunks',
    'save_model_tier_binding_and_sync', 'save_scenario_tier_bindings_and_sync',
    'write_app_log_event', 'create_space', 'pull_class_into_space'
  ];
  v_revoked text[] := array[
    'refresh_project_highest_bloom_level', 'get_profile', 'project_catalog_path',
    'set_initial_password_by_login', 'rls_auto_enable',
    'authenticate_school_account', 'authenticate_school_account_v2', 'authenticate_user',
    'rebuild_scenario_provider_capabilities', 'clear_school_model_tier_binding',
    'sync_project_contract', 'validate_conversation_contract', 'validate_space_contract'
  ];
  v_missing text;
  v_unexec text;
  v_open text;
begin
  -- 该保留的一个都不能少：少了就是线上功能 42501。
  -- 按 proname 聚合后判「任一同名签名可执行」，与上面的 revoke 循环同为集合式判定，
  -- 不会因为重载取到哪一个而给出与实际情况相反的结论。
  select string_agg(x.proname, ', ' order by x.proname) into v_missing
    from unnest(v_kept) as x(proname)
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = x.proname
   );

  select string_agg(x.proname, ', ' order by x.proname) into v_unexec
    from (
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any(v_kept)
       group by p.proname
      having not bool_or(has_function_privilege('anon', p.oid, 'execute'))
    ) x;

  -- 该关掉的必须是关掉的。查不到的（早就被删掉的）不算失败——本来就不存在。
  select string_agg(p.proname, ', ' order by p.proname) into v_open
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any(v_revoked)
     and has_function_privilege('anon', p.oid, 'execute');

  if v_missing is not null then
    raise exception '自检：这些函数不存在（清单过期了？）：%', v_missing;
  end if;
  if v_unexec is not null then
    raise exception '自检：这些函数对 anon 失去了 EXECUTE，应用层与策略都以 anon 身份执行，会直接 42501：%', v_unexec;
  end if;
  if v_open is not null then
    raise exception '自检：这些函数仍然对 anon 开放：%', v_open;
  end if;

  -- 建班的两条策略必须在，且写侧不再引用回查表的函数。
  if not exists (select 1 from pg_policies where tablename = 'classes' and policyname = 'classes_app_admin_all') then
    raise exception '自检：classes_app_admin_all 缺失';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'classes' and policyname = 'classes_app_member_select') then
    raise exception '自检：classes_app_member_select 缺失';
  end if;
  if position('can_admin_class(id)' in (
    select with_check from pg_policies where tablename = 'classes' and policyname = 'classes_app_admin_all'
  )) > 0 then
    raise exception '自检：建班的 WITH CHECK 又退回按 id 回查表了（INSERT 会恒假）';
  end if;

  raise notice '存量修复就位：建班可写、definer 面按调用方收敛';
end $$;