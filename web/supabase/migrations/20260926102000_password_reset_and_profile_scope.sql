-- 账号面三处收紧：密码重置要作废旧会话、管理边界不再兜底「未划归」、
-- 重导入不得顺手改角色。
--
-- 本文件是纯增量：只 create or replace 三个既有函数（返回类型逐字未变，
-- 否则 42P13），不改任何表结构、不动任何策略。

-- ── 1. 重置初始密码必须让旧 cookie 失效 ──────────────────────────────────────
-- 事故：set_initial_password_by_profile 只改 password_hash + must_change_password，
-- session_version 一动不动。而会话 cookie 的签名材料正是 session_version
-- （20260907110000：'login:'||login_id 的 HMAC，salt = session_version=0 时是 id，
-- 之后是 id||':'||session_version）。于是「管理员重置了某人的密码」在语义上等于
-- 「把密码告诉了他本人」——被盗的旧会话在被重置后依然有效，直到它自然过期。
--
-- 修法：与 change_own_password 同一口径递增 session_version。
create or replace function public.set_initial_password_by_profile(
  p_profile_id uuid,
  p_server_signature text
)
returns void
language sql
security definer
set search_path to 'public', 'extensions'
as $$
  update public.profiles p
  set password_hash = extensions.crypt((select t.login_id from public.profiles t where t.id = p_profile_id), extensions.gen_salt('bf')),
      must_change_password = true,
      -- 改密即作废旧会话：cookie 的签名材料含这一列，不递增 = 旧会话不失效。
      session_version = p.session_version + 1
  where p.id = p_profile_id
    and p_server_signature = (
      select encode(extensions.hmac(('pw:' || p_profile_id)::bytea, value::bytea, 'sha256'), 'hex')
      from private.runtime_secrets where name = 'cwb_auth_secret'
    )
    and public.can_admin_profile(p_profile_id)
$$;

-- ── 2. can_admin_profile：去掉「未划归」兜底 ────────────────────────────────
-- 20260915231533 那版的校 admin 分支是
--     target.school_id is null or target.school_id = me.school_id
-- 第一项是文档化的「未划归」过渡语义。它的真实后果是：
-- **一个自己都没挂校的 admin 可以管理全库所有未划归档案**——me.school_id 为 NULL 时
-- 第二项恒假，剩下的是无边界的全库兜底。生产回填已于 2026-09-12 完成、
-- 且此后所有建号路径（provision_school_account）都强制写 school_id，
-- 这个过渡语义已经没有存在理由，只剩一个越权面。
--
-- 收紧为等值：公司级账号（org_admin）对任何学校都不可见，这一条保留自上一版。
create or replace function public.can_admin_profile(p_profile_id uuid) returns boolean
  language sql stable security definer
  set search_path to 'public'
  as $$
    select exists (
      select 1
      from public.profiles me
      join public.profiles target on target.id = p_profile_id
      where me.id = public.current_app_user_id() and me.status = 'active'
        and (
          -- 校 admin：只管本校成员。me.school_id 必须非空，否则本分支整体退化成
          -- 「未挂校的 admin 管全部未挂校档案」——那正是被删掉的那个兜底。
          (me.role = 'admin'
            and me.school_id is not null
            and target.role <> 'org_admin'
            and target.school_id = me.school_id)
          -- 公司管理员：本公司旗下各校成员；公司级账号限同一家公司。
          or (me.role = 'org_admin'
            and me.organization_id is not null
            and (
              target.school_id in (select s.id from public.schools s where s.org_id = me.organization_id)
              or (target.school_id is null and target.organization_id = me.organization_id)
            ))
        )
    )
  $$;

