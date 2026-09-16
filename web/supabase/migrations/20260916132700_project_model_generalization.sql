-- 项目模型通用化：把「一篇文本 + 一个作者」的表结构改成学科中立的学习单元。
--
-- 产品已不是古诗文专用工具：多学校、多教师，每师每班一个自建答疑 bot，数学班和语文班
-- 用的是同一套平台。但数据模型仍是「文本」的形状——表名就叫 text_projects，带 author（作者）
-- 与 text_type（默认 'poem'，全仓零读写）、documents 带 dynasty（朝代，全仓零读写）。
-- 那些是 MVP 的化石，不是产品假设。
--
-- 本次只做「形状」的通用化：不改任何业务语义，不改 RLS 判定口径（策略名 projects_* 早已就位）。
--
-- 关键：**表改名不是向后兼容变更**。迁移经 CI 先于新代码生效（见 docs/agents/deployment.md），
-- 改名瞬间到新代码构建完成之间，旧代码查 text_projects 会全站 500。
-- 因此本迁移末尾建一个过渡视图把旧名字接回去，等新代码上线后由**另一次**迁移删除
-- ——绝不要与本次同批推送，那等于没建。

-- ── 0. 前置：过渡视图依赖 security_invoker（PG 15+）──────────────────────────
-- 视图默认以属主（postgres）权限执行，会绕过基表 RLS。检测不到能力就直接失败，
-- 不静默降级成一个人人可读全校项目的数据泄露。

do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'PostgreSQL 15+ required for security_invoker views; refusing to create an RLS-bypassing compatibility view';
  end if;
end $$;

-- ── 1. 表与列改名 ────────────────────────────────────────────────────────────
-- author → subtitle：它承载的是归类协议第二行「补充标识（作者/出处/章节）」，
-- 古诗文场景是作者，数学场景可以是章节。是有类型的字段名在假装通用，所以换掉。

alter table public.text_projects rename to projects;
alter table public.projects rename column title to name;
alter table public.projects rename column author to subtitle;

-- 零读写的化石列。text_type 连 e2e 之外的写入都没有（三条 insert 路径都不传，全落默认 'poem'）；
-- documents.dynasty 全仓零读写（含 SQL）。redundant with documents.metadata。
alter table public.projects drop column if exists text_type;
alter table public.documents drop column if exists dynasty;
-- documents.author 同理：唯一写入点显式传 null，从未被读取，语义与 projects.subtitle 重复。
alter table public.documents drop column if exists author;

-- 索引改名：唯一索引的表达式依赖已改名的列，索引本身跟随，只改名字。
alter index if exists public.text_projects_owner_title_normalized_key rename to projects_owner_name_normalized_key;
alter index if exists public.text_projects_class_id_idx rename to projects_class_id_idx;

-- ── 2. 函数改名 ──────────────────────────────────────────────────────────────
-- 用 ALTER FUNCTION RENAME 而不是 drop+create：触发器按 OID 引用函数，改名不动触发器。

alter function public.prevent_text_project_delete() rename to prevent_project_delete;
alter function public.sync_text_project_contract() rename to sync_project_contract;

-- ── 3. 函数体重写：写死表名的地方 ────────────────────────────────────────────
-- 这几个是 security definer，函数体里硬编码了 public.text_projects，必须跟着改。

create or replace function public.prevent_project_delete() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_catalog'
    as $$
begin raise exception 'projects are stable learning units and cannot be hard-deleted'; end $$;

create or replace function public.refresh_project_highest_bloom_level("p_project_id" uuid) returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
DECLARE
  v_level integer;
  v_confirmed integer := 0;
BEGIN
  IF p_project_id IS NULL THEN RETURN; END IF;

  -- 从 L1 向上找连续通过的最高层级
  FOR v_level IN 1..6 LOOP
    IF EXISTS (
      SELECT 1 FROM public.practice_records
      WHERE project_id = p_project_id
        AND target_bloom_level = v_level
        AND achieved = true
        AND evaluation_state = 'evaluated'
    ) THEN
      v_confirmed := v_level;
    ELSE
      EXIT; -- 断层，停止
    END IF;
  END LOOP;

  UPDATE public.projects
  SET highest_bloom_level = CASE WHEN v_confirmed > 0 THEN v_confirmed ELSE NULL END
  WHERE id = p_project_id;
END;
$$;

-- 占位名黑名单：这份是**纵深防御**的第三份副本（应用层 project-title.ts 是唯一真源）。
-- 此前已漂移——它少了「附件会话」。本次对齐全量名单，并由
-- src/lib/__tests__/project-title.test.ts 的源码契约断言两边一致，防止再次漂移。
create or replace function public.sync_project_contract() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare owner_role text; membership_class_id uuid;
begin
  new.name = trim(new.name);
  new.subtitle = nullif(trim(coalesce(new.subtitle, '')), '');
  if new.name = '' then raise exception 'project name cannot be empty'; end if;
  if new.name in ('自动识别中的篇目','未定篇目','待自动归属','待归属篇目','未知篇目','未识别篇目','默认篇目','示例篇目','篇目标题','篇目项目','日常会话归档','附件会话') then raise exception 'placeholder name % cannot be persisted as a project', new.name; end if;
  select p.role into owner_role from public.profiles p where p.id = new.owner_id;
  if owner_role is distinct from 'student' then raise exception 'project owner % must be a student profile', new.owner_id; end if;
  select cm.class_id into membership_class_id from public.class_memberships cm where cm.profile_id = new.owner_id and cm.role = 'student'::public.app_role limit 1;
  if new.class_id is null and membership_class_id is not null then new.class_id = membership_class_id;
  elsif new.class_id is not null and membership_class_id is null then raise exception 'project class % cannot be set because student % has no class membership', new.class_id, new.owner_id;
  elsif new.class_id is not null and new.class_id <> membership_class_id then raise exception 'project class % must match student membership class %', new.class_id, membership_class_id;
  end if;
  return new;
