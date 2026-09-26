-- ═══════════════════════════════════════════════════════════════════════════
-- 评价框架从代码常量变成租户可配置的数据
-- ═══════════════════════════════════════════════════════════════════════════
-- 旧模型把「AI 该看什么」写死成提示词里的一句自然语言 bullet：
--   「优先关注讲错概念或术语、误引材料或依据、事实性错误、解释牵强……」
-- 物理要的量纲与单位、编程要的代码可运行性、英语要的语域与语篇，
-- 一条都加不进去，只能改代码发版。疑点标签又是模型自由文本，
-- 同一个错误在不同会话被叫作「依据不足」「推理牵强」「与问题不匹配」，
-- 看板按字符串 join、队列按字符串聚合，「本班最常见的 3 类问题」永远统计不出来。
--
-- 同样写死的还有 Bloom 六层：check 约束在三张表上，challenge 出题与评阅口径
-- 100% 在代码里，改一套评价框架要重写 DB 约束 + 触发器 + 全前端。
--
-- 改法：维度与层级进表，提示词从表渲染，标签落稳定键。

-- ── 1. 预审维度表 ────────────────────────────────────────────────────────
-- school_id 为 NULL = 平台默认；学校可覆盖或停用某一维度。
-- prompt_fragment 是给模型看的判定说明，与 label 分开：显示名会改，
-- 判定口径是租户的教学承诺，不该跟着 UI 文案漂。
create table if not exists public.review_dimensions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  label_key text not null,
  display_name text not null,
  criteria text not null,
  default_severity text not null default 'medium'
    check (default_severity in ('low', 'medium', 'high')),
  prompt_fragment text not null,
  sort_order integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_dimensions_key_format check (label_key ~ '^[a-z][a-z0-9_]{1,39}$')
);

-- 平台默认（school_id IS NULL）全平台唯一；同一学校内 label_key 唯一。
create unique index if not exists review_dimensions_platform_key
  on public.review_dimensions (label_key) where school_id is null;
create unique index if not exists review_dimensions_school_key
  on public.review_dimensions (school_id, label_key) where school_id is not null;

create index if not exists review_dimensions_school_idx
  on public.review_dimensions (school_id, sort_order);

alter table public.review_dimensions enable row level security;

-- 平台默认对所有已登录账号可读；本租户行只对本租户。
drop policy if exists "review_dimensions_read" on public.review_dimensions;
create policy "review_dimensions_read" on public.review_dimensions for select
  using (school_id is null or public.can_admin_school_scope(school_id));

drop policy if exists "review_dimensions_admin_write" on public.review_dimensions;
create policy "review_dimensions_admin_write" on public.review_dimensions for all
  using (school_id is not null and public.can_admin_school_scope(school_id))
  with check (school_id is not null and public.can_admin_school_scope(school_id));

drop trigger if exists review_dimensions_touch on public.review_dimensions;
create trigger review_dimensions_touch
  before update on public.review_dimensions
  for each row execute function public.touch_updated_at();

-- 平台默认六维：把原提示词里那句 bullet 拆成可配置行。
-- 内容保持与旧提示词同义，只是从此可改、可停用、可按学科增删。
insert into public.review_dimensions
  (school_id, label_key, display_name, criteria, default_severity, prompt_fragment, sort_order)
values
  (null, 'concept_error', '概念错误',
   '把概念、术语、定义讲错，或与本学科已确立的表述冲突', 'high',
   '讲错概念或术语，或与本学科已确立的表述冲突。', 10),
  (null, 'evidence_misuse', '依据误用',
   '引用了不存在的材料，或把无依据的推测说成定论', 'high',
   '误引材料或依据，或把无依据的推测说成定论。', 20),
  (null, 'factual_error', '事实错误',
   '与客观事实、学科结论或给定条件矛盾', 'high',
   '存在事实性错误，或与题目给定条件矛盾。', 30),
  (null, 'unsound_reasoning', '推理牵强',
   '推理链断裂、跳步或结论不由前提推出', 'medium',
   '解释牵强：推理链断裂、跳步，或结论不由前提推出。', 40),
  (null, 'misaligned', '与问题不匹配',
   '回答与学生实际提出的问题明显不对应', 'medium',
   '与学生问题明显不匹配。', 50),
  (null, 'guidance_issue', '教学引导不当',
   '在当前学习阶段给出了不当的引导或代做', 'low',
   '教学引导不当：在当前学习阶段代做或给出超纲结论。', 60)
