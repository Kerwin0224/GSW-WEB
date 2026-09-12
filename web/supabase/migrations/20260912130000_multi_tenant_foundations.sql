-- 多租户 v1 基础（ADR-0002 落地第一段）：公司（organizations）→ 学校（schools）→
-- 班级/成员。产品裁定（2026-09-12）：
--   公司管校、校管人（org_admin 管学校，现有 admin 语义收窄为校内管理员）；
--   各校学号独立编制，登录不做学校码输入，跨校重名由密码/消歧内部解决
--   （authenticate_school_account_v3）。
-- 隔离模型：profiles.school_id / classes.school_id 为租户锚点；历史行 school_id
-- 为 NULL 视为"未划归"，过渡期对所有 admin 可见（数据修正 SQL 会补齐归属）。
-- 平台级资源（provider/model_tier/presets/mcp）按 ADR 为公司统一配置，本段不改其策略。

-- ── 1. 结构 ──────────────────────────────────────────────────────────────────

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schools enable row level security;

alter table public.profiles
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists school_id uuid references public.schools(id) on delete set null;

alter table public.classes
  add column if not exists school_id uuid references public.schools(id) on delete set null;

alter table public.export_batches
  add column if not exists school_id uuid references public.schools(id) on delete set null;

-- org_admin 加入角色集（公司级大账号）；既有 admin 语义收窄为校内管理员。
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['org_admin'::text, 'admin'::text, 'teacher'::text, 'student'::text]));

-- 学号各校独立编制：全局唯一约束降级为 (school_id, login_id) 组合唯一。
-- org_admin 与历史无归属行的 school_id 为 NULL，Postgres 对 NULL 不去重，天然豁免。
alter table public.profiles drop constraint if exists profiles_login_id_key;
create unique index if not exists "profiles_school_login_key" on public.profiles (school_id, login_id);

-- ── 2. 隔离 helpers ──────────────────────────────────────────────────────────

create or replace function public.current_school_id() returns uuid
  language sql stable security definer
  set search_path to 'public'
  as $$
    select school_id from public.profiles where id = public.current_app_user_id()
  $$;

create or replace function public.is_org_admin() returns boolean
  language sql stable security definer
  set search_path to 'public'
  as $$
    select exists (
      select 1 from public.profiles p
      where p.id = public.current_app_user_id()
        and p.role = 'org_admin' and p.status = 'active'
    )
  $$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer
  set search_path to 'public'
  as $$
    select exists (
      select 1 from public.profiles p
      where p.id = public.current_app_user_id()
        and p.role in ('admin', 'org_admin')
        and p.status = 'active'
    )
  $$;

-- 校级/公司级管理员对某个班级的管理权：校 admin 管本校，org_admin 管本公司全部学校。
-- school_id 为 NULL 的历史班级过渡期对所有 admin 可见（补齐归属后自然收敛）。
create or replace function public.can_admin_class(p_class_id uuid) returns boolean
  language sql stable security definer
  set search_path to 'public'
  as $$
    select exists (
      select 1
      from public.classes c
      join public.profiles me on me.id = public.current_app_user_id() and me.status = 'active'
      where c.id = p_class_id
        and (
          (me.role = 'admin' and (c.school_id is null or c.school_id = me.school_id))
          or (me.role = 'org_admin' and (
            c.school_id is null
            or c.school_id in (select s.id from public.schools s where s.org_id = me.organization_id)
          ))
        )
    )
  $$;

-- 对某个用户档案的管理权：校 admin 管本校成员，org_admin 管本公司成员。
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
          (me.role = 'admin' and (target.school_id is null or target.school_id = me.school_id))
          or (me.role = 'org_admin' and (
            target.school_id is null
            or target.school_id in (select s.id from public.schools s where s.org_id = me.organization_id)
          ))
        )
    )
  $$;

-- 教师可见性追加学校边界：只能访问本校班级（NULL 历史班级放行，补齐归属后收敛）。
create or replace function public.teacher_can_access_class(p_class_id uuid) returns boolean
  language sql stable security definer
  set search_path to 'public'
  as $$
    select exists (
      select 1
      from public.class_memberships cm
      join public.classes c on c.id = cm.class_id
      where cm.class_id = p_class_id
        and cm.profile_id = public.current_app_user_id()
        and cm.role = 'teacher'
        and (c.school_id is null or c.school_id = public.current_school_id())
    )
  $$;

-- ── 3. 策略重写：is_admin() 全域放行 → 按校收敛 ─────────────────────────────

drop policy if exists "classes_app_admin_all" on public.classes;
create policy "classes_app_admin_all" on public.classes
  using (public.can_admin_class(id)) with check (public.can_admin_class(id));

