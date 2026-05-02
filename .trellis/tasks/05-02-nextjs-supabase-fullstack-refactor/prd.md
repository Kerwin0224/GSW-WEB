# 文韵智途 — Next.js + shadcn/ui + Vercel AI SDK + Supabase 全栈重构

> **基于**: 05-01 收敛 PRD + docs/PRODUCT_SOURCE_OF_TRUTH.md + 已锁定技术栈
> **原则**: 彻底重构，不兜底，不降级到旧 FastAPI/SQLite/Chroma

## Goal

将古典中文 AI 工作台从 FastAPI + SQLite + Chroma 架构**彻底迁移**到 Next.js App Router + shadcn/ui + Vercel AI SDK + Supabase。不是渐进式迁移，不是新旧并存——是一次性全量重构。

用户已将产品命名为 **文韵智途**。早期产品粗稿已收敛到仓库内 `docs/PRODUCT_SOURCE_OF_TRUTH.md` 指向的当前产品源；根目录 `PRD` 不再作为仓库文件或实施入口。本任务基于 05-01 收敛成果进入实施阶段。


## Hard Architecture Constraint: No Legacy Or Mock Fallbacks

The implementation target is a thorough refactor to **Next.js App Router + Supabase + Vercel AI SDK only**.

Mandatory rules:

- Do not use FastAPI, SQLite, Chroma, or any legacy backend endpoint as an MVP fallback for new surfaces.
- Do not depend on `NEXT_PUBLIC_API_BASE_URL` or old FastAPI client paths for the new MVP login, student, teacher, admin, AI, import, export, and workspace API surfaces.
- Do not use scaffold/mock language models, demo sessions, or canned AI responses as a fallback when model/provider configuration is missing.
- Missing Supabase or model/provider configuration must fail clearly with actionable errors before protected data access, retrieval, embedding, or model generation begins.
- Keep unrelated legacy backend files in place unless a change is explicitly scoped to this refactor; frontend and Next/Supabase surfaces must stop depending on them.

## Locked Technical Stack (Final)

| 层面 | 技术 | 说明 |
|------|------|------|
| **应用框架** | Next.js App Router (Vercel) | RSC + Server Actions + API Routes |
| **UI 组件** | **shadcn/ui** + Tailwind CSS 3.4 | 用户 PRD 硬性要求 |
| **设计系统** | 墨韵学堂 — 中国传统色系 + 霞鹜文楷/思源黑体 | 详见用户 PRD §6 |
| **AI 运行时** | Vercel AI SDK (`ai` + `@ai-sdk/openai`) | streamText / generateText / embed / tool |
| **数据库/认证/存储** | Supabase | Auth + RLS + Storage + Realtime |
| **向量检索** | Supabase pgvector | HNSW 索引 + SQL RPC |
| **编排层** | AI SDK 原生 + 项目自有接口 | MVP 不引入 LangChain.js/LlamaIndex.TS |
| **类型/校验** | TypeScript 5.9 + Zod 4 + Supabase generated types | 端到端类型安全 |

### shadcn/ui 设计系统集成

`docs/PRODUCT_SOURCE_OF_TRUTH.md` 指向的当前产品源定义了完整的 **墨韵学堂** 设计系统：

- **主色**: 黛蓝 #4A6FA5 / 强调色: 朱砂 #C04851 / 成就色: 紫金 #B7A57A
- **背景**: 米白 #FAF8F1 (宣纸质感) / 深色: 墨灰 #1A1A2E
- **标题字体**: 霞鹜文楷 / 正文字体: 思源黑体
- **布鲁姆六层配色**: L1 黛蓝 / L2 天青 / L3 竹青 / L4 赭石 / L5 朱砂 / L6 紫金
- **组件风格**: 圆角 12px、轻投影、hover 上浮 2px、印章式标签

shadcn/ui 通过 CSS 变量无缝对接此设计系统，在 `globals.css` 中定义主题令牌后，所有 shadcn 组件自动继承墨韵学堂风格。

## Product Direction Sources (已收敛)

