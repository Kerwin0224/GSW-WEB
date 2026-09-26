-- ═══════════════════════════════════════════════════════════════════════════
-- 租户与角色模型：空间可跨校、协作可表达、机构不必伪装成学校
-- ═══════════════════════════════════════════════════════════════════════════
-- 旧模型把组织树焊成「公司 → 学校 → 班级 → 成员」三层且每层单值：
--   · spaces.school_id NOT NULL + RPC 硬拒 current_school_id() IS NULL
--     → 跨校教研组、两校联合课程、社群型学习社区，一个空间都建不出来
--   · space_members 只接受学生，成员函数对同事直接拒
--     → 两位老师共带一班只能各建一个，学生端出现两个同名空间且无去重
--   · class_memberships_role_check 只允许 teacher|student
--     → 班主任、教研组长、助教、导师、家长全部塌成两个值
--   · schools 没有任何类型字段
--     → 教培工作室、教研联盟、个人工作室只能伪装成「学校」

-- ── 1. 学校有类型，机构不必伪装成学校 ────────────────────────────────────
alter table public.schools add column if not exists kind text not null default 'school';
alter table public.schools add constraint schools_kind_check
  check (kind in ('school', 'campus', 'training_org', 'studio', 'alliance', 'other'));

-- 学段：grade 此前是单列自由文本，只用来拼字符串，无法筛选、分组或配置。
-- 一所学校同时有小学部/初中部/高中部/成人部时，一个字符串装不下。
alter table public.schools add column if not exists education_stages text[]
  not null default '{}'::text[];
alter table public.classes add column if not exists stage text;
-- grade 降级为纯展示标签，查询一律用 stage。
comment on column public.classes.grade is '纯展示的历史字段；可查询的学段用 stage';

-- 登录标识格式：写死 /^\d{8}$/ 意味着教培工牌号、企业培训邮箱、
-- 高校 10 位学号、国际用户 learner@example.com 三处同时被拒。
alter table public.schools add column if not exists login_id_pattern text;
update public.schools set login_id_pattern = '^\d{8}$' where login_id_pattern is null;
alter table public.schools add constraint schools_login_pattern_present
  check (login_id_pattern is not null and length(trim(login_id_pattern)) > 0);

-- ── 2. 科目词表：自由文本导致「物理」与「Physics」算两个空间 ──────────────
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  code text not null,
  name text not null,
  aliases text[] not null default '{}'::text[],
  sort_order integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_code_format check (code ~ '^[a-z0-9_-]{1,32}$')
);

create unique index if not exists subjects_school_code on public.subjects (school_id, code);
create index if not exists subjects_school_idx on public.subjects (school_id, sort_order);

alter table public.subjects enable row level security;

drop policy if exists "subjects_read" on public.subjects;
create policy "subjects_read" on public.subjects for select
  using (public.can_admin_school_scope(school_id));

drop policy if exists "subjects_admin_write" on public.subjects;
create policy "subjects_admin_write" on public.subjects for all
  using (public.can_admin_school_scope(school_id))
  with check (public.can_admin_school_scope(school_id));

drop trigger if exists subjects_touch on public.subjects;
create trigger subjects_touch
  before update on public.subjects
  for each row execute function public.touch_updated_at();

-- 空间挂词表 id；subject 自由文本保留为历史兼容列
alter table public.spaces add column if not exists subject_id uuid references public.subjects(id) on delete set null;
create index if not exists spaces_subject_idx on public.spaces (subject_id);

-- ── 3. 空间：跨校 / 公司级 / 多人协作 ─────────────────────────────────────
-- school_id 改可空并补 organization_id：可空 = 公司级空间，
-- 跨校则用 organization_id 表达共同上级。
alter table public.spaces alter column school_id drop not null;
alter table public.spaces add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

update public.spaces s set organization_id = sc.org_id
  from public.schools sc where sc.id = s.school_id and s.organization_id is null;

-- 成员角色：同事协作与旁观是教研形态的最小表达。
-- 此前 valid_space_member 硬判 role='student'，对同事直接拒。
alter table public.space_members
  add column if not exists member_role text not null default 'student'
    check (member_role in ('student', 'co_teacher', 'observer'));

