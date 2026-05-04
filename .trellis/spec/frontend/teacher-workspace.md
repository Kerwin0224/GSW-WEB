# Teacher Workspace Guidelines

> Frontend contracts for the teacher preparation, audit, and actionable analytics loop.

---

## Evidence Used

- Current code: `web/src/components/workbench/teacher-audit-client.tsx`, `teacher-chat-client.tsx`, `web/src/lib/data/teacher.ts`, `web/src/lib/data/teacher-actions.ts`, and teacher route pages.
- Supabase MCP: `audit_records`, `prompt_presets`, `conversations`, `conversation_messages`, `practice_records`, `classes`, `class_memberships`, and `profiles` schema.
- Installed shadcn primitives observed locally: `dialog`, `tabs`, `select`, `table`, `scroll-area`, `input`, `textarea`, `label`, `button`, `badge`, and related primitives; `components/ui/form.tsx` is not currently present.
- ABCoder MCP: current ABCoder repo inventory is `GSW-EDU`, which does not expose this Next.js `web/src/**` tree; use local code and Supabase contracts as source of truth for this repo.
- GitNexus MCP: repo listing works for `GSW-WEB`; graph context/cypher endpoints returned a corrupted WAL error during this spec pass, so do not rely on GitNexus graph claims until the index is repaired.
- Context7: TanStack Table row models should keep filtering before sorting/pagination; AI SDK chat UIs must render `message.parts` by part type, including `tool-*` parts; Handlebars uses `{{expr}}`, helpers, block expressions, and escaping, so this product uses a smaller literal placeholder subset.
- Tavily: teacher dashboards should prioritize actionable top issues and evidence over vanity aggregate charts; DPO data is pairwise preference data shaped as `(prompt, chosen, rejected)`.

---

## Scenario: Three-Pane Audit Layout

### 1. Scope / Trigger

- Trigger: `/teacher/audit`, `/teacher/audit/[recordId]`, audit queue components, source-conversation review, or SFT/DPO labeling surfaces.
- The teacher audit page is a workbench, not a table-only page.
- V1 layout is exactly three panes on desktop and a progressive stacked flow on mobile: candidate list -> source conversation -> annotation form.

### 2. Signatures

```ts
type TeacherAuditRecordId = string;

type TeacherAuditFilters = {
  classId: string | 'all';
  projectId: string | 'all';
  studentId: string | 'all';
  status: AuditStatus | 'eligible' | 'all';
  kind: AuditKind | 'all';
  query: string;
};

type AuditQueueRecord = {
  id: string;
  conversationId: string;
  sourceMessageId: string;
  prompt: string;
  answer: string;
  classId: string | null;
  studentId?: string | null;
  projectId?: string | null;
  createdAt: string;
  status?: AuditStatus | 'eligible';
  kind?: AuditKind | 'eligible';
};

type AuditPaneSelection = {
  recordId: TeacherAuditRecordId | null;
  highlightedMessageId: string | null;
};
```

Desktop wireframe:

```text
┌──────────────────────┬──────────────────────────────────┬──────────────────────────┐
│ Candidate list        │ Source conversation              │ SFT / DPO annotation     │
│ - class filter        │ - read-only message thread       │ - status chip            │
│ - project filter      │ - highlighted source message     │ - Tabs: SFT, DPO         │
│ - student filter      │ - prompt, answer, metadata       │ - original/corrected     │
│ - status/kind filter  │ - AI SDK parts/tool disclosure   │ - submit + field errors  │
└──────────────────────┴──────────────────────────────────┴──────────────────────────┘
```

Required component inventory:

| Pane | Required primitives/components |
| --- | --- |
| Candidate list | `Input`, `Select`, `Badge`, `Button`, `ScrollArea` or stable `overflow-y-auto`, optional shadcn `Table` when rows exceed simple card scanning |
| Source conversation | `Card`, `Separator`, `ScrollArea`, `Badge`, `Tooltip`, `AIMessageList`-compatible part renderer |
| Annotation form | `Tabs`, `Textarea`, `RadioGroup`, `Label`, `Button`, `Badge`, field-error text with `role="alert"` |