1. [`docs/PRODUCT_SOURCE_OF_TRUTH.md`](../../../docs/PRODUCT_SOURCE_OF_TRUTH.md) — 当前产品源入口；早期根 `PRD` 粗稿已完成收敛且不再作为仓库文件
2. [`docs/prd_decision_v1.md`](../../../docs/prd_decision_v1.md) — 四模块产品收敛（login/student/teacher/admin）
3. [`docs/demo_scope_v1.md`](../../../docs/demo_scope_v1.md) — MVP 演示范围
4. [`research/next-ai-supabase-rag-best-practices.md`](research/next-ai-supabase-rag-best-practices.md) — Tavily + Context7 最佳实践调研
5. [`.trellis/spec/frontend/next-ai-sdk-guidelines.md`](../../../.trellis/spec/frontend/next-ai-sdk-guidelines.md) — Next.js/AI SDK 可执行契约
6. [`.trellis/spec/backend/supabase-pgvector-guidelines.md`](../../../.trellis/spec/backend/supabase-pgvector-guidelines.md) — Supabase/pgvector 可执行契约

**以上来源已在 05-01 任务中完成收敛，本任务直接进入实施。**


## UI/UX-First Design Lock — 2026-05-02

User's latest directive makes UI/UX design the first completion gate before further implementation. The design lock is persisted in [`info.md`](info.md), [`research/ui-ux-best-practices-2026-05-02.md`](research/ui-ux-best-practices-2026-05-02.md), and [`.trellis/spec/frontend/ui-ux-guidelines.md`](../../spec/frontend/ui-ux-guidelines.md).

### UI/UX Principles

1. **Role workbench, not chatbot shell**: every surface must be organized around student learning, teacher teaching/audit, or admin governance work.
2. **No fake success**: missing Supabase/auth/profile/provider/preset data must render blocked or empty states, never mock/demo operational records.
3. **AI is visible and inspectable**: streaming, pending classification, retrieval/citation, errors, and teacher review states must be explicit.
4. **Bloom is guidance**: student Bloom indicators are Chinese-labeled learning guidance, never punitive ranking or hidden admin metadata.
5. **shadcn design-system ownership**: copied shadcn primitives are project-owned and composed into domain components; Tailwind/CSS variables own the 墨韵学堂 visual system.
6. **Accessibility is part of acceptance**: keyboard path, labels, live regions, error alerts, and non-color Bloom semantics are required.

### UI/UX Information Architecture

```text
Public/auth
  /                 product entry or redirect
  /login            school-managed role-aware login
  /auth/callback    Supabase auth callback

Student
  /student                      AI ask workspace
  /student/projects             poem/text project grid
  /student/projects/[projectId] project detail with Bloom path and practice records
  /student/challenge            practice/challenge entry
  /student/me                   learning profile

Teacher
  /teacher                      preset-first teaching ask
  /teacher/audit                audit queue
  /teacher/audit/[recordId]     audit detail
  /teacher/analytics            class/student summaries

Admin
  /admin                        setup/status and user management
  /admin/classes                class membership and teacher assignment
  /admin/providers              provider capability config
  /admin/mcp                    MCP capability config
  /admin/presets                global prompt preset governance
  /admin/exports                audited SFT/DPO exports
```

### UI/UX Acceptance Criteria

- [ ] Root/home page is product-specific; no Next.js scaffold copy remains.
- [ ] Login displays school-account context, accessible errors, and verified role routing.
- [ ] Student ask renders AI SDK `message.parts`, streaming state, no duplicate submit, and real Bloom/project classification states.
- [ ] Student projects expose project cards, project detail, Bloom ladder, practice records, and empty/loading/error states.
- [ ] Teacher ask is preset-first and displays preset scenario/version/variables.
- [ ] Teacher audit uses class-scoped queue + source conversation + SFT/DPO validation.
- [ ] Admin home behaves as setup/governance console with provider/users/classes/presets/MCP/export readiness.
- [ ] Provider/MCP/admin pages block dependent student/teacher AI actions when missing config.
- [ ] Every primary page includes empty/loading/error/permission/blocked/validation states.
- [ ] Bloom UI uses text + level + accessible description, never color alone.
- [ ] No new UI flow depends on FastAPI, SQLite, Chroma, mock models, or canned AI responses.

## Product Thesis

The product is a school-facing AI workbench for classical poetry and classical Chinese learning.

It has two aligned goals:

1. **Primary goal: teaching and learning effectiveness**
   - Students learn classical poetry/classical Chinese through AI-assisted ask/practice flows.
   - Bloom's Taxonomy is the core student learning axis, not a minor annotation feature.
   - The student experience should help students climb from memory/understanding toward application, analysis, evaluation, and creation.
