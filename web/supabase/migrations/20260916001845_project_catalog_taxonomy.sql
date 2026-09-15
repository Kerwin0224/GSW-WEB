-- 项目归属目录（SaaS 通用化）：让"项目归属规则"从写死的古诗文假说，变成可导入、
-- 可按校配置的层级目录。
--
-- 背景（ADR-0002 之后的通用化诉求）：现在 text_projects 只有一个 LLM 抽取的 title
-- 和 text_type（默认 'poem'），归类口径完全绑定古诗文。要做中小学通用的 SaaS，
-- 必须让"项目归到什么"由学校自己的目录决定：学科 → 年级 → 类别/专题 → 具体项目，
-- 例如 语文/高一/文言文/《赤壁赋》、数学/初一/函数/一次函数。
--
-- 本迁移只加表加列，不改既有语义（向后兼容）：
--   1. project_catalogs：层级目录树，校维（school_id）或公司模板维（school_id NULL）。
--   2. text_projects.catalog_id：项目挂到目录节点，可空——未配置目录时行为不变。
-- 归类器（LLM）与 catalog 的关系在应用层编排；此处只固化数据模型与权限边界。

-- ── 1. 目录树 ────────────────────────────────────────────────────────────────

create table if not exists public.project_catalogs (
  id uuid primary key default gen_random_uuid(),
  -- 公司模板（school_id 为 NULL，下发给本公司各校）或某校自有目录。
  organization_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  parent_id uuid references public.project_catalogs(id) on delete cascade,
  name text not null,
  -- 层级语义：subject 学科 / grade 年级 / category 类别（如文言文、函数）/ topic 专题。
  kind text not null default 'topic' check (kind in ('subject', 'grade', 'category', 'topic')),
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_catalogs enable row level security;

-- 同一父节点下同名不重复。NULL 用全零 UUID 归一化，否则 Postgres 对 NULL 不去重。
create unique index if not exists "project_catalogs_sibling_name_key"
  on public.project_catalogs (
    coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(name))
  );

create index if not exists "project_catalogs_school_idx" on public.project_catalogs (school_id);
create index if not exists "project_catalogs_parent_idx" on public.project_catalogs (parent_id);

-- ── 2. 项目挂目录（可空，未配置目录时行为不变）────────────────────────────────

alter table public.text_projects
  add column if not exists catalog_id uuid references public.project_catalogs(id) on delete set null;

create index if not exists "text_projects_catalog_idx" on public.text_projects (catalog_id) where catalog_id is not null;

-- ── 3. RLS：目录按校隔离，公司模板对本公司各校可见 ────────────────────────────
-- 读：本公司 org_admin；校 admin 看本校目录 + 本公司模板（school_id 为 NULL）。
-- 写：同上。模板由 org_admin 维护，校目录由校 admin 维护。

drop policy if exists "project_catalogs_read" on public.project_catalogs;
create policy "project_catalogs_read" on public.project_catalogs for select
  using (
    exists (
      select 1 from public.profiles me
      where me.id = public.current_app_user_id() and me.status = 'active'
        and (
          (me.role = 'org_admin' and me.organization_id = project_catalogs.organization_id)
          or (me.role = 'admin'
              and me.school_id is not null
              and (project_catalogs.school_id = me.school_id
                   or (project_catalogs.school_id is null and project_catalogs.organization_id = me.organization_id)))
        )
    )
  );

drop policy if exists "project_catalogs_write" on public.project_catalogs;
create policy "project_catalogs_write" on public.project_catalogs
  using (
    exists (
      select 1 from public.profiles me
      where me.id = public.current_app_user_id() and me.status = 'active'
        and (
          (me.role = 'org_admin' and me.organization_id = project_catalogs.organization_id)
          or (me.role = 'admin'
              and me.school_id is not null
              and (project_catalogs.school_id = me.school_id
                   or (project_catalogs.school_id is null and project_catalogs.organization_id = me.organization_id)))
        )
    )
  )
  with check (
    exists (
      select 1 from public.profiles me
      where me.id = public.current_app_user_id() and me.status = 'active'
        and (
          (me.role = 'org_admin' and me.organization_id = project_catalogs.organization_id)
          or (me.role = 'admin'
              and me.school_id is not null
              and (project_catalogs.school_id = me.school_id
                   or (project_catalogs.school_id is null and project_catalogs.organization_id = me.organization_id)))
        )
    )
  );

-- 学生/教师读目录：只要能进本校项目即可读本校目录，用于前端展示归属路径。
drop policy if exists "project_catalogs_school_member_read" on public.project_catalogs;
create policy "project_catalogs_school_member_read" on public.project_catalogs for select
  using (
    school_id is not null
    and school_id = public.current_school_id()
  );

-- ── 4. 归属路径解析：把 catalog_id 展开成 "语文 / 高一 / 文言文" ──────────────
-- 递归 CTE 上溯祖先，返回用 " / " 连接的路径，供列表页与审核页显示归属。
create or replace function public.project_catalog_path(p_catalog_id uuid)
returns text
language sql stable security definer
set search_path to 'public'
as $$
  with recursive chain as (
    select id, parent_id, name, 1 as depth
    from public.project_catalogs where id = p_catalog_id
    union all
    select c.id, c.parent_id, c.name, chain.depth + 1
    from public.project_catalogs c
    join chain on chain.parent_id = c.id
  )
  select string_agg(name, ' / ' order by depth desc) from chain
$$;

-- 自检：迁移重放后确认表与列就位。
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'text_projects' and column_name = 'catalog_id') then
    raise exception 'text_projects.catalog_id missing after migration';
  end if;
  raise notice 'project_catalogs ready; text_projects.catalog_id ready';
end $$;