end $$;

create or replace function public.validate_conversation_contract() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare owner_role text; project_owner_id uuid; project_class_id uuid; preset_role public.app_role;
begin
  select p.role into owner_role from public.profiles p where p.id = new.owner_id;
  if owner_role is null then raise exception 'conversation owner % does not exist', new.owner_id; end if;
  if owner_role = 'student' and new.source <> 'student_chat'::public.interaction_source then raise exception 'student conversations must use student_chat source'; end if;
  if owner_role = 'teacher' and new.source <> 'teacher_chat'::public.interaction_source then raise exception 'teacher conversations must use teacher_chat source'; end if;
  if new.source = 'student_chat'::public.interaction_source then
    if owner_role <> 'student' then raise exception 'student_chat conversations must be owned by student profiles'; end if;
    if new.prompt_preset_id is not null then raise exception 'student conversations cannot bind teacher prompt presets'; end if;
    if new.project_id is null then new.class_id = null;
    else
      select p.owner_id, p.class_id into project_owner_id, project_class_id from public.projects p where p.id = new.project_id;
      if project_owner_id is null then raise exception 'conversation project % does not exist', new.project_id; end if;
      if project_owner_id <> new.owner_id then raise exception 'conversation owner % must match project owner %', new.owner_id, project_owner_id; end if;
      new.class_id = project_class_id;
    end if;
  elsif new.source = 'teacher_chat'::public.interaction_source then
    if owner_role <> 'teacher' then raise exception 'teacher_chat conversations must be owned by teacher profiles'; end if;
    if new.project_id is not null or new.class_id is not null then raise exception 'teacher Q&A conversations cannot bind student projects or classes'; end if;
    if new.prompt_preset_id is not null then
      select pp.target_role into preset_role from public.prompt_presets pp where pp.id = new.prompt_preset_id;
      if preset_role is distinct from 'teacher'::public.app_role then raise exception 'teacher Q&A prompt preset must target teacher role'; end if;
    end if;
  else
    raise exception 'conversation source % is deprecated for product conversations', new.source;
  end if;
  return new;
end $$;

create or replace function public.validate_practice_record_contract() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
DECLARE
  project_owner_id uuid;
  existing_pending_id uuid;
BEGIN
  IF new.project_id IS NULL THEN
    RAISE EXCEPTION 'challenge records must belong to a project';
  END IF;

  SELECT p.owner_id INTO project_owner_id
    FROM public.projects p WHERE p.id = new.project_id;

  IF project_owner_id IS NULL THEN
    RAISE EXCEPTION 'challenge project % does not exist', new.project_id;
  END IF;

  IF project_owner_id <> new.student_id THEN
    RAISE EXCEPTION 'challenge student % must match project owner %', new.student_id, project_owner_id;
  END IF;

  IF new.achieved = true AND new.evaluation_state <> 'evaluated' THEN
    RAISE EXCEPTION 'achieved challenges must be evaluated';
  END IF;

  IF tg_op = 'INSERT' AND new.evaluation_state = 'pending' THEN
    SELECT id INTO existing_pending_id
      FROM public.practice_records
      WHERE student_id = new.student_id
        AND project_id = new.project_id
        AND evaluation_state = 'pending'
      LIMIT 1;

    IF existing_pending_id IS NOT NULL THEN
      RAISE EXCEPTION
        'student % already has a pending challenge for project %; block it before generating a new one',
        new.student_id, new.project_id;
    END IF;
  END IF;

  RETURN new;
END $$;

-- ── 4. 触发器改名（挂在已改名的表上）────────────────────────────────────────

alter trigger text_projects_prevent_delete on public.projects rename to projects_prevent_delete;
alter trigger text_projects_sync_contract on public.projects rename to projects_sync_contract;
alter trigger text_projects_touch on public.projects rename to projects_touch;

-- ── 5. 过渡视图：把旧名字接回去，消除部署窗口 ───────────────────────────────
-- security_invoker = true 是必需的，不是选项：视图默认以属主权限执行，
-- 不加这一句就是一个绕过 RLS、向任何登录用户开放全校项目的洞。

create view public.text_projects with (security_invoker = true) as
  select id, owner_id, class_id, name as title, subtitle as author,
         classification_state, highest_bloom_level, created_at, updated_at
  from public.projects;

grant select, insert, update, delete on public.text_projects to anon, authenticated, service_role;

comment on view public.text_projects is
  '过渡兼容视图（20260916132700 起）：让改名迁移与代码部署之间的窗口不打断现网。'
  '新代码一律用 public.projects；本视图由后续一次迁移删除。';

-- ── 6. 自检 ─────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='text_projects' and table_type='BASE TABLE') then
    raise exception 'text_projects is still a base table after migration';
  end if;
  if exists (select 1 from information_schema.columns where table_name='projects' and column_name='text_type') then
    raise exception 'projects.text_type still exists';
  end if;
  if exists (select 1 from information_schema.columns where table_name='documents' and column_name in ('dynasty','author')) then
    raise exception 'documents.dynasty/author still exist';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='projects' and column_name='subtitle') then
    raise exception 'projects.subtitle missing';
  end if;
  -- 过渡视图必须可写：旧代码仍会 insert/update，只读视图会让归档静默失败。
  if (select is_updatable from information_schema.views where table_schema='public' and table_name='text_projects') <> 'YES' then
    raise exception 'compatibility view text_projects is not updatable';
  end if;
  raise notice 'projects 通用化就位；过渡视图 text_projects 可写（security_invoker）';
end $$;