2. **Secondary strategic goal: high-quality dataset production**
   - Natural student/AI and teacher/AI interactions become auditable data candidates.
   - Teacher audit converts selected interactions into high-quality SFT/DPO data.
   - The long-term goal is to train/fine-tune the product's own domain model.

This product is not a generic chatbot, not a broad LMS, and not a course-platform-first shell.

## Core Product Decision: Bloom And Four Modules Are Compatible

Bloom's Taxonomy and the four-module product spine are not competing directions.

- **Student module** uses Bloom as the main learning progression and practice axis.
- **Teacher module** uses system instruction presets/prompt libraries to help teachers apply educational methods and complete teaching-support tasks.
- **Admin module** governs accounts, classes, providers, MCP servers, prompt/preset governance where needed, and audited dataset export.
- **Dataset/audit capability** is a natural byproduct of normal learning/teaching interactions, plus teacher responsibility for audit quality.

## Product Spine

### 1. Login

- Role-aware entry and routing for student, teacher, and admin.
- School-managed accounts for the current scope.
- Clear workspace separation after login.

### 2. Student Workspace

Student learning is organized around Bloom's Taxonomy and poem/text projects.

Required capabilities:

- Ask questions about classical poetry or classical Chinese texts.
- Automatically classify/file each question under a poem/text project.
- Show the Bloom level of student questions and learning progress.
- Use Bloom levels as the main student learning progression axis.
- Practice inside a selected poem/text project.
- Practice should be able to target Bloom levels and help the student climb to higher cognitive levels.

Student object hierarchy:

```text
student -> poem/text project -> questions/practice records -> Bloom-level progress
```

Rules:

- A project is anchored by a poem or classical text title.
- Student ask flow creates or selects the matching project automatically.
- A project can contain many questions and many practice records.
- Project history is both a learning artifact and a data-production source.

### 3. Teacher Workspace

Teacher work is organized around two primary surfaces: ask and audit.

#### Teacher Ask / Teaching Support

Teachers need a system-instruction/prompt-preset workbench, not just raw chat.

Required capabilities:

- Use curated system instruction presets for common teaching tasks.
- Apply educational methods through reusable prompt libraries.
- Support scenarios such as:
  - lesson preparation
  - explanation drafting
  - question generation
  - practice design
  - learning-status investigation
  - student misconception analysis
  - classroom activity support
- Store teacher/AI interactions in the teacher workspace.

#### Teacher Audit / Dataset Production

Teacher audit is responsible for quality control of training data.

Required capabilities:

- Review eligible student/AI and teacher/AI interaction records.
- Mark records as SFT or DPO candidates.
- Provide corrected answers, preferred answers, rejected answers, and rationales where needed.
- Preserve source metadata and audit status.
- Keep audit tied to teacher's class/student scope by default.

### 4. Admin Workspace

Admin owns governance, configuration, and export.

Required capabilities:

- Manage teacher accounts.
- Manage student accounts.
- Manage class membership.
- Assign one teacher to multiple classes.
- Assign multiple students to one class.
- Configure model providers, credentials, endpoints, and defaults.
- Configure MCP servers and capability availability.
- Export audited SFT/DPO JSONL datasets.
- Govern the global prompt preset library. In the MVP, admins create/edit/publish prompt presets and teachers can only use enabled presets.

## Orchestration Layer Decision

MVP decision: **do not introduce LangChain.js or LlamaIndex.TS as a required production dependency yet**.

Reasoning:

- Current MVP requirements are mostly route-level AI interactions: student ask, Bloom classification, poem/text project filing, practice generation/evaluation, teacher prompt-preset execution, audit assistance, and dataset export.
- Vercel AI SDK already covers the necessary primitives for this slice: streaming, model provider abstraction, typed tool calling, `generateText`, `streamText`, `embed`/`embedMany`, and UI message streams.
- Supabase + pgvector can own retrieval directly through SQL RPCs, without needing a framework-level vector-store abstraction in the first slice.
- Adding LangChain/LlamaIndex too early would increase dependency surface and mental overhead before the product workflows are stable.

Implementation rule:

- Define project-owned interfaces such as `AIProvider`, `Retriever`, `BloomClassifier`, `ProjectClassifier`, `PracticeGenerator`, and `AuditAssistant`.
- Implement the MVP with AI SDK + Supabase RPCs behind those interfaces.
- Keep the interfaces narrow enough that a future LangChain.js or LlamaIndex.TS adapter can be added without rewriting route handlers or UI code.

