-- 项目归类交给教师：把归类提示词从代码里的硬编码，变成教师可配、按班生效的数据。
--
-- 产品裁定（2026-09-16）：每个学校的每位教师负责一个学科，项目归属口径应由教师自己的
-- 提示词决定，而不是管理员在代码/后台里统一写死。归类能力的核心本来就是提示词。
--
-- 四个必须一起修的缺陷：
--   1. prompt_presets 只有 is_admin() 的写策略 → 教师端“新建教学模板”实际必然被 RLS 拒绝，
--      教师的提示词从来存不进去（saveTeacherPromptPreset 一直在静默失败）。
--   2. SELECT 只放行 published → 教师连自己存的草稿都读不到。
--   3. 归类提示词没有班级维度 → 一个学校只能有一套归类口径，做不到“每个教师一套”。
--   4. 基线 presets_app_published_read 是 published 全域放行；归类规则也是 published 之后
--      会跨校泄露，必须按 purpose 收窄。
--
-- 本迁移只做数据与权限；归类逻辑的抽象在应用层（student-chat-prompts.ts / classification-rule.ts）。

-- ── 1. 归类预案按班生效 ──────────────────────────────────────────────────────

alter table public.prompt_presets
  add column if not exists class_id uuid references public.classes(id) on delete cascade,
  -- 用途判别：chat=备课问答模板；project_classification=本班项目归类规则。
  -- 不靠 scenario 自由文本判别（那会随文案漂移），用显式枚举。
  add column if not exists purpose text not null default 'chat'
    check (purpose in ('chat', 'project_classification'));

create index if not exists "prompt_presets_class_idx"
  on public.prompt_presets (class_id) where class_id is not null;

-- 一个班最多一条生效中的归类规则。部分唯一索引在数据库层兜住“每班一套”的语义。
create unique index if not exists "prompt_presets_class_rule_key"
  on public.prompt_presets (class_id)
  where purpose = 'project_classification' and status = 'published';

-- ── 2. 教师自助写自己的预设（此前完全缺失）──────────────────────────────────
-- 边界：只能写 created_by = 自己 的行，且 target_role 必须是 teacher；
-- 若指定了 class_id，必须是自己任教（或可管理）的班级，防止给别班/别校挂规则。

drop policy if exists "presets_teacher_own" on public.prompt_presets;
create policy "presets_teacher_own" on public.prompt_presets
  using (
    created_by = public.current_app_user_id()
    and public.current_profile_role() = 'teacher'
  )
  with check (
    created_by = public.current_app_user_id()
    and public.current_profile_role() = 'teacher'
    and target_role = 'teacher'
    and (class_id is null or public.teacher_can_access_class(class_id))
  );

-- ── 3. 收窄既有「所有已发布预设人人可读」策略 ────────────────────────────────
-- 基线策略是 `status='published'` 全域放行；当时只有备课问答模板（无租户维度）所以无碍。
-- 现在归类规则也是 published，若不收窄，A 校教师写的归类口径会被 B 校学生读到。
-- 收窄为只放行 chat 用途；project_classification 走第 4 段按班放行的专属策略。

drop policy if exists "presets_app_published_read" on public.prompt_presets;
create policy "presets_app_published_read" on public.prompt_presets for select
  using (
    purpose = 'chat'
    and status = 'published'
  );

-- ── 4. 学生要能读到本班的归类规则（published）────────────────────────────────
-- 归类由学生会话首问触发，执行身份是学生；读不到本班已发布规则就退化成默认提示词。
-- 同时放行该班任课教师（多教师同班时，后来者要能看到已生效规则，否则一发布就撞唯一索引）。
-- 只放行本班成员 + 已发布；草稿与别班规则都读不到。

create policy "presets_class_rule_read" on public.prompt_presets for select
  using (
    purpose = 'project_classification'
    and status = 'published'
    and class_id is not null
    and (
      public.teacher_can_access_class(class_id)
      or exists (
        select 1 from public.class_memberships cm
        where cm.class_id = prompt_presets.class_id
          and cm.profile_id = public.current_app_user_id()
      )
    )
  );

-- ── 5. 学生要能读到本校目录（含公司模板）────────────────────────────────────
-- 归类提示词允许带上“本校可选归属路径”帮模型对齐口径；学生发起会话时需读得到。
-- 原策略只放行本校自有节点，这里补上本公司下发的模板（school_id 为 NULL）。

drop policy if exists "project_catalogs_school_member_read" on public.project_catalogs;
create policy "project_catalogs_school_member_read" on public.project_catalogs for select
  using (
    exists (
      select 1 from public.profiles me
      where me.id = public.current_app_user_id() and me.status = 'active'
        and (
          (project_catalogs.school_id is not null and project_catalogs.school_id = me.school_id)
          or (project_catalogs.school_id is null and project_catalogs.organization_id = me.organization_id)
        )
    )
  );

-- 自检：确认列与策略就位。
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'prompt_presets' and column_name = 'class_id'
  ) then
    raise exception 'prompt_presets.class_id missing after migration';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'prompt_presets' and policyname = 'presets_teacher_own'
  ) then
    raise exception 'presets_teacher_own missing after migration';
  end if;
  raise notice 'prompt_presets: class_id + purpose + teacher write/read policies ready';
end $$;
