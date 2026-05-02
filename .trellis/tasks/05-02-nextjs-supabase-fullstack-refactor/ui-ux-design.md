# 文韵智途 UI/UX Design Lock v1

> Status: locked for implementation planning.  
> Scope: Next.js + Tailwind CSS + shadcn/ui + Vercel AI SDK + Supabase full-stack refactor.  
> Constraint: UI/UX must be complete before application implementation continues. No legacy fallback, no mock success, no generic chatbot shell.

---

## 1. Product Design Thesis

文韵智途 is a role-aware AI education workbench for classical poetry and classical Chinese learning.

The product must feel like:

- **Student**: a calm learning desk that helps the student ask, practice, and see cognitive growth.
- **Teacher**: a teaching-support and audit desk where AI output is inspectable, editable, and turned into quality data.
- **Admin**: a system governance console that makes readiness, capabilities, permissions, and export state explicit.

The UI must not feel like:

- a generic AI chat product,
- a broad LMS/course marketplace,
- an admin dashboard reused for students,
- a scaffold/demo app,
- a mock interface that pretends the system works without real Supabase/provider configuration.

---

## 2. First-Principles Model

### 2.1 Core object hierarchy

```text
School system
  -> verified role/profile
    -> role workspace
      -> task flow
        -> educational artifact
          -> learning/audit/export evidence
```

Role-specific artifacts:

```text
Student
  -> poem/text project
    -> questions
    -> AI answers
    -> Bloom annotations
    -> practice attempts
    -> learning progress

Teacher
  -> class/student scope
    -> prompt preset teaching ask
    -> teacher/AI interaction
    -> auditable student/teacher record
    -> SFT/DPO label

Admin
  -> users/classes
  -> provider capabilities
  -> MCP capabilities
  -> prompt preset lifecycle
  -> audited export batches
```

### 2.2 UX consequence

The primary noun in UI copy is never just “chat”. Instead:

- Student: `学习提问`, `篇目项目`, `认知路径`, `层级练习`.
- Teacher: `教学预设`, `教学对话`, `审计标注`, `学情线索`.
- Admin: `系统就绪`, `能力配置`, `账号班级`, `预设发布`, `数据集导出`.

---

## 3. Role Personas And Primary Jobs

| Role | Primary job | Emotional goal | UI priority |
| --- | --- | --- | --- |
| Student | Ask about a poem/text, understand answer, practice to a higher Bloom level | Feel guided, not judged | clarity, encouragement, next step |
| Teacher | Prepare teaching material, inspect student/AI interactions, label high-quality data | Stay in control of AI | inspectability, editability, class scope |
| Admin | Make the system safe and ready: users, providers, MCP, presets, exports | Trust operational state | readiness, validation, no ambiguity |

---

## 4. Information Architecture

### 4.1 Route map

```text
Public/Auth
  /                         product entry or verified-role redirect
  /login                    school-managed login
  /auth/callback            Supabase auth callback

Student
  /student                  learning ask workspace
  /student/projects         poem/text project grid/list
  /student/projects/[id]    project detail: questions, Bloom path, practice records
  /student/challenge        challenge/practice entry; can later move under project
  /student/me               learning profile and cross-project Bloom distribution

Teacher
  /teacher                  prompt-preset teaching ask
  /teacher/audit            audit queue master/detail
  /teacher/audit/[id]       audit record deep link
  /teacher/analytics        class/student summaries for action

Admin
  /admin                    setup readiness + user management entry
  /admin/classes            classes, memberships, teacher assignment
  /admin/providers          model provider capability config
  /admin/mcp                MCP server capability config
  /admin/presets            global prompt preset governance
  /admin/exports            audited SFT/DPO JSONL exports
```

### 4.2 Navigation contract

Each protected role workspace uses:

- role-filtered sidebar,
- role badge + user identity,
- breadcrumb on all nested/detail pages,
- no cross-role links,
- no disabled cross-role links as decoration.

### 4.3 Sidebar labels

Student:

```text
学习提问       /student
篇目项目       /student/projects
层级挑战       /student/challenge
我的画像       /student/me
```

Teacher:

```text
教学对话       /teacher
审计标注       /teacher/audit
学情线索       /teacher/analytics
```

Admin:

```text
系统就绪/用户   /admin
班级关系        /admin/classes
模型 Provider   /admin/providers
MCP 能力        /admin/mcp
Prompt 预设     /admin/presets
数据集导出      /admin/exports
```

---

## 5. Visual Design System: 墨韵学堂

### 5.1 Mood board in words

- Rice paper warmth for learning surfaces.
- Ink-black text for scholarly focus.
- Dai blue for primary academic action.
- Cinnabar for destructive/warning/critical review.
- Zijin/gold for achievement and current highest Bloom level.
- Rounded cards and soft elevation; avoid neon, cyber, or marketing gradients.

### 5.2 Token contract

Use `frontend-new/src/app/globals.css` as source of truth.

| Token | Meaning | Usage |
| --- | --- | --- |
| `--background` | rice paper base | app background |
| `--foreground` | ink text | body text |
| `--primary` | Dai blue | primary buttons, links, active nav |
| `--destructive` | cinnabar | destructive/error/critical states |
| `--accent` | Zijin/gold | achievements/current peak |
| `--border` | warm paper border | cards, inputs, tables |
| `--sidebar` | ink sidebar | protected shell |
| `--bloom-1..6` | Bloom levels | badges, ladder, charts |
| `--radius` | 12px base | cards and primary surfaces |
| `--font-heading` | WenKai-style heading | titles, badges, poetic emphasis |
| `--font-sans` | Source Han/Noto Sans | body/interface text |

### 5.3 Bloom color + semantics

| Level | Chinese label | Cognitive meaning | UI text hint |
| --- | --- | --- | --- |
| L1 | 记忆 | recognize/recall | 背诵、识记、找出处 |
| L2 | 理解 | explain/summarize | 解释、翻译、概括 |
| L3 | 应用 | transfer/use | 套用、迁移、举例 |
| L4 | 分析 | compare/decompose | 比较、拆解、找关系 |
| L5 | 评价 | judge/argue | 判断、论证、评价 |
| L6 | 创造 | compose/recombine | 仿写、创作、重组 |

Accessibility rule: Bloom UI always displays `Lx + Chinese label + hint/description`; color is supplementary only.

---

## 6. Shared Component System

### 6.1 shadcn/ui primitives

Use existing shadcn primitives in `frontend-new/src/components/ui/**`:

- layout: `sidebar`, `breadcrumb`, `separator`, `sheet`, `resizable`, `scroll-area`,
- forms: `input`, `textarea`, `label`, `select`, `checkbox`, `radio-group`, `switch`,
- feedback: `alert`, `skeleton`, `sonner`, `tooltip`, `progress`,
- structure: `card`, `tabs`, `table`, `dialog`, `popover`, `dropdown-menu`, `command`,
- identity: `avatar`, `badge`,
- actions: `button`.

### 6.2 Product components to build/normalize

```text
components/workbench/
  role-badge.tsx
  bloom-badge.tsx
  bloom-status-badge.tsx
  bloom-ladder.tsx
  empty-state.tsx
  blocked-state.tsx
  error-state.tsx
  loading-surface.tsx
  ai-message-list.tsx
  ai-message-part.tsx
  chat-composer.tsx
  project-card.tsx
  project-summary-strip.tsx
  prompt-preset-card.tsx
  audit-queue-table.tsx
  audit-detail-panel.tsx
  provider-capability-matrix.tsx
  setup-checklist.tsx
```

### 6.3 State component copy tone

- Avoid long marketing explanations.
- Use one clear sentence for why, one clear CTA for next action.
- Student tone: encouraging.
- Teacher tone: operational and respectful.
- Admin tone: precise and diagnostic.

---

## 7. Page Designs

### 7.1 `/` Product Entry

Purpose: replace scaffold page and direct verified users.

Desktop layout:

```text
┌─────────────────────────────────────────────┐
│ 文韵智途                                    │
│ 古诗文 AI 教学助手                          │
│                                             │
│ [进入登录]                                  │
│                                             │
│ 学生: 提问与认知路径                        │
│ 教师: 教学对话与审计标注                    │
│ 管理员: 系统配置与数据导出                  │
└─────────────────────────────────────────────┘
```

Contracts:

- No Next.js/Vercel scaffold logos or copy.
- If server can verify user + role, redirect to role workspace.
- If not authenticated, CTA to `/login`.