Escalation criteria for adding LangChain.js:

- Teacher workflows require multi-step agent planning across multiple tools.
- Prompt-preset execution needs reusable graph/state-machine flows beyond simple service composition.
- Audit assistance needs complex evaluator chains or repeated tool-use loops.

Escalation criteria for adding LlamaIndex.TS:

- The product needs substantial document ingestion pipelines, query engines, source-node management, or advanced corpus indexing beyond simple poem/text project retrieval.
- RAG becomes centered on large curated document corpora rather than user/project interaction history.

Forbidden MVP pattern:

- Do not import LangChain.js/LlamaIndex.TS directly into route handlers or React components. If introduced later, they must live behind the project-owned orchestration/retrieval interfaces.

## Model Lifecycle Decision

The model strategy has two phases:

1. **Early phase**
   - Use strong cloud models for production-quality answers, labeling, classification, prompt-library execution, and audit assistance.
   - Keep provider routing configurable through admin settings.
2. **Later phase**
   - Use teacher-audited SFT/DPO datasets to train or fine-tune the product's own classical Chinese education model.
   - The product's own model should eventually become the primary model for student/teacher Q&A when quality is sufficient.
   - Strong cloud models may remain as evaluator or premium/quality-control providers after explicit admin configuration, but not as an implicit fallback when the primary provider is missing or broken.

## Product Data Model Draft

### Organization

```text
admin -> teachers -> classes -> students
```

Rules:

- One teacher can manage many classes.
- One class has many students.
- One student belongs to one class in the current scope.
- Teacher permissions are class-scoped by default.
- Admin can manage all teachers, classes, students, provider settings, MCP settings, audited exports, and global prompt presets.

### Student Learning Object

```text
student -> poem/text project -> questions/practice records -> Bloom profile
```

Rules:

- A project is anchored by a poem or classical text title.
- Student ask flow creates or selects the matching project automatically.
- A project can contain many questions and many practice records.
- Each eligible student question should be classified to a Bloom level.
- Practice records should indicate target Bloom level, result, feedback, and whether the student demonstrated the target ability.

### Teacher Prompt Preset Object

```text
prompt preset -> teaching scenario -> system instruction -> optional variables -> visibility/owner
```

Draft fields:

- title
- teaching scenario
- system instruction
- optional user prompt template
- variables/placeholders
- target role: teacher-only, student-assist, audit-assist, admin/system
- owner/visibility: global only for MVP
- version
- enabled/disabled status
- created/updated by admin user

### Audit / Dataset Object

SFT candidates preserve:

- source role
- source project or teacher workspace
- original prompt
- original model answer
- accepted/corrected answer
- audit status
- teacher auditor
- timestamps and source metadata

DPO candidates preserve:

- source role
- source project or teacher workspace
- original prompt
- chosen answer
- rejected answer
- preference rationale or label when present
- audit status
- teacher auditor
- timestamps and source metadata

Only audited records should be available for admin export.

## Integrated MVP Slice: Student + Teacher + Admin Together

The first implementation slice must deliver the three workspaces together as one usable loop, not as isolated pilots.

### MVP Principle

Admin, teacher, and student capabilities are mutually dependent:

- Admin must create users/classes and configure providers before students/teachers can use the system.
- Students must create learning interactions before teachers have student records to audit.
- Teachers must audit records before admin can export SFT/DPO datasets.
- Provider and prompt-preset governance must be available from the start so model behavior is controlled.

Therefore the MVP release should implement a thin but complete vertical product spine across all three roles.

### Required End-to-End Loop

```text
Admin setup
  -> create/manage teachers, students, classes
  -> assign teachers to classes and students to classes
  -> configure model providers/default capability routes
  -> publish global teacher prompt presets

Student learning
  -> login as student
  -> ask about poem/classical text
  -> system creates/selects poem/text project
  -> AI answers with streaming response
  -> system records Bloom level and project classification
  -> student practices within the project

Teacher teaching + audit
  -> login as teacher
  -> use admin-published prompt presets for teaching-support ask flows
  -> view class-scoped student interactions
  -> audit eligible records as SFT/DPO candidates
  -> add corrected/preferred/rejected answers and rationale

Admin export
  -> view audited dataset records
  -> export approved SFT/DPO JSONL batches
```

## MVP Workspace Design

### Admin Workspace

Admin is the operational control plane.

Required MVP pages/capabilities:

1. **User management**
   - Bulk import teacher and student accounts by CSV.
   - Generate or accept initial passwords for imported accounts.
   - Create/edit/disable individual teacher and student accounts after import.
   - Assign roles: `admin`, `teacher`, `student`.
   - Route users to role-specific workspace after login.

2. **Class management**
   - Create/edit classes.
   - Assign one teacher to multiple classes.
   - Assign multiple students to one class.
   - Make teacher permissions class-scoped by default.

3. **Provider configuration**
   - Configure model providers and endpoints.
   - Store provider credentials server-side only.
   - Configure default model routing by capability:
     - `student_chat`
     - `teacher_chat`
     - `bloom_classification`
     - `project_classification`
     - `practice_generation`
     - `practice_evaluation`
     - `audit_assist`
     - `embedding`
   - Enable/disable providers without code changes.
   - Never expose provider secrets to student or teacher browsers.

4. **MCP configuration**
   - Configure MCP servers and enabled capabilities.
   - Control which role/workspace can use each capability.
   - Keep MCP credentials/admin settings out of student and teacher UI.

5. **Global prompt preset library**
   - Admin creates/edits/publishes global system-instruction presets.
   - Teachers can only use enabled presets in MVP.
   - Presets should be versioned so historical teacher interactions can trace which instruction was used.

6. **Dataset export**
   - Export only teacher-audited records.
   - Support SFT JSONL export.
   - Support DPO JSONL export.
   - Preserve source metadata for traceability.

### Student Workspace

Student is the primary learning surface.

Required MVP pages/capabilities:

1. **Student ask**
   - Student asks about classical poetry/classical Chinese texts.
   - AI response streams through Vercel AI SDK.
   - System classifies the poem/text project.
   - System creates/selects the project automatically.
   - System classifies the student's question by Bloom level.
   - Conversation and annotations are saved for learning history and audit eligibility.

2. **Poem/text project view**
   - Shows project title and related questions.
   - Shows Bloom-level distribution/progress for the project.
   - Shows practice records attached to the project.

3. **Student practice**
   - Practice is launched from a poem/text project.
   - Practice uses accumulated project context.
   - Practice targets a Bloom level.
   - Practice result stores answer, evaluation, target level, achieved/not-achieved status, and feedback.

### Teacher Workspace

Teacher is the teaching-support and audit surface.

Required MVP pages/capabilities:

1. **Teacher ask**
   - Teacher selects an admin-published prompt preset.
   - Teacher fills optional variables/placeholders when required by the preset.
   - AI response streams and is saved under the teacher workspace.
   - Teacher interactions can become audit/data candidates when appropriate.

2. **Class/student scope view**
   - Teacher sees assigned classes.
   - Teacher can browse students in assigned classes.
   - Teacher can open student interactions eligible for audit.

3. **Audit queue**
   - Shows eligible student/AI records from assigned classes.
   - Shows eligible teacher/AI records from the teacher workspace when dataset-worthy.
   - Supports audit status transitions.
   - Supports SFT and DPO record creation.

4. **Audit detail**
   - Preserve original prompt and original model answer.
   - For SFT: teacher provides or approves corrected/accepted answer.
   - For DPO: teacher marks chosen/rejected answer pair and optional rationale.
   - Save auditor, timestamp, dataset type, status, source metadata, and prompt/model metadata.

## MVP Account Provisioning Decision

MVP decision: **admin-managed CSV import with initial passwords**.

This is the default school-managed account flow for MVP. Public signup, social login, and invite-code self-registration are out of scope.

### Required Flow

```text
Admin opens user import
  -> uploads teacher CSV and/or student CSV
  -> system validates rows and previews errors
  -> admin confirms import
  -> system creates Supabase Auth users + profiles
  -> system creates/updates class membership and teacher-class assignment
  -> system reports created/skipped/failed rows
  -> imported users log in with initial password and role-based routing
```

### Teacher CSV Draft

Required columns:

- `teacher_code`
- `display_name`
- `initial_password`
- `class_names` — comma-separated class names or class codes

Optional columns:

- `status` — defaults to `active`

### Student CSV Draft

Required columns:

- `student_code`
- `display_name`
- `initial_password`
- `class_name` or `class_code`

Optional columns:

- `grade`
- `status` — defaults to `active`

### Import Validation Rules