### 3. Contracts

- Left pane owns selection and filters. It must not be a passive list without class/project/student filters.
- Middle pane is read-only. It shows the full source prompt and answer before any label can be submitted.
- The source message under audit must be visibly highlighted and named by ID or stable short reference for auditability.
- Right pane owns SFT/DPO forms. SFT and DPO are sibling tabs, not separate pages.
- The page must keep selected record context visible during form entry on desktop.
- Use stable pane dimensions: `lg:grid-cols-[22rem_minmax(0,1fr)_26rem]` is acceptable; panes must scroll internally without resizing each other.
- For long candidate lists, use filtering before sorting/pagination. If TanStack Table is introduced, configure row models in that order and provide `getRowId`.
- AI SDK `conversation_messages.parts` must be rendered by `part.type`; text parts render as text, `tool-*` parts render in a collapsed inspectable block, never dropped silently.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| No eligible records | show empty state explaining that only real assistant messages enter audit |
| Filter returns no rows | show filtered-empty state and a clear reset action |
| No selected record | middle and right panes show select-a-record state; submit disabled |
| Selected source message missing | show blocked/error state; do not allow annotation |
| Source conversation inaccessible | show permission/data error; do not infer context from stale queue text |
| AI SDK tool part present | render inspectable tool block with type label |
| Mobile viewport | candidate list appears first, then source, then form; no horizontal overflow |

### 5. Good/Base/Bad Cases

- Good: teacher filters to Class 2 + current text + a student, selects one pending assistant answer, reads surrounding messages, then labels it in SFT or DPO without losing context.
- Good: the selected row stays visibly active while the form is open.
- Base: three panes render with simple row cards and internal scroll areas.
- Bad: a single flat `<TeacherAuditClient records={records} />` view that exposes forms without enough source context.
- Bad: tool calls or message parts are omitted because only `content` is rendered.

### 6. Tests Required

- Route smoke for `/teacher/audit` empty, populated, selected, and filtered-empty states.
- Component test that source message highlighting changes with selected record.
- Keyboard test: filters, candidate rows, tabs, textareas, and submit buttons are reachable in order.
- Mobile visual smoke confirms no pane overlap and no horizontal scrolling.
- AI message-part test renders `text`, unknown, and `tool-*` parts safely.

### 7. Wrong vs Correct

#### Wrong

```tsx
<main>
  {records.map(record => <SftForm record={record} />)}
</main>
```

#### Correct

```tsx
<TeacherAuditWorkbench
  filters={filters}
  records={records}
  selectedRecordId={selectedRecordId}
  sourceConversation={sourceConversation}
  annotationPanel={<AuditAnnotationTabs record={selectedRecord} />}
/>
```

---

## Scenario: SFT vs DPO Form Contract

### 1. Scope / Trigger

- Trigger: any frontend form, server action, validation state, export preview, or status UI that creates or updates `audit_records`.
- The canonical frontend contract follows generated types in `web/src/lib/supabase/database.types.ts`; Supabase remote also has older dataset/export columns, so code must prefer canonical fields when both exist.

### 2. Signatures

Canonical app types:

```ts
type AuditKind = 'sft' | 'dpo';
type AuditStatus = 'pending' | 'approved' | 'rejected' | 'exported';

type AuditRecordRow = {
  id: string;
  source_message_id: string | null;
  source_conversation_id: string | null;
  auditor_id: string | null;
  class_id: string | null;
  kind: AuditKind;
  status: AuditStatus;
  quality: string | null;
  prompt: string;
  original_answer: string | null;
  corrected_answer: string | null;
  chosen_answer: string | null;
  rejected_answer: string | null;
  rationale: string | null;
  metadata: Json;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
};

type SftAuditForm = {
  prompt: string;
  original_answer: string;
  quality: 'accurate' | 'needs_correction' | 'reject';
  corrected_answer: string;
  rationale: string;
};

type DpoAuditForm = {
  prompt: string;
  original_answer: string;
  chosen_answer: string;
  rejected_answer: string;
  preference_rationale: string;
};
```

Supabase remote `audit_records` columns observed in this pass:

```text
id, source_type, source_id, dataset_type, status, original_prompt,
original_answer, corrected_answer, chosen_answer, rejected_answer,
preference_rationale, quality_score, auditor_id, source_metadata,
created_at, updated_at, source_message_id, source_conversation_id,
class_id, kind, quality, prompt, rationale, metadata, exported_at
```

Frontend/server actions must write the canonical fields:

```text
source_message_id, source_conversation_id, auditor_id, class_id, kind,
status, quality, prompt, original_answer, corrected_answer, chosen_answer,
rejected_answer, rationale, metadata
```

### 3. Contracts

- SFT creates one supervised correction candidate: `kind='sft'`.
- DPO creates one pairwise preference candidate: `kind='dpo'`; V1 supports only `chosen_answer` and `rejected_answer`, not three-way ranking.
- SFT `quality='accurate'` may approve with `corrected_answer=null` and `rationale=null`.
- SFT `quality='needs_correction'` requires `corrected_answer` and `rationale`.
- SFT `quality='reject'` requires `rationale` and writes `status='rejected'`.
- DPO always requires `chosen_answer`, `rejected_answer`, and `rationale`/`preference_rationale`.
- `prompt` and `original_answer` are always required at submit time, even if hidden inputs carry them.
- `source_message_id` must reference an assistant `conversation_messages` row; do not label user/system/tool messages as the target answer.
- Status options visible to the teacher are `pending`, `approved`, `rejected`, and `exported`. If the remote database exposes `in_review`, treat it as a queue/display state only until generated types include it.

### 4. Validation & Error Matrix

| Condition | Error target | Required behavior |
| --- | --- | --- |
| Missing source record | form summary | block submit |
| Missing prompt | `prompt` | block submit |
| Missing original answer | `original_answer` | block submit |
| Invalid SFT quality | `quality` | block submit |
| SFT needs correction but corrected answer empty | `corrected_answer` | block submit |
| SFT needs correction/reject but rationale empty | `rationale` | block submit |
| DPO chosen empty | `chosen_answer` | block submit |
| DPO rejected empty | `rejected_answer` | block submit |
| DPO chosen equals rejected after trim | both answer fields | block submit |
| Record already exported | form summary | render read-only; no overwrite |

### 5. Good/Base/Bad Cases

- Good: SFT correction shows original prompt, original answer, corrected answer, quality, and rationale before approval.
- Good: DPO form labels the two responses as `Chosen answer` and `Rejected answer`, with the original answer available as a seed but editable.
- Base: server action returns `{ ok, message, errors }` and every field error is rendered next to the field.
- Bad: DPO form stores a third alternate answer or stores rationale only in local UI state.
- Bad: approving a record with an empty hidden prompt because the selected row changed mid-submit.

### 6. Tests Required

- SFT validation cases: accurate, needs correction, reject, invalid quality.
- DPO validation cases: missing chosen, missing rejected, identical chosen/rejected, missing rationale.
- Insert payload test confirms canonical field names and `kind`.
- Permission smoke confirms teacher can label only accessible source records.
- Export read-only smoke confirms exported records cannot be relabeled from teacher UI.

### 7. Wrong vs Correct

#### Wrong

```ts
await insertAudit({ dataset_type: 'dpo', answer_a, answer_b, answer_c });
```

#### Correct

```ts
await insertAudit({
  kind: 'dpo',
  status: 'approved',
  prompt,
  original_answer: originalAnswer,
  chosen_answer: chosenAnswer,
  rejected_answer: rejectedAnswer,
  rationale: preferenceRationale,
});
```

---

## Scenario: Original vs Corrected Answer Diff View

### 1. Scope / Trigger

- Trigger: SFT correction forms, audit review detail, export preview, or any UI comparing model output with teacher-edited output.

### 2. Signatures

```ts
type AnswerDiffViewProps = {
  originalAnswer: string;
  correctedAnswer: string;
  mode: 'sft-correction' | 'review';
  highlightGranularity: 'line' | 'sentence';
};
```

### 3. Contracts