drop policy if exists "classes_app_member_select" on public.classes;
create policy "classes_app_member_select" on public.classes for select
  using (public.can_admin_class(id) or exists (
    select 1 from public.class_memberships cm
    where cm.class_id = classes.id and cm.profile_id = public.current_app_user_id()
  ));

drop policy if exists "memberships_admin_all" on public.class_memberships;
create policy "memberships_admin_all" on public.class_memberships
  using (public.can_admin_class(class_id)) with check (public.can_admin_class(class_id));

drop policy if exists "memberships_member_select" on public.class_memberships;
create policy "memberships_member_select" on public.class_memberships for select
  using (
    public.can_admin_class(class_id)
    or profile_id = public.current_app_user_id()
    or public.teacher_can_access_class(class_id)
  );

drop policy if exists "profiles_app_admin_all" on public.profiles;
create policy "profiles_app_admin_all" on public.profiles
  using (public.can_admin_profile(id)) with check (public.can_admin_profile(id));

drop policy if exists "profiles_app_select" on public.profiles;
create policy "profiles_app_select" on public.profiles for select
  using (id = public.current_app_user_id() or public.can_admin_profile(id));

drop policy if exists "audit_app_teacher_admin_read" on public.audit_records;
create policy "audit_app_teacher_admin_read" on public.audit_records for select
  using (
    (class_id is not null and public.can_admin_class(class_id))
    or auditor_id = public.current_app_user_id()
    or (class_id is not null and public.teacher_can_access_class(class_id))
  );

drop policy if exists "audit_app_teacher_update" on public.audit_records;
create policy "audit_app_teacher_update" on public.audit_records for update
  using (
    (class_id is not null and public.can_admin_class(class_id))
    or auditor_id = public.current_app_user_id()
  )
  with check (
    (class_id is not null and public.can_admin_class(class_id))
    or auditor_id = public.current_app_user_id()
  );

drop policy if exists "conversations_owner_all" on public.conversations;
create policy "conversations_owner_all" on public.conversations
  using (
    owner_id = public.current_app_user_id()
    or (class_id is not null and public.can_admin_class(class_id))
  )
  with check (
    owner_id = public.current_app_user_id()
    or (class_id is not null and public.can_admin_class(class_id))
  );

-- 学生私产数据（文档/_chunks/项目/练习）的 admin 分支按档案归属收敛。
drop policy if exists "documents_app_owner_all" on public.documents;
create policy "documents_app_owner_all" on public.documents
  using (owner_id = public.current_app_user_id() or public.can_admin_profile(owner_id))
  with check (owner_id = public.current_app_user_id() or public.can_admin_profile(owner_id));

drop policy if exists "chunks_app_owner_all" on public.document_chunks;
create policy "chunks_app_owner_all" on public.document_chunks
  using (owner_id = public.current_app_user_id() or public.can_admin_profile(owner_id))
  with check (owner_id = public.current_app_user_id() or public.can_admin_profile(owner_id));

drop policy if exists "projects_owner_all" on public.text_projects;
create policy "projects_owner_all" on public.text_projects
  using (owner_id = public.current_app_user_id() or public.can_admin_profile(owner_id))
  with check (owner_id = public.current_app_user_id() or public.can_admin_profile(owner_id));

drop policy if exists "practice_app_student_all" on public.practice_records;
create policy "practice_app_student_all" on public.practice_records
  using (student_id = public.current_app_user_id() or public.can_admin_profile(student_id))
  with check (student_id = public.current_app_user_id() or public.can_admin_profile(student_id));

-- 导出批次挂学校：新行由写入方带 school_id；历史 NULL 行过渡期对所有 admin 可见。
drop policy if exists "exports_app_admin_all" on public.export_batches;
create policy "exports_app_admin_all" on public.export_batches
  using (
    school_id is null or exists (
      select 1 from public.profiles me
      where me.id = public.current_app_user_id() and me.status = 'active'
        and (
          (me.role = 'admin' and me.school_id = export_batches.school_id)
          or (me.role = 'org_admin' and me.organization_id in (
            select s.org_id from public.schools s where s.id = export_batches.school_id
          ))
        )
    )
  )
  with check (
    school_id is null or exists (
      select 1 from public.profiles me
      where me.id = public.current_app_user_id() and me.status = 'active'
        and (
          (me.role = 'admin' and me.school_id = export_batches.school_id)
          or (me.role = 'org_admin' and me.organization_id in (
            select s.org_id from public.schools s where s.id = export_batches.school_id
          ))
        )
    )
  );