- `teacher_code`, `student_code`, and any explicit `login_id` values must be non-empty, school-issued account identifiers. They must be unique within the import batch and must not contain `@`.
- Teacher and student account identifiers must resolve to the stored `profiles.login_id`; email is not accepted as a login, CSV identifier, or uniqueness key.
- Role is derived from import type, not user-provided free text.
- Initial password must satisfy the configured minimum password policy.
- Student rows must resolve to exactly one class.
- Teacher rows may resolve to one or more classes.
- Duplicate existing users should be reported as `skipped` or `updated` according to the import mode selected by admin.
- Import preview must show row-level errors before commit.
- Partial failures must not silently create inconsistent teacher/class/student relationships.

### Import Result Contract

Import result should report:

- `created_count`
- `updated_count`
- `skipped_count`
- `failed_count`
- row-level errors with row number, field, and reason
- created/updated class relationship counts

### Security Rules

- Initial passwords are accepted only through admin-authenticated import actions.
- Passwords must never be logged in plaintext.
- Provider/MCP secrets and CSV passwords must not be exposed to browser bundles or stored in ordinary client state.
- Imported users should be encouraged or required to change passwords after first login if Supabase/Auth policy and implementation scope allow it.

### Out of Scope For MVP

- Public self-registration.
- Social login.
- Invite-code/class-code self-registration.
- Complex multi-school tenant onboarding.
- Automated SIS/教务系统 integration.

## MVP Data Model Draft

The detailed schema will be finalized during implementation planning, but the MVP should cover these entities.

### Identity / Organization

- `profiles`
  - `id` references Supabase `auth.users.id`
  - `role`: `admin | teacher | student`
  - `display_name`
  - `external_code` nullable for school/import IDs
  - `status`: `active | disabled`
- `classes`
  - `id`, `name`, `grade`, `class_code`, `status`
- `user_import_batches`
  - import type, status, counts, uploaded_by, created_at
- `user_import_rows`
  - batch_id, row_number, status, error details, resolved user/class IDs
- `teacher_classes`
  - `teacher_id`, `class_id`
- `student_classes`
  - `student_id`, `class_id`

### Provider / MCP / Presets

- `provider_configs`
  - provider metadata, base URL, enabled status, secret reference/encrypted credential fields
- `model_routes`
  - capability -> provider/model/default parameters
- `mcp_servers`
  - server metadata, enabled status, role/capability visibility
- `prompt_presets`
  - title, teaching scenario, system instruction, variables, version, enabled status, admin owner

### Student Learning

- `learning_projects`
  - student_id, poem/text title, author, metadata
- `conversations`
  - owner role/id, project_id nullable, workspace type: student/teacher
- `messages`
  - conversation_id, role, content, model metadata, timestamps
- `bloom_annotations`
  - message_id, level, label, confidence, rationale/model metadata
- `practice_records`
  - project_id, target Bloom level, question, student answer, evaluation, achieved flag, feedback

### Audit / Dataset

- `audit_records`
  - source message/conversation/practice reference
  - dataset type: `sft | dpo`
  - status: `pending | in_review | approved | rejected | exported`
  - original prompt
  - original model answer
  - corrected/accepted answer for SFT
  - chosen/rejected/rationale for DPO
  - auditor_id
  - source metadata
- `dataset_exports`
  - export type, status, file path/storage object, record count, created_by
- `dataset_export_items`
  - export_id, audit_record_id

## MVP Route/API Capability Map

All routes must follow the Next.js/AI SDK and Supabase specs already written.

### Admin APIs

- User/class management routes or server actions, including CSV preview/import actions.
- Provider config routes/server actions.
- Model-route config routes/server actions.
- MCP config routes/server actions.
- Prompt preset CRUD/publish routes/server actions.
- Dataset export generation route/server action.

### Student APIs

- Student chat streaming route.
- Project classification service.
- Bloom classification service.
- Project listing/detail routes/server actions.
- Practice generation/evaluation routes.

### Teacher APIs

- Teacher chat streaming route with prompt preset selection.
- Assigned class/student query routes.
- Audit queue and audit detail routes/server actions.
- SFT/DPO approval/rejection routes/server actions.

## MVP Acceptance Criteria: Integrated Loop