- SFT correction must show original answer and corrected answer side by side on desktop.
- Original answer is read-only. Corrected answer is editable only while the record is not exported.
- The diff view is a review aid; the textarea remains the source of form submission truth.
- Empty corrected answer is allowed only when quality is `accurate` or `reject`.
- Diff colors cannot be the only signal: label changed, removed, and added text with text or icons.
- Do not use a heavy diff dependency unless explicitly approved. A line/sentence comparison is enough for V1.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Original answer is empty | block SFT form; show data error |
| Corrected answer is empty for `needs_correction` | field error and empty diff state |
| Corrected answer equals original | warn teacher that no correction was made; allow only if rationale explains approval |
| Long answer | panes scroll internally; form buttons stay reachable |
| Mobile viewport | stack original above corrected with labels preserved |

### 5. Good/Base/Bad Cases

- Good: teacher edits a problematic explanation and sees changed sentences highlighted beside the original answer.
- Base: read-only original card plus editable corrected textarea with changed/unchanged labels.
- Bad: replacing the original answer in place so the teacher cannot compare what changed.
- Bad: red/green-only diff with no text labels.

### 6. Tests Required

- Diff renders added, removed, changed, and unchanged content labels.
- Long Chinese answer does not overflow the pane.
- Screen reader labels identify original answer and corrected answer.
- Submit payload remains the textarea value, not derived diff text.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Textarea name="corrected_answer" defaultValue={record.original_answer ?? ''} />
```

#### Correct

```tsx
<AnswerDiffView originalAnswer={record.original_answer ?? ''} correctedAnswer={corrected} mode="sft-correction" highlightGranularity="sentence" />
```

---

## Scenario: Teacher Prompt Preset Editor

### 1. Scope / Trigger

- Trigger: `/teacher/instructions`, teacher-owned preset creation/editing/previewing, preset variable forms, or converting high-quality teacher chat output into a preset draft.
- Admin preset governance remains under `/admin/presets`; teacher workspace owns teacher-authored drafts and previews.

### 2. Signatures

```ts
type TeacherPromptPreset = {
  id: string;
  title: string;
  scenario: string;
  system_instruction: string;
  user_template: string | null;
  variables: Array<TeacherPromptVariable>;
  target_role: 'teacher';
  status: 'draft' | 'published' | 'disabled';
  version: number;
  created_by: string | null;
  updated_at: string;
};

type TeacherPromptVariable = {
  name: string;
  label: string;
  required: boolean;
  sample: string;
};