States:

- loading auth check,
- authenticated redirect,
- unauthenticated entry,
- profile missing setup error.

### 7.2 `/login`

Purpose: school-managed account login.

Layout:

```text
          文韵智途
       古诗文 AI 教学助手

┌─────────────────────────────┐
│ 登录                         │
│ 使用学号或教职工号登录       │
│                             │
│ 学号 / 工号                  │
│ [____________________]       │
│ 密码                         │
│ [____________________]       │
│                             │
│ [登录]                       │
└─────────────────────────────┘
学校统一配发账号 · 请联系管理员获取
```

Contracts:

- Use visible labels.
- Error `Alert` uses `role="alert"`.
- Button shows loading state and prevents duplicate submit.
- Role routing must use verified backend/profile result, not user-entered role.

### 7.3 `/student` Learning Ask Workspace

Purpose: ask AI about classical poetry/classical Chinese and create/select poem/text project.

Layout:

```text
Sidebar: 学习提问 / 篇目项目 / 层级挑战 / 我的画像
Breadcrumb: 学生工作台 > 学习提问

┌─────────────────────────────────────────────────────┐
│ Empty or message list                               │
│                                                     │
│ Empty:                                              │
│   今天想读哪首诗/哪篇文言文？                       │
│   [解释诗句] [比较手法] [生成练习] [仿写引导]       │
│                                                     │
│ Message:                                            │
│   User bubble + Bloom status badge                  │
│   AI bubble + streaming/citation/tool states        │
│                                                     │
├─────────────────────────────────────────────────────┤
│ textarea: 输入你的问题...                 [Send]    │
└─────────────────────────────────────────────────────┘
```

Contracts:

- Render AI SDK `message.parts`.
- Student message Bloom state can be `pending`, `classified`, or `failed`; no hardcoded fake level.
- Project classification state can be visible in a subtle status line.
- Duplicate submit is guarded while submitted/streaming.
- Provider missing blocks the composer with admin setup guidance.

### 7.4 `/student/projects`

Purpose: project overview grouped by poem/text title.

Layout:

```text
Header: 篇目项目
Controls: sort by 最近学习 / 认知深度 / 问题数量

Grid:
┌────────────────────┐ ┌────────────────────┐
│ 《静夜思》· 李白    │ │ 《咏鹅》· 骆宾王    │
│ 最高 L4 分析        │ │ 最高 L2 理解        │
│ █ █ █ █ ░ ░        │ │ █ █ ░ ░ ░ ░        │
│ 问题 8 · 练习 3     │ │ 问题 4 · 练习 1     │
│ [继续学习]          │ │ [继续学习]          │
└────────────────────┘ └────────────────────┘
```

Empty state:

- “还没有篇目项目。提出第一个古诗文问题后，系统会自动归入对应篇目。”
- CTA: `开始提问`.

### 7.5 `/student/projects/[projectId]`

Purpose: detailed learning artifact for one poem/text.

Layout:

```text
Header: 《静夜思》· 李白     当前最高 L4 分析
Subnav/tabs: 认知路径 | 问题记录 | 练习记录

Left/main: Bloom ladder
Right/side: next action card
  - 推荐下一步: L5 评价练习
  - 最近问题
  - 最近反馈
```

Contracts:

- Bloom ladder uses six fixed levels.
- Question nodes are keyboard reachable and have tooltips/details.
- If the project has no Bloom data yet, show unclassified state, not fake progress.

### 7.6 `/student/challenge`

Purpose: practice target Bloom level.

Layout:

```text
Project selector / current project
Progress strip: L1 L2 L3 L4 L5 L6

┌───────────────────────────────────────────────┐
│ L5 评价层级挑战                                │
│ 目标: 判断观点并用诗句论证                     │
│                                               │
│ Question                                      │
│                                               │
│ [Hint]                                        │
│ [Answer textarea]                             │
│ [提交答案]                                    │
└───────────────────────────────────────────────┘

Feedback after submit:
  - 是否达到目标层级
  - 证据/理由
  - 改进建议
  - [重试] [进入下一题]
```

Contracts:

- Preserve student answer on failed evaluation.
- Do not advance level without real evaluation result.
- Missing provider blocks generation/evaluation.

### 7.7 `/student/me`

Purpose: profile and learning overview.