on conflict do nothing;

-- ── 2. 预审结果落稳定键 ──────────────────────────────────────────────────
-- metadata 里原来只有 issues[{quote,label,severity}]。加 dimension_key 后，
-- 同一错误跨会话、跨学期可聚合；label 保留快照，历史记录仍然可读。
-- 过渡期两者都可空：旧行没有键，新行没查到维度时退回自由 label。

-- ── 3. 评价层级：从 check 约束变成表 ─────────────────────────────────────
create table if not exists public.rubric_levels (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete cascade,
  level_key text not null,
  ordinal integer not null check (ordinal between 1 and 12),
  name text not null,
  operation text not null,
  hint text,
  requires_previous boolean not null default false,
  enabled boolean not null default true
  -- 三种归属：平台默认（两者皆空）、学校级、空间级。
  -- 不加 check 约束：平台默认行是合法数据，任何「至少一个非空」的约束都会拦掉它。
);

create unique index if not exists rubric_levels_school_key
  on public.rubric_levels (school_id, level_key) where school_id is not null and space_id is null;
create unique index on public.rubric_levels (space_id, level_key) where space_id is not null;
create unique index on public.rubric_levels (school_id, ordinal) where space_id is null;

alter table public.rubric_levels enable row level security;

drop policy if exists "rubric_levels_read" on public.rubric_levels;
create policy "rubric_levels_read" on public.rubric_levels for select
  using (
    (school_id is not null and public.can_admin_school_scope(school_id))
    or (space_id is not null and public.teacher_can_access_space(space_id))
    or (space_id is not null and exists (
          select 1 from public.space_members sm where sm.space_id = space_id
            and sm.student_id = public.current_app_user_id()))
  );

drop policy if exists "rubric_levels_admin_write" on public.rubric_levels;
create policy "rubric_levels_admin_write" on public.rubric_levels for all
  using (
    (school_id is not null and public.can_admin_school_scope(school_id))
    or (space_id is not null and public.teacher_can_access_space(space_id))
  )
  with check (
    (school_id is not null and public.can_admin_school_scope(school_id))
    or (space_id is not null and public.teacher_can_access_space(space_id))
  );

drop trigger if exists rubric_levels_touch on public.rubric_levels;
create trigger rubric_levels_touch
  before update on public.rubric_levels
  for each row execute function public.touch_updated_at();

-- 平台默认六层：把代码常量 BLOOM_LEVELS 搬进表，名称与操作描述保持一致。
-- ordinal 与既有 1..6 的整数列对齐，所以不需要数据回填。
insert into public.rubric_levels
  (school_id, space_id, level_key, ordinal, name, operation, hint, requires_previous)
values
  (null, null, 'L1', 1, '记忆', 'recognize / remember',
   '能说出或找出材料中的明确信息。', false),
  (null, null, 'L2', 2, '理解', 'explain / summarize',
   '能用自己的话解释并复述要点。', true),
  (null, null, 'L3', 3, '应用', 'apply / demonstrate',
   '能把已学方法用到新的具体情境。', true),
  (null, null, 'L4', 4, '分析', 'analyze / differentiate',
   '能分辨组成部分、关系与差异。', true),
  (null, null, 'L5', 5, '评价', 'evaluate / justify',
   '能基于依据判断合理性并说明理由。', true),
  (null, null, 'L6', 6, '创造', 'create / construct',
   '能组织已有内容形成新的方案或结论。', true)
on conflict do nothing;

-- 平台默认行：school_id 与 space_id 皆空，用一条独立的部分唯一索引管住重复。
create unique index if not exists rubric_levels_platform_key
  on public.rubric_levels (level_key) where school_id is null and space_id is null;