-- ── 3. 重导入不得隐式改角色 ──────────────────────────────────────────────────
-- 事故：provision_school_account 的「同校同号已存在」分支无条件
--   update ... set display_name = ..., role = p_role
-- 于是 createSchoolAdmin（org_admin 在学校详情页建校管理员）只要填了一个
-- **已存在的教师/学生的工号**，那个账号就在没有任何提示的情况下变成了 admin。
-- 角色是权限边界，不能由「顺手 upsert」决定。
--
-- 修法：角色不一致直接拒绝，并说清原因。CSV 重导入同一份名册（角色不变）不受影响。
create or replace function public.provision_school_account(
  p_login_id text,
  p_display_name text,
  p_role text,
  p_school_id uuid,
  p_server_signature text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_id uuid;
  v_existing_role public.app_role;
  v_org_id uuid;
begin
  if p_server_signature <> (
    select encode(extensions.hmac('provision_school_account'::bytea, value::bytea, 'sha256'), 'hex')
    from private.runtime_secrets where name = 'cwb_auth_secret'
  ) then
    raise exception 'invalid server signature' using errcode = '42501';
  end if;

  if p_login_id !~ '^\d{8}$' then
    raise exception 'invalid login id' using errcode = '22023';
  end if;

  if p_role not in ('admin', 'teacher', 'student') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  -- 目标学校归属校验：校 admin限本校，org_admin限本公司学校
  if not exists (
    select 1 from public.schools s
    join public.profiles me on me.id = public.current_app_user_id() and me.status = 'active'
    where s.id = p_school_id and (
      (me.role = 'admin' and me.school_id = s.id)
      or (me.role = 'org_admin' and s.org_id = me.organization_id)
    )
  ) then
    raise exception 'school not in caller scope' using errcode = '42501';
  end if;

  select o.id into v_org_id from public.schools s join public.organizations o on o.id = s.org_id where s.id = p_school_id;

  -- 同校同号已存在：视为重导入，仅更新姓名；**角色不同则拒绝**。
  select id, role into v_id, v_existing_role
    from public.profiles
   where school_id = p_school_id and login_id = p_login_id;
  if v_id is not null then
    if v_existing_role is distinct from p_role::public.app_role then
      raise exception 'login id % already exists as %; a role change must be made explicitly', p_login_id, v_existing_role
        using errcode = '42501';
    end if;
    update public.profiles set display_name = p_display_name where id = v_id;
    return v_id;
  end if;

  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (gen_random_uuid(), p_login_id || '@accounts.internal', 'provisioned', now(), now(), now())
  returning id into v_id;

  insert into public.profiles (id, login_id, display_name, role, status, school_id, organization_id, must_change_password)
  values (v_id, p_login_id, p_display_name, p_role::public.app_role, 'active', p_school_id, v_org_id, true);

  update public.profiles
  set password_hash = extensions.crypt(p_login_id, extensions.gen_salt('bf')),
      must_change_password = true
  where id = v_id;

  return v_id;
end
$$;

-- ── 4. 自检 ────────────────────────────────────────────────────────────────
do $$
declare
  v_src text;
  v_unanchored integer;
  v_schoolless_admin integer;
begin
  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_initial_password_by_profile';
  if position('session_version = p.session_version + 1' in v_src) = 0 then
    raise exception 'set_initial_password_by_profile must bump session_version (otherwise old sessions survive a reset)';
  end if;

  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_admin_profile';
  if position('me.school_id is not null' in v_src) = 0 then
    raise exception 'can_admin_profile lost the schoolless-admin guard';
  end if;
  if position('target.school_id = me.school_id' in v_src) = 0 then
    raise exception 'can_admin_profile lost the same-school equality predicate';
  end if;
  if position('target.school_id is null or' in v_src) > 0 then
    raise exception 'can_admin_profile still has the unbounded unassigned fallback';
  end if;

  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'provision_school_account';
  if position('a role change must be made explicitly' in v_src) = 0 then
    raise exception 'provision_school_account must refuse implicit role changes';
  end if;

  -- 收紧的直接代价：这两个集合从此没有管理员。数量报出来，不 raise——
  -- 拦停生产迁移去处理遗留数据，比让迁移失败更好。
  select count(*) into v_unanchored
    from public.profiles where school_id is null and role <> 'org_admin';
  select count(*) into v_schoolless_admin
    from public.profiles where school_id is null and role = 'admin';
  if v_unanchored > 0 then
    raise notice '注意：% 个非 org_admin 档案 school_id 为 NULL，收紧后无校 admin 可管（需人工补归属）', v_unanchored;
  end if;
  if v_schoolless_admin > 0 then
    raise notice '注意：% 个 admin 未挂校，收紧后不再拥有任何管理权（需人工补归属）', v_schoolless_admin;
  end if;

  raise notice '账号面收紧就位：重置作废旧会话 / 管理边界去掉未划归兜底 / 重导入不改角色';
end $$;