MVP contents:

- cross-project Bloom radar/distribution,
- recent projects,
- current strongest/weakest Bloom levels,
- suggested next practice.

Avoid:

- broad social ranking,
- punitive score language,
- dashboards that require unavailable analytics.

### 7.8 `/teacher` Preset-First Teaching Ask

Purpose: teacher asks AI for teaching support using governed presets.

Layout:

```text
Preset panel
┌────────────────────────────────────┐
│ 教学预设                            │
│ [Select: 苏格拉底式引导 v3]          │
│ 场景: 课堂追问 / 变量: 篇目, 年级     │
└────────────────────────────────────┘

Chat workspace
  Teacher message
  AI message
  Actions: copy / save as material / send to audit source if applicable

Composer
```

Contracts:

- If no presets are published, show blocked state asking admin to publish preset.
- If provider missing, block composer.
- Teacher can inspect preset metadata before use.

### 7.9 `/teacher/audit`

Purpose: convert eligible real records into SFT/DPO candidates.

Layout:

```text
Filters: class / student / source / status / candidate / Bloom / date

┌──────────── queue ────────────┬──────────── detail ────────────┐
│ record rows                   │ source conversation             │
│ status badges                 │ prompt                          │
│ class/student/source          │ model answer                    │
│                               │ metadata                        │
│                               │                                │
│                               │ Tabs: SFT | DPO                 │
│                               │ SFT fields / DPO fields         │
│                               │ [Submit]                        │
└───────────────────────────────┴────────────────────────────────┘
```

SFT required fields:

```text
source_record_id
quality: accurate | needs_correction | reject
corrected_answer when quality = needs_correction
rationale when changed/rejected
```

DPO required fields:

```text
source_record_id
prompt
chosen_answer
rejected_answer
preference_rationale
```

Contracts:

- Source conversation remains visible while labeling.
- Already exported records are read-only.
- Cannot approve incomplete forms.
- No demo records.

### 7.10 `/teacher/analytics`

Purpose: actionable class/student summaries.

MVP cards:

- assigned classes,
- recent audit workload,
- Bloom distribution for real student records,
- students needing review.

Avoid:

- school-wide analytics beyond teacher scope,
- vanity metrics without action,
- fake charts.

### 7.11 `/admin`

Purpose: setup/status console plus user management entry.

Layout:

```text
System readiness
┌─────────────┬─────────────┬─────────────┐
│ Users       │ Provider    │ Presets     │
│ ready/miss  │ ready/miss  │ ready/miss  │
└─────────────┴─────────────┴─────────────┘
┌─────────────┬─────────────┬─────────────┐
│ Classes     │ MCP         │ Exports     │
└─────────────┴─────────────┴─────────────┘

User table / empty state / import/create actions
```

Contracts:

- Student/teacher AI readiness is visible here.
- Missing config states name dependent blocked capabilities.

### 7.12 `/admin/classes`

Purpose: class membership and teacher assignment.

Required UI:

- class list,
- teacher assignment,
- student membership,
- create/import action,
- validation preview for imports.

### 7.13 `/admin/providers`

Purpose: provider capability configuration.

Layout:

```text
Provider capability matrix
Rows: provider/model configs
Columns: student_chat / teacher_chat / bloom_classification / project_classification / practice_generation / practice_evaluation / embedding

Add/edit provider dialog:
  name
  type
  base URL
  API key replacement field
  model list
  capabilities
  health/test action
```

Contracts:

- Secrets are never displayed after save.
- Missing provider blocks dependent UI flows.
- “No fallback” means no demo provider/model.

### 7.14 `/admin/mcp`

Purpose: MCP server/tool capability governance.

Required UI:

- MCP server list,
- health status,
- enabled tools,
- role/action availability,
- disabled-by-default for unsafe/unknown tools.

### 7.15 `/admin/presets`

Purpose: global prompt preset governance.

Preset lifecycle:

```text
draft -> published -> disabled
```

Required UI:

- preset table,
- create/edit dialog,
- variables editor,
- version/status badge,
- publish/disable actions.

Teacher can only use `published` presets.

### 7.16 `/admin/exports`

Purpose: audited SFT/DPO JSONL export.

Required UI:

- export type selector: SFT/DPO,
- filter by status/date/class where supported,
- record count preview,
- confirm export,
- export history table.