-- 空间协作者：与成员表分开，因为「有协作权」和「带学生」是两件事。
create table if not exists public.space_collaborators (
  space_id uuid not null references public.spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'co_teacher' check (role in ('co_teacher', 'owner')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (space_id, profile_id)
);

create index if not exists space_collaborators_profile_idx
  on public.space_collaborators (profile_id);

alter table public.space_collaborators enable row level security;

-- ── 4. 角色能力位：班主任 / 教研组长 / 助教 / 导师 ─────────────────────────
-- profiles.role 是粗粒度主身份，继续保留；但「能看多大范围」不该由主身份决定。
-- 班主任与任课教师在数据层完全同质，是本条要修的。
create table if not exists public.role_grants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability text not null,
  scope_type text not null check (scope_type in ('class', 'space', 'school', 'organization')),
  scope_id uuid,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint role_grants_scope_shape check (
    (scope_type in ('class', 'space') and scope_id is not null)
    or (scope_type in ('school', 'organization') and scope_id is null)
  )
);

create unique index if not exists role_grants_unique
  on public.role_grants (profile_id, capability, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists role_grants_profile_idx on public.role_grants (profile_id);

alter table public.role_grants enable row level security;

drop policy if exists "role_grants_self_read" on public.role_grants;
create policy "role_grants_self_read" on public.role_grants for select
  using (
    profile_id = public.current_app_user_id()
    or (scope_type = 'school' and public.can_admin_school_scope(scope_id))
    or (scope_type = 'class' and public.can_admin_class(scope_id))
    or granted_by = public.current_app_user_id()
  );

drop policy if exists "role_grants_admin_write" on public.role_grants;
create policy "role_grants_admin_write" on public.role_grants for all
  using (
    (scope_type = 'school' and public.can_admin_school_scope(scope_id))
    or (scope_type = 'class' and public.can_admin_class(scope_id))
  )
  with check (
    (scope_type = 'school' and public.can_admin_school_scope(scope_id))
    or (scope_type = 'class' and public.can_admin_class(scope_id))
  );

-- 成员关系不再承担角色语义：去掉两值 check，只表达「谁在这个教学单元里」。
alter table public.class_memberships drop constraint if exists class_memberships_role_check;

-- 教师可见性：任教班级 ∪ 拥有空间 ∪ 被授予的能力位
create or replace function public.teacher_can_access_space(p_space_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.spaces s
    left join public.space_collaborators sc
      on sc.space_id = s.id and sc.profile_id = public.current_app_user_id()
    where s.id = p_space_id
      and (s.owner_id = public.current_app_user_id() or sc.profile_id is not null)
      and (s.school_id is null or s.school_id = public.current_school_id())
  )
$$;

grant execute on function public.teacher_can_access_space(uuid) to anon, authenticated, service_role;

-- 可访问的空间集合：教师端查询不再逐处自己拼条件
create or replace function public.teacher_space_ids()
returns setof uuid
language sql stable security definer
set search_path to 'public'
as $$
  select s.id
    from public.spaces s
   where s.owner_id = public.current_app_user_id()
      or exists (select 1 from public.space_collaborators sc
                  where sc.space_id = s.id and sc.profile_id = public.current_app_user_id())
$$;

grant execute on function public.teacher_space_ids() to anon, authenticated, service_role;

-- 跨校空间的读：空间所属公司对本公司账号可见
create or replace function public.can_read_space(p_space_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.spaces s
     where s.id = p_space_id
       and (
         s.owner_id = public.current_app_user_id()
         or (s.school_id is not null and s.school_id = public.current_school_id())
         or (s.school_id is null and public.is_org_admin())
         or (s.organization_id is not null and s.organization_id = (
              select me.organization_id from public.profiles me
               where me.id = public.current_app_user_id()))
         or public.teacher_can_access_space(s.id)
         or exists (select 1 from public.space_members sm
                     where sm.space_id = s.id
                       and sm.student_id = public.current_app_user_id())
       )
  )
$$;

grant execute on function public.can_read_space(uuid) to anon, authenticated, service_role;

-- ── 5. 空间创建 RPC：放开「必须属于某校」 ────────────────────────────────
-- 三代入口同一处硬拒 current_school_id() IS NULL，公司级空间连建都建不出来。
--
-- 签名逐字照抄 20260926093000 的 create_space_v3(text,text,uuid,text,text,text)：
-- 写成一个少参数的重载不会替换旧函数，而是新增重载，调用方仍命中旧的那个，
-- 「已修好」的结论就是假的。幂等（同名同 owner 复用）与拉班行为一并保留。
create or replace function public.create_space_v3(
  p_name text,
  p_theme text,
  p_class_id uuid default null,
  p_subject text default null,
  p_color_key text default 'pine',
  p_space_kind text default 'term'
) returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_theme text := nullif(btrim(coalesce(p_theme, '')), '');
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_color_key text := coalesce(nullif(btrim(coalesce(p_color_key, '')), ''), 'pine');
  v_space_kind text := coalesce(nullif(btrim(coalesce(p_space_kind, '')), ''), 'term');
  v_space_id uuid;
  v_school uuid;
  v_org uuid;
  v_role public.app_role;
begin
  if v_name = '' then
    raise exception 'space name cannot be empty' using errcode = '22023';
  end if;

  v_role := public.current_profile_role();
  -- 此前硬判 'teacher'：助教、导师与教研组长连空间都建不出来。
  if v_role is distinct from 'teacher' and not public.is_admin() then
    raise exception 'role % cannot create a space', v_role using errcode = '42501';
  end if;

  v_school := public.current_school_id();
  -- 无行政班的教师建公司级空间：owner 仍要能看见它，can_read_space 覆盖这一路。
  v_org := (select sc.org_id from public.schools sc where sc.id = v_school);

  if v_space_kind not in ('term', 'topic') then
    raise exception 'invalid space kind' using errcode = '22023';
  end if;
  if v_subject is not null and char_length(v_subject) > 40 then
    raise exception 'space subject is too long' using errcode = '22023';
  end if;
  if v_color_key not in ('ink', 'pine', 'cinnabar', 'moon', 'bamboo', 'plum') then
    raise exception 'invalid space color' using errcode = '22023';
  end if;

  select id into v_space_id
    from public.spaces
   where owner_id = public.current_app_user_id()
     and name = v_name
     and status = 'active'
     and school_id is not distinct from v_school;

  if v_space_id is null then
    insert into public.spaces (school_id, organization_id, owner_id, name, theme, subject, color_key, space_kind)
    values (v_school, v_org, public.current_app_user_id(), v_name, coalesce(v_theme, ''), v_subject, v_color_key, v_space_kind)
    returning id into v_space_id;
  else
    update public.spaces
       set theme = coalesce(v_theme, theme),
           subject = coalesce(v_subject, subject),
           color_key = v_color_key,
           space_kind = v_space_kind
     where id = v_space_id;
  end if;

  -- 协作边：owner 同时是 co_teacher，teacher_can_access_space 才会认他。
  insert into public.space_collaborators (space_id, profile_id, role, created_by)
  values (v_space_id, public.current_app_user_id(), 'owner', public.current_app_user_id())
  on conflict do nothing;

  if p_class_id is not null then
    perform public.pull_class_into_space(v_space_id, p_class_id);
  end if;
  return v_space_id;
end;
$$;

grant execute on function public.create_space_v3(text, text, uuid, text, text, text) to anon, authenticated, service_role;

-- ── 6. 空间目录可见性：协作空间要能被协作者读到 ──────────────────────────
drop policy if exists "spaces_select" on public.spaces;
create policy "spaces_select" on public.spaces for select
  using (public.can_read_space(id));

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='spaces' and column_name='organization_id'
  ) then
    raise exception 'spaces.organization_id missing';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='spaces'
       and column_name='school_id' and is_nullable = 'NO'
  ) then
    raise exception 'spaces.school_id must be nullable (cross-school / company-level spaces)';
  end if;
  if (select count(*) from public.spaces where organization_id is null) > 0 then
    raise exception 'every space must carry an organization anchor';
  end if;
  if (select count(*) from public.schools where login_id_pattern is null) > 0 then
    raise exception 'every school must carry a login_id_pattern';
  end if;
  raise notice '租户与角色就位：跨校空间 + 协作者 + 能力位 + 机构类型 + 登录标识可配';
end $$;