-- org_admin / 校 admin 读取自己组织与学校的基础信息。
create policy "organizations_admin_read" on public.organizations for select
  using (
    public.is_org_admin()
    or exists (
      select 1 from public.profiles me
      join public.schools s on s.id = me.school_id
      where me.id = public.current_app_user_id() and me.role = 'admin' and s.org_id = organizations.id
    )
  );

create policy "schools_admin_read" on public.schools for select
  using (
    public.is_org_admin()
    or exists (
      select 1 from public.profiles me
      where me.id = public.current_app_user_id()
        and me.role = 'admin' and me.school_id = schools.id
    )
  );

-- 学校/组织的写管理（建校、停用、改名）只属于 org_admin；经 API 层 server action 完成。
create policy "organizations_org_admin_all" on public.organizations
  using (public.is_org_admin()) with check (public.is_org_admin());

create policy "schools_org_admin_all" on public.schools
  using (
    public.is_org_admin()
    and schools.org_id in (select organization_id from public.profiles where id = public.current_app_user_id())
  )
  with check (
    public.is_org_admin()
    and schools.org_id in (select organization_id from public.profiles where id = public.current_app_user_id())
  );

-- ── 4. 登录 v3：学号跨校重名的内部消歧 ──────────────────────────────────────
-- 学号各校独立编制后，同一学号可能在多校存在。v3 返回所有"学号+密码"匹配的
-- 活跃账号（含学校上下文）；唯一命中即登录，多命中由登录页内部消歧（选学校），
-- 用户全程无需输入学校码。p_school_id 为二次提交时的消歧参数。

create or replace function public.authenticate_school_account_v3(
  p_login_id text,
  p_password text,
  p_server_signature text,
  p_school_id uuid default null
)
returns table(
  id uuid,
  login_id text,
  role public.app_role,
  display_name text,
  avatar_key text,
  session_version integer,
  must_change_password boolean,
  school_id uuid,
  school_name text,
  organization_id uuid,
  organization_name text
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  select
    p.id,
    p.login_id,
    p.role::public.app_role,
    p.display_name,
    p.avatar_key,
    p.session_version,
    p.must_change_password,
    p.school_id,
    s.name as school_name,
    o.id as organization_id,
    o.name as organization_name
  from public.profiles p
  left join public.schools s on s.id = p.school_id
  left join public.organizations o on o.id = p.organization_id
  where p_server_signature = (
      select encode(extensions.hmac(('login:' || p_login_id)::bytea, value::bytea, 'sha256'), 'hex')
      from private.runtime_secrets where name = 'cwb_auth_secret'
    )
    and p.login_id = p_login_id
    and p.status = 'active'
    and p.login_id ~ '^\d{8}$'
    and p.password_hash is not null
    and p.password_hash = extensions.crypt(p_password, p.password_hash)
    and (p_school_id is null or p.school_id = p_school_id)
$$;

revoke all on function public.authenticate_school_account_v3(text, text, text, uuid) from public, authenticated;
grant execute on function public.authenticate_school_account_v3(text, text, text, uuid) to anon, service_role;

-- 初始密码重置改为按档案 id 且带租户边界（can_admin_profile）：
-- 旧 set_initial_password_by_login 按 login_id 全局定位、仅校验 admin 角色，
-- 在多校下越权（可重置他校账号），此处废弃并由 by_profile 版本取代。
drop function if exists public.set_initial_password_by_login(text, text);

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
      must_change_password = true
  where p.id = p_profile_id
    and p_server_signature = (
      select encode(extensions.hmac(('pw:' || p_profile_id)::bytea, value::bytea, 'sha256'), 'hex')
      from private.runtime_secrets where name = 'cwb_auth_secret'
    )
    and public.can_admin_profile(p_profile_id)
$$;

revoke all on function public.set_initial_password_by_profile(uuid, text) from public, authenticated;
grant execute on function public.set_initial_password_by_profile(uuid, text) to anon, service_role;

-- ── 5. 建号 RPC：auth.users 镜像 + profile + 初始密码一次完成 ────────────────
-- auth schema 无法经 REST 写入，而 profiles.id 外键指向 auth.users——
-- 此前 TS 导入流程对全新账号必然 FK 失败（潜在缺陷），由本函数统一收口。
-- 校 admin 可在本校建号；org_admin 可在本公司各校建号；目标角色不包含 org_admin。
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

  -- 同校同号已存在：视为重导入，仅更新姓名与角色，不再动密码
  select id into v_id from public.profiles where school_id = p_school_id and login_id = p_login_id;
  if v_id is not null then
    update public.profiles set display_name = p_display_name, role = p_role::public.app_role where id = v_id;
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

revoke all on function public.provision_school_account(text, text, text, uuid, text) from public, authenticated;
grant execute on function public.provision_school_account(text, text, text, uuid, text) to anon, service_role;