Contracts:

- Export disabled when no approved real records.
- Never export unaudited/mock records.

---

## 8. AI Message Rendering Design

### 8.1 Message part renderer

A shared renderer must support:

```ts
text
known tool-* parts
retrieval/citation data parts if defined
classification status data parts if defined
unknown safe fallback
```

UI rules:

- Text streams in `aria-live="polite"` region.
- Tool/retrieval progress appears as small status rows, not raw JSON.
- Citations appear as compact source chips or reference panel.
- Unknown parts are ignored safely or shown only in development diagnostics.

### 8.2 Streaming states

| State | UI |
| --- | --- |
| idle | composer enabled |
| submitted | composer guarded, first-token skeleton |
| streaming | live answer, stop/cancel if implemented |
| error | keep input/history, show retry or blocked reason |

---

## 9. Required State Inventory

Every primary page must account for these states:

| State | Required UI |
| --- | --- |
| empty | why empty + next valid action |
| loading | skeleton preserving final layout |
| error | `Alert role="alert"` + retry/resolution |
| permission denied | role/scope explanation without data leakage |
| blocked/missing config | exact missing dependency + setup path |
| validation failure | field-level error + no mutation |
| success/committed | visible confirmation or status update |
| streaming | live status + duplicate-submit guard |

---

## 10. No-Fallback UX Contract

Forbidden UI patterns:

- Next.js scaffold home content.
- Demo/mock arrays displayed as operational data.
- Canned AI answers if provider is missing.
- Hardcoded Bloom badges on real messages.
- Legacy FastAPI/SQLite/Chroma calls for new MVP surfaces.
- Secret values displayed in client UI after save.
- Silent export of unaudited/unapproved data.

Correct UI patterns:

- Empty state when data is absent.
- Blocked state when config is absent.
- Pending state when async classification is not done.
- Failed/unclassified state when classification fails.
- Read-only state for exported audit records.

---

## 11. Accessibility Requirements

- Semantic HTML first.
- Visible labels for all form controls.
- `role="alert"` for errors.
- `aria-live="polite"` for AI streaming/status updates.
- Keyboard path for login, ask, preset selection, audit labeling, provider setup.
- Dialog/sheet focus trap and focus restore via shadcn/Radix-compatible primitives.
- Bloom uses text + level + description, never color alone.
- Contrast meets WCAG AA.
- Login and basic student ask remain usable on mobile; workbench pages are robust on tablet/desktop.

---

## 12. Responsive Layout Rules

| Width | Behavior |
| --- | --- |
| Mobile | login and basic student ask usable; sidebar becomes sheet/collapsible |
| Tablet | sidebar collapsible; cards become 1-2 columns; audit may stack |
| Desktop | full sidebar; audit split pane; admin tables with filters |

---

## 13. Implementation Order For UI/UX Slice

1. Replace `/` scaffold with product entry/redirect.
2. Normalize shared state components: `EmptyState`, `BlockedState`, `ErrorState`, `LoadingSurface`.
3. Normalize `AppShell`/`AppSidebar` labels and role filtering.
4. Build shared AI message renderer and chat composer.
5. Fix student ask states and remove fake Bloom badge behavior.
6. Build project card/detail design and Bloom ladder accessibility.
7. Build teacher preset metadata and audit master/detail validation design.
8. Build admin setup checklist and provider capability matrix design.
9. Verify no mock/legacy/fallback UI remains in `frontend-new` MVP pages.

---

## 14. UI/UX Acceptance Checklist

- [ ] Product entry replaces scaffold.
- [ ] Role navigation is explicit and filtered.
- [ ] All primary pages have empty/loading/error/blocked states.
- [ ] Student chat uses real AI SDK parts and real classification states.
- [ ] Bloom UI uses label + level + description.
- [ ] Student project and practice flows are understandable without admin terminology.
- [ ] Teacher ask is preset-first.
- [ ] Teacher audit requires source context and validates SFT/DPO fields.
- [ ] Admin home exposes system readiness.
- [ ] Provider/MCP pages communicate capability availability.
- [ ] No mock success or legacy fallback is used.
- [ ] Keyboard and screen-reader basics are covered.
- [ ] Tailwind/shadcn components consume design tokens.

