-- 撤掉管理员目录：项目归类回归「教师提示词」这一条唯一通路。
--
-- 产品裁定（2026-09-16）：管理员不管项目怎么归类，教师管。教师写的就是提示词，
-- 用自然语言说清「按什么分类」。迁移 20260916020000 已经把归类能力交给教师
-- （prompt_presets.purpose='project_classification'），本迁移把并存的第二套机制删掉。
--
-- 为什么必须删而不是留着：project_catalogs 不只是冗余，它是一个更弱的第二分类器——
-- 应用层用 resolveCatalogIdForTitle 把归类标题**子串匹配**回目录节点，匹配不上就静默落 null。
-- 两套口径并存时，没有人能说清「项目归到什么」到底由谁决定。
--
-- 删除前的实测证据（说明它基本是空转的）：
--   · createStudentProject 的 catalogId 从未被 UI 赋值（student-project-create-button 只 set title/author）
--   · listStudentCatalogOptions 全仓零调用点
--   · SQL 函数 project_catalog_path() 全仓零调用点（应用层另写了 parent-walk，共 3 份副本）
--   · text_projects.catalog_id 只在 /student/me 的项目卡片上显示过一次
-- seed.sql 与 e2e 夹具都不写这两者，无需数据回填。

-- ── 1. 先删依赖列，再删函数，最后删表（顺序不可换）─────────────────────────

alter table public.text_projects
  drop column if exists catalog_id;

drop function if exists public.project_catalog_path(uuid);

-- RLS 策略随表一起消失，无需单独 drop policy。
drop table if exists public.project_catalogs;

-- ── 2. 自检：确认三者都已不存在 ─────────────────────────────────────────────

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'project_catalogs') then
    raise exception 'project_catalogs still exists after migration';
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'text_projects' and column_name = 'catalog_id') then
    raise exception 'text_projects.catalog_id still exists after migration';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'project_catalog_path') then
    raise exception 'project_catalog_path() still exists after migration';
  end if;
  raise notice 'project_catalogs / text_projects.catalog_id / project_catalog_path() 已全部移除';
end $$;