- [ ] Admin can bulk import at least one teacher, one class, and one student from CSV, including initial passwords and teacher/class/student relationships.
- [ ] Admin can configure at least one usable model provider and set defaults for student chat, teacher chat, classification, practice, audit assist, and embeddings.
- [ ] Admin can publish at least one teacher prompt preset.
- [ ] Student can log in, ask a question, receive a streamed answer, and see the question filed under a poem/text project.
- [ ] Student question has a stored Bloom annotation.
- [ ] Student can complete one practice flow under that project.
- [ ] Teacher can log in, use an admin-published prompt preset, and save a teaching-support interaction.
- [ ] Teacher can view assigned class/student interaction records eligible for audit.
- [ ] Teacher can approve/create one SFT audit record and one DPO audit record.
- [ ] Admin can export approved SFT/DPO records as JSONL.
- [ ] RLS prevents students from reading other students' projects/messages.
- [ ] RLS prevents teachers from auditing students outside assigned classes.
- [ ] Provider credentials and MCP secrets are never exposed to browser bundles.

## MVP Implementation Sequencing

Although the three workspaces must ship together, implementation should proceed in dependency order:

1. Auth/profile/role routing foundation.
2. Admin organization management and provider configuration.
3. Global prompt preset library.
4. Student ask/project/Bloom/practice loop.
5. Teacher prompt-preset ask loop.
6. Teacher audit queue/detail.
7. Admin dataset export.
8. End-to-end RLS, typecheck, lint, and smoke verification.

This sequencing is an implementation order, not a product-scope reduction.

## UI/UX Product Requirement

UI/UX is part of the MVP definition of done. The implementation must design role-specific workspaces rather than only wiring backend capability.

Required UX outcomes:

- Student workspace feels like a learning workbench centered on poem/text projects and Bloom progression.
- Teacher workspace feels like a teaching-support and audit workbench centered on prompt presets, class scope, and audit queues.
- Admin workspace feels like an operations console centered on setup health: users/classes, providers/MCP, prompt presets, and exports.
- Empty, loading, streaming, validation, and error states are designed explicitly.
- Navigation is role-aware and does not expose unavailable actions.
- CSV import UI must provide preview, row-level validation errors, and clear commit results.
- Provider/MCP setup UI must make missing configuration obvious before student/teacher AI features are used.

See [`../../../.trellis/spec/frontend/ui-ux-guidelines.md`](../../../.trellis/spec/frontend/ui-ux-guidelines.md).

## Technical Specs Already Written

Executable code-specs have been added/updated:

- [`../../../.trellis/spec/frontend/next-ai-sdk-guidelines.md`](../../../.trellis/spec/frontend/next-ai-sdk-guidelines.md)
  - Next.js App Router route handler contracts
  - Vercel AI SDK streaming/tool/embedding contracts
  - frontend AI data-boundary rules
- [`../../../.trellis/spec/backend/supabase-pgvector-guidelines.md`](../../../.trellis/spec/backend/supabase-pgvector-guidelines.md)
  - Supabase Auth/RLS contracts
  - pgvector schema/RPC contracts
  - migration/type-generation requirements

These specs should be considered locked stack guardrails unless product PRD convergence reveals a necessary change.

## Research References

- [`research/next-ai-supabase-rag-best-practices.md`](research/next-ai-supabase-rag-best-practices.md) — consolidated Tavily + Context7 findings for Next.js App Router, AI SDK, Supabase SSR/RLS/pgvector, Supabase CLI, LangChain.js, and LlamaIndex.TS.
- [`research/context7-api-verification-2026-05-02.md`](research/context7-api-verification-2026-05-02.md) — Context7 verified AI SDK v6 API breaking changes: `stepCountIs`, plain tool objects, `DefaultChatTransport`, `@ai-sdk/react`.
- [`research/ui-design-spec-shadcn.md`](research/ui-design-spec-shadcn.md) — 完整 UI/UX 设计规范: 墨韵学堂 CSS 变量 → shadcn 主题映射, 每个页面的组件结构伪代码, 布鲁姆组件设计系统, 状态覆盖矩阵, 响应式断点, 动画定义.

## Requirements (Evolving)