type PromptPreviewInput = Record<string, string>;
```

Variable syntax decision:

```text
Use literal `{{variable_name}}` placeholders.
Do not expose full Handlebars helpers, block expressions, loops, triple-stash output, or executable template logic in V1.
```

### 3. Contracts

- The editor uses left edit / right preview layout on desktop.
- Left side includes title, scenario, `system_instruction`, optional `user_template`, and variable definitions.
- Right side renders a mock conversation preview using sample variable values.
- Variables use the literal regex `{{\s*([a-zA-Z0-9_\u4e00-\u9fff-]+)\s*}}` for detection, then normalize names by trimming whitespace.
- `{{学生姓名}}` and `{{当前篇目}}` are valid variable names.
- Missing required sample values block preview and publish actions.
- Context7 confirms Handlebars supports helpers, block expressions, and escaping behavior; this product intentionally does not expose full Handlebars because teacher presets are prompt text, not executable UI templates.
- Preview output must be plain text. Never render interpolated teacher input as raw HTML.
- Required primitives: native `<form>` plus shadcn `Dialog`, `Tabs`, `Select`, `Textarea`, `Input`, `Label`, `Button`, and `Badge`. If a project-owned `components/ui/form.tsx` is added later, migrate validation layout to that wrapper without changing field names.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Empty title | field error |
| Empty scenario | field error |
| Empty `system_instruction` | field error |
| Placeholder exists without variable definition | field error listing missing variables |
| Required variable sample empty | preview blocked |
| Unknown variable value at runtime | keep placeholder visibly unresolved; do not silently remove |
| Teacher edits published preset | create new draft/version instead of mutating exported history |
| Teacher has no presets | empty state with create action |
| Provider blocked | editor still works; mock AI preview action is disabled with blocked reason |

### 5. Good/Base/Bad Cases

- Good: teacher writes “请用适合{{学生姓名}}的方式讲解{{当前篇目}}”, defines both variables, previews a mock exchange, then saves a draft.
- Good: a high-quality teacher chat output can open `/teacher/instructions?sourceConversationId=...` to seed a draft after review.
- Base: teacher can create a draft, preview interpolation, and save it without admin-only fields.
- Bad: letting teachers write `{{#if}}` blocks or helpers that introduce hidden logic.
- Bad: previewing unresolved variables as empty strings.

### 6. Tests Required

- Placeholder parser accepts Chinese names and ASCII names.
- Parser rejects helper/block/triple-stash syntax as unsupported.
- Preview renders all required variables and blocks missing samples.
- Draft save preserves `target_role='teacher'`.
- Teacher cannot edit another teacher's private draft.

### 7. Wrong vs Correct

#### Wrong

```text
{{#if 学生姓名}}给 {{学生姓名}} 出题{{/if}}
```

#### Correct

```text
请根据{{学生姓名}}当前正在学习的{{当前篇目}}，设计三个分层追问。
```

---

## Scenario: Actionable Analytics

### 1. Scope / Trigger

- Trigger: `/teacher/analytics`, teacher home metric cards, class/student drilldowns, and links from analytics into audit or teacher chat.
- V1 does not include heatmaps. Top lists and coverage cards are the required product surface.

### 2. Signatures

```ts
type TeacherAnalyticsSummary = {
  stuckStudents: StuckStudentMetric[];
  weakProjects: WeakProjectMetric[];
  auditCoverage: AuditCoverageMetric;
};

type StuckStudentMetric = {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  lowLevelStreak: number;
  latestProjectId: string | null;
  latestProjectTitle: string | null;
  evidenceMessageIds: string[];
};

type WeakProjectMetric = {
  projectId: string;
  title: string;
  classId: string | null;
  lowLevelAttemptCount: number;
  affectedStudentCount: number;
};

type AuditCoverageMetric = {
  weekStart: string;
  eligibleCount: number;
  auditedCount: number;
  coverageRate: number;
};
```

SQL skeletons:

```sql
-- Top 5 stuck students: repeated L1-L2 practice attempts without achievement.
select
  p.id as student_id,
  p.display_name as student_name,
  c.id as class_id,
  c.name as class_name,
  count(*) filter (
    where pr.target_bloom_level between 1 and 2
      and coalesce(pr.achieved, false) = false
      and pr.evaluation_state in ('evaluated', 'failed')
  ) as low_level_streak,
  max(pr.project_id::text) as latest_project_id
from practice_records pr
join profiles p on p.id = pr.student_id
join class_memberships cm on cm.profile_id = p.id and cm.role = 'student'
join classes c on c.id = cm.class_id
join class_memberships teacher_scope
  on teacher_scope.class_id = c.id
 and teacher_scope.role = 'teacher'
 and teacher_scope.profile_id = :teacher_id
where pr.created_at >= now() - interval '14 days'
group by p.id, p.display_name, c.id, c.name
having count(*) filter (
  where pr.target_bloom_level between 1 and 2
    and coalesce(pr.achieved, false) = false
    and pr.evaluation_state in ('evaluated', 'failed')
) >= 3
order by low_level_streak desc
limit 5;

-- Top 5 weak projects/texts: many low-level unsuccessful attempts.
select
  tp.id as project_id,
  tp.title,
  tp.class_id,
  count(*) as low_level_attempt_count,
  count(distinct pr.student_id) as affected_student_count
from practice_records pr
join text_projects tp on tp.id = pr.project_id
join class_memberships teacher_scope
  on teacher_scope.class_id = tp.class_id
 and teacher_scope.role = 'teacher'
 and teacher_scope.profile_id = :teacher_id
where pr.target_bloom_level between 1 and 2
  and coalesce(pr.achieved, false) = false
  and pr.created_at >= now() - interval '14 days'
group by tp.id, tp.title, tp.class_id
order by affected_student_count desc, low_level_attempt_count desc
limit 5;

-- Weekly audit coverage: audited real records over eligible assistant messages.
with eligible as (
  select cm.id
  from conversation_messages cm
  join conversations c on c.id = cm.conversation_id
  join class_memberships teacher_scope
    on teacher_scope.class_id = c.class_id
   and teacher_scope.role = 'teacher'
   and teacher_scope.profile_id = :teacher_id
  where cm.role = 'assistant'
    and cm.created_at >= date_trunc('week', now())
),
audited as (
  select distinct ar.source_message_id
  from audit_records ar
  where ar.auditor_id = :teacher_id
    and ar.created_at >= date_trunc('week', now())
)
select
  (select count(*) from eligible) as eligible_count,
  (select count(*) from audited where source_message_id in (select id from eligible)) as audited_count;
```

### 3. Contracts

- First viewport cards are: Top 5 stuck students, Top 5 weak texts/projects, and this week's audit coverage.
- Each card row must show evidence and a next action, not only a number.
- “Stuck” means repeated low-level unsuccessful practice in the teacher's class scope. V1 threshold: at least 3 unsuccessful L1-L2 attempts within 14 days; the product copy may say “连续卡在 L1-L2” only when ordering confirms continuity.
- “Weak project” means a text/project has multiple affected students or many low-level unsuccessful attempts.
- “Audit coverage” compares eligible assistant messages with audited records in the current week.
- Do not add a heatmap in V1. If a heatmap appears later, it belongs below the top-list action cards.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Teacher has no assigned classes | assignment-needed state |
| No practice records | empty analytics state with link to teacher chat/student practice setup |
| No audit records but eligible messages exist | coverage card shows 0% and links to audit queue |
| No eligible messages | coverage card explains no real source data yet |
| Query failure | error state names the failing metric |
| Student/project outside teacher scope | never render |

### 5. Good/Base/Bad Cases

- Good: “王同学，L1-L2 未达成 5 次，最近篇目《岳阳楼记》” with actions to open conversation or plan a review.
- Good: “《出师表》影响 4 人，低阶题未达成 12 次” with action to start a teacher chat seeded with that text.
- Base: three cards list top rows and show honest empty states.
- Bad: one large KPI row with assigned class count, pending audit count, and placeholder “students needing review: 0”.
- Bad: decorative heatmap with no action links.

### 6. Tests Required

- Query/unit tests for teacher scope isolation.
- Empty/no-class/no-practice/no-audit states.
- Threshold tests for stuck student inclusion and exclusion.
- Link tests from analytics row to `/teacher/audit`, `/teacher`, or student-scoped conversation view.
- Accessibility test that row actions have specific labels.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Card title="平均完成率">82%</Card>
```

#### Correct

```tsx
<ActionableMetricCard
  title="Top 5 卡住学生"
  rows={stuckStudents}
  renderAction={student => <Link href={`/teacher/analytics?studentId=${student.studentId}`}>查看证据</Link>}
/>
```

---

## Scenario: Cross-Surface Navigation

### 1. Scope / Trigger

- Trigger: links among teacher chat, teacher instructions, audit queue/detail, analytics rows, and saved teaching artifacts.

### 2. Signatures

```ts
type TeacherSurface =
  | '/teacher'
  | '/teacher/instructions'
  | '/teacher/audit'
  | '/teacher/audit/[recordId]'
  | '/teacher/analytics';

type TeacherDeepLink = {
  href: string;
  source: 'chat' | 'audit' | 'analytics' | 'instructions';
  recordId?: string;
  conversationId?: string;
  sourceMessageId?: string;
  studentId?: string;
  classId?: string;
  projectId?: string;
};
```

### 3. Contracts

- From a pending or eligible audit row, link to `/teacher/audit?recordId=<id>&messageId=<sourceMessageId>`.
- From source conversation, provide a route back to the teacher chat or conversation detail when the teacher has access.
- From analytics stuck-student rows, link to filtered analytics evidence and to audit queue filtered by `studentId` when eligible records exist.
- From a high-quality teacher chat output, link to `/teacher/instructions?sourceConversationId=<id>&sourceMessageId=<id>` to seed a preset draft.
- From instructions preview, link back to `/teacher` with `presetId` when the preset is usable.
- Deep links must preserve teacher scope. A link may encode IDs, but the server loader must re-check role and class membership.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Deep-linked record not found | not-found/empty selected state; do not select first row silently |
| Deep-linked record outside teacher scope | permission-denied state |
| Deep link has stale source message | show unavailable source error |
| Analytics link has no eligible audit records | show filtered-empty state with reset |
| Preset draft source conversation unavailable | show source-unavailable warning and empty editor |

### 5. Good/Base/Bad Cases

- Good: teacher clicks a stuck student, sees evidence, then jumps to that student's relevant conversation or audit candidate.
- Good: teacher turns a strong AI answer into a prompt preset draft with source metadata attached.
- Base: links preserve filters through query parameters and loaders validate them.
- Bad: analytics links to generic `/teacher/audit` and loses the student/project context.
- Bad: client-only navigation assumes access because an ID is present in the URL.

### 6. Tests Required

- Deep-link selection smoke for audit record and source message.
- Permission smoke for cross-class IDs.
- Query-param preservation for class/project/student filters.
- Seed-preset flow smoke from teacher chat source to instructions editor.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Link href="/teacher/audit">去审计</Link>
```

#### Correct

```tsx
<Link href={`/teacher/audit?studentId=${studentId}&projectId=${projectId}&recordId=${recordId}`}>审计这条证据</Link>
```

---

## Scenario: Audit Status Chip System

### 1. Scope / Trigger

- Trigger: audit queue rows, audit detail headers, analytics audit coverage, export preview, and any SFT/DPO status display.

### 2. Signatures

```ts
type AuditStatusChipState =
  | 'eligible'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'exported'
  | 'in_review';

type AuditStatusChipProps = {
  status: AuditStatusChipState;
  kind?: AuditKind | 'eligible';
  label?: string;
};
```

Token mapping:

```text
eligible  -> muted background + foreground
pending   -> --zijin-gold foreground/accent tint
in_review -> --primary foreground/accent tint
approved  -> success semantic token when available; until then use a non-destructive green utility in one shared component only
rejected  -> --destructive foreground/accent tint
exported  -> --bloom-6 or achievement accent when design-system task publishes final token
sft       -> --primary accent mark
dpo       -> --accent / --zijin-gold accent mark
```

### 3. Contracts

- Chip color must be centralized in one component or token map, not duplicated in page code.
- Color is never the only signal. Include text such as `SFT approved`, `DPO rejected`, or Chinese equivalents.
- Queue rows show both `kind` and `status` when a row has an audit record.
- Eligible source records that have not yet created `audit_records` use `eligible`, not fake `pending`.
- The current global UI/UX token contract exposes `--primary`, `--destructive`, `--accent`, `--zijin-gold`, and Bloom tokens. If `.trellis/spec/frontend/design-tokens.md` is added later, this section must link to it.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Unknown status | render neutral `Unknown` chip and log/flag in development |
| Missing kind for audited record | show status only, do not guess SFT/DPO |
| Rejected status | destructive styling plus text label |
| Exported status | read-only styling plus exported label |
| High contrast mode | chip remains legible without relying on tint alone |

### 5. Good/Base/Bad Cases

- Good: queue can be scanned by `eligible`, `SFT approved`, `DPO rejected`, and `exported` chips with labels.
- Base: `Badge` variant wrappers use token classes and accessible labels.
- Bad: hardcoded random green/red/yellow classes across pages.
- Bad: showing `pending` for records that are merely eligible source messages.

### 6. Tests Required

- Snapshot/component tests for every status and kind combination.
- Accessibility test for chip text and `aria-label`.
- Static review that status colors are not reimplemented in route pages.
- Visual smoke for light/dark themes if dark mode is enabled.

### 7. Wrong vs Correct

#### Wrong

```tsx
<span className="rounded bg-yellow-100 text-yellow-800">{status}</span>
```

#### Correct

```tsx
<AuditStatusChip kind={record.kind} status={record.status} />
```