-- ── 4. 最高层级：连续前缀 → 已通过集合的 max ─────────────────────────────
-- refresh_project_highest_bloom_level 原语义是「从 L1 起连续通过，断层即停」。
-- 后果：一个只通过 L3 与 L5 的学生（跨年级插班、成人学习、已有诊断结果的转入生）
-- highest_bloom_level 被写成 NULL，学生侧「已完成层级」显示 0，导出与统计全错；
-- 而这类学生想从 L1 逐级重来，要跑六次模型往返。
-- 改为「已通过集合的最大层级」：跳层合法，展示用的连续路线图由应用层另外算。
-- 保持原签名 (p_project_id uuid) returns void：调用方是 practice_records 上的
-- 触发器与若干迁移脚本，改成无参触发器函数会制造同名不同签名的重载，
-- 而 pg_proc 那种按 proname 聚合的断言会给出与实际相反的结论。
create or replace function public.refresh_project_highest_bloom_level("p_project_id" uuid) returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare v_best smallint;
begin
  if p_project_id is null then return; end if;

  -- 已通过集合的最大层级，而不是「从 L1 起连续通过的最高层级」。
  -- 断层即停的原语义会把「只通过 L3 与 L5」的学生算成 0，
  -- 于是 highest_bloom_level 写 NULL、导出与统计全错，且这类学生想确认起点
  -- 要跑满六次模型往返。跳层合法：路线图由应用层另算，不在数据层强制前缀。
  select max(r.target_bloom_level) into v_best
    from public.practice_records r
   where r.project_id = p_project_id
     and r.achieved
     and r.evaluation_state = 'evaluated';

  update public.projects
     set highest_bloom_level = v_best
   where id = p_project_id
     and highest_bloom_level is distinct from v_best;
end;
$$;

revoke execute on function public.refresh_project_highest_bloom_level(uuid) from public, anon, authenticated;

-- ── 5. 预设用途与空间维度 ───────────────────────────────────────────────
-- purpose 此前是 2 值 check（chat / project_classification）。挑战出题、挑战评阅、
-- 学生会话三处提示词 100% 硬编码，租户改不了：同一张表、同一个 buildXxxSystemPrompt
-- 模式，学生侧独缺预设通道。
alter table public.prompt_presets drop constraint if exists prompt_presets_purpose_check;
alter table public.prompt_presets
  add constraint prompt_presets_purpose_check
  check (purpose in ('chat', 'project_classification', 'student_chat',
                     'challenge_generation', 'challenge_evaluation', 'pre_review'));

-- 空间级预设：归类规则已经能下沉到空间，其他口径也该能。
alter table public.prompt_presets add column if not exists space_id uuid references public.spaces(id) on delete cascade;
create index if not exists prompt_presets_space_idx on public.prompt_presets (space_id, purpose);

-- 预设归属判定收紧成三选一，避免出现既不属于班级也不属于空间也不属于学校的孤儿行。
alter table public.prompt_presets
  add constraint prompt_presets_scope_single check (
    num_nonnulls(class_id, space_id, school_id) <= 1
  ) not valid;
alter table public.prompt_presets validate constraint prompt_presets_scope_single;

-- ── 6. 空间自带的引导语 ────────────────────────────────────────────────
-- 学生首屏的四个追问示例写死在组件里，跨学科空间共用同一套引导。
-- 数学老师需要「先写出解题步骤再问我」，英语老师需要句型支架。
alter table public.spaces add column if not exists starter_prompts jsonb;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema='public' and table_name='review_dimensions'
  ) then
    raise exception 'public.review_dimensions missing';
  end if;
  if (select count(*) from public.review_dimensions where school_id is null) <> 6 then
    raise exception 'platform review dimensions must be seeded exactly 6';
  end if;
  if (select count(*) from public.rubric_levels where space_id is null and school_id is null) <> 6 then
    raise exception 'platform rubric levels must be seeded exactly 6';
  end if;
  raise notice '评价框架就位：维度表 + 层级表 + 预设用途扩展 + 最高层级语义修正';
end $$;