- Keep the target stack fixed as Next.js + Vercel AI SDK + Supabase + pgvector + one orchestration adapter.
- Use `docs/PRODUCT_SOURCE_OF_TRUTH.md` as the stable product-source entry point; early rough PRD material is authoring history only, and Trellis-corrected docs/specs control contradictions and scope creep.
- Produce a detailed product PRD before starting implementation.
- Preserve the four-role/module boundary while treating Bloom as the student learning axis.
- Ensure every future implementation slice maps product behavior to executable route, database, auth, validation, and test contracts.
- Use Supabase RLS for role/class/student data boundaries.
- Use AI SDK streaming route handlers for ask/practice/teacher-assist flows.
- Use system instruction presets/prompt libraries for teacher-side teaching-support scenarios.
- For MVP, prompt presets are admin-managed global presets; teachers can use enabled presets but cannot create, edit, publish, or share presets.
- Use AI SDK primitives plus project-owned interfaces for MVP orchestration; do not add LangChain.js/LlamaIndex.TS until a specific workflow exceeds AI SDK + simple service composition.
- Use audited records as the source of SFT/DPO export data.
- Build student, teacher, and admin workspaces together in the first MVP slice so user management, provider config, student use, teacher audit, and admin export form one complete loop.
- Use admin-managed CSV import with initial passwords as the MVP school account provisioning mechanism.
- Keep model provider selection configurable so the product can move from strong cloud models to its own fine-tuned model later.
- Fail clearly when Supabase/model/provider configuration is missing; no mock/scaffold/demo AI or legacy backend fallback is allowed for MVP surfaces.

## Decision (ADR-lite)

### D1: 前端脚手架策略

- **Context**: 当前 frontend/ 为自建组件（无组件库），需要引入 shadcn/ui + 墨韵学堂设计系统
- **Decision**: 方案 B — `create-next-app` 全新脚手架，不保留现有 frontend/ 代码作为运行基础
- **Consequences**: 
  - 彻底摆脱旧组件代码，无历史包袱
  - 路由、API、业务逻辑从零开始迁移，非复制粘贴
  - 旧 frontend/ 已删除；历史业务逻辑只可从 git 历史或归档说明参考，不能作为运行入口引用
  - shadcn/ui 通过 `npx shadcn@latest init` 在全新项目中初始化

### D2: 数据库迁移策略

- **Context**: Supabase 项目为空，旧迁移未应用
- **Decision**: 方案 A — 基于 PRD 数据模型编写单次完整 init migration，一次性创建所有 MVP 表 + RLS + pgvector + HNSW 索引
- **Consequences**:
  - Schema 设计与 PRD 数据模型严格对应
  - 使用 Supabase MCP 直接应用迁移
  - migration 文件名: `000001_init_mvp_schema.sql`

### D3: AI SDK API 版本

- **Context**: Context7 验证发现 AI SDK v6 API 与现有 spec 存在重大差异
- **Decision**: 使用 AI SDK v6 最新 API (`stepCountIs`、plain tool objects、`parameters`、`DefaultChatTransport`、`@ai-sdk/react`)
- **Consequences**: 现有 spec 文件需更新后才能实施

## Open Questions

无。准备进入实施阶段。

## Acceptance Criteria For This Planning/Spec Task

- [x] Target stack is explicitly locked.
- [x] External best-practice research is persisted under `research/`.
- [x] Context7 was used to verify current library API patterns.
- [x] Frontend Next.js/AI SDK executable spec exists and is indexed.
- [x] Backend Supabase/pgvector executable spec exists and is indexed.
- [x] Frontend UI/UX executable spec exists and is indexed.
- [x] `implement.jsonl` and `check.jsonl` include the relevant specs/research.
- [x] Bloom is recorded as the primary student learning axis, not merely a secondary annotation.
- [x] Teacher-side system instruction/prompt library direction is recorded.
- [x] Prompt preset governance is fixed for MVP: admin-managed global library, teacher read-only use.
- [x] Dataset production is recorded as a secondary strategic goal for future fine-tuned models.
- [x] First MVP slice is defined as an integrated student + teacher + admin loop.
- [x] MVP account provisioning is fixed as admin CSV import with initial passwords.
- [x] Product PRD is converged from the rough PRD and scoping docs.
- [x] User confirms the converged product PRD.
- [ ] Task is started only after PRD convergence.

## Definition of Done

- Trellis PRD clearly separates product vision, MVP scope, implementation slices, acceptance criteria, and out-of-scope items.
- Technical specs remain aligned with the locked stack.
- Implementation/check context files point to all relevant spec/research files.
- The task can safely enter `in_progress` for implementation after user confirmation.

## Out of Scope For This Planning Step

- Starting the full rewrite immediately.
- Reintroducing deleted legacy FastAPI/SQLite/Chroma backend files or split frontend/backend runtime outside the current `web/` scope.
- Finalizing UI design details before product scope is converged.
- Treating early rough PRD material or a deleted root `PRD` path as an active source of truth.
