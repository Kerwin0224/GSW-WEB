# Research: data-ai-export-flows

- **Query**: Research existing data model, API routes, Supabase access patterns, AI chat routes, logging/export-related code, and challenge/Bloom logic for task `.trellis/tasks/05-05-uiux`; include gaps for project assignment, teacher review, student sync, SFT/DPO JSONL export.
- **Scope**: internal
- **Date**: 2026-05-05

## Findings

### Files Found

| File Path | Description |
|---|---|
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/supabase/migrations/202605030001_school_account_login_compat.sql` | Current full schema snapshot: roles, provider capabilities, projects, conversations/messages, practice, audit, export batches, RLS. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/supabase/migrations/202605020001_fullstack_refactor.sql` | Refactor migration adding/altering same model and policies. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/supabase/server.ts` | Server Supabase client with custom school-session headers. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/supabase/browser.ts` | Browser Supabase client using publishable/anon key only. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/session.ts` | HMAC school session cookie and DB session signature helpers. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/app/api/auth/login/route.ts` | School login API; calls Supabase RPC `authenticate_school_account`, attaches role session. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/app/api/auth/logout/route.ts` | Clears school session cookie. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/app/api/student/chat/route.ts` | Student AI streaming route; creates project/conversation/messages and attempts audit seed. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/app/api/teacher/chat/route.ts` | Teacher AI streaming route; requires published preset and creates conversation/messages/audit seed. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/app/api/logs/route.ts` | Client log ingestion API. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/data/common.ts` | Role gates, Provider capability lookup, env secret resolution, UI-message text extraction. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/data/student.ts` | Student project/profile data loaders. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/data/teacher.ts` | Teacher workspace, audit queue, analytics loaders. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/data/teacher-actions.ts` | SFT/DPO audit server actions. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/data/admin.ts` | Admin dashboard/providers/classes/presets/export server actions. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/data/retrieval.ts` | Embedding capability + pgvector retrieval helpers; not currently wired into chat routes. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/observability/log-event.ts` | Structured log shape and redaction. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/observability/server-log-store.ts` | JSONL file log writer/reader and dev-log status. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/lib/observability/with-api-logging.ts` | API start/completion/failure logging wrapper. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/app/admin/logs/page.tsx` | Admin log viewer page. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/app/student/challenge/page.tsx` | Challenge UI placeholder; generation/evaluation blocked locally. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/components/workbench/bloom-badge.tsx` | Bloom level labels/colors. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/components/workbench/bloom-ladder.tsx` | Bloom ladder display. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/components/workbench/student-chat-client.tsx` | Student chat client; requires manual project title. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/web/src/components/workbench/teacher-audit-client.tsx` | Current teacher SFT/DPO form UI. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/tasks/05-05-uiux/prd.md` | Task requirements and acceptance criteria. |

### Code Patterns

#### Data model and RLS

- `202605030001_school_account_login_compat.sql:5-11` defines enums: `app_role`, `provider_capability`, `interaction_source`, `audit_kind`, `audit_status`, `export_status`.
- `202605030001_school_account_login_compat.sql:13-40` defines `profiles`, `classes`, `class_memberships`; memberships are the teacher/student class boundary.
- `202605030001_school_account_login_compat.sql:42-64` defines `provider_configs` + `provider_capabilities` with `secret_ref`, masked key tail, `health_status`, `capability`, `model_id`.
- `202605030001_school_account_login_compat.sql:98-134` defines `text_projects`, `conversations`, `conversation_messages`; `conversation_messages` has `bloom_level`, `bloom_state`, `model_id`, `parts`.
- `202605030001_school_account_login_compat.sql:165-176` defines `practice_records` for challenge/practice outcomes (`target_bloom_level`, `prompt`, `answer`, `feedback`, `achieved`, `evaluation_state`).
- `202605030001_school_account_login_compat.sql:178-207` defines `audit_records` and `export_batches`; `export_batches.jsonl` stores generated JSONL text in DB.
- `202605030001_school_account_login_compat.sql:278-285` scopes projects/conversations/messages to owner/admin and class teachers; inserts into `conversation_messages` are owner-only.
- `202605030001_school_account_login_compat.sql:356-364` scopes `practice_records`, `audit_records`, and `export_batches`; audit insert is teacher/admin only, exports are admin-only.

#### Supabase access/session pattern

- `server.ts:9-40` creates a server Supabase client with publishable/anon key plus `x-cwb-user-id` and `x-cwb-session-signature` headers from the app session.
- `session.ts:45-47` signs a user id with `CWB_AUTH_SECRET`; migration `202605020001_fullstack_refactor.sql:49-68` defines `current_app_user_id()` to trust those headers when signature matches.
- `browser.ts:6-17` creates a browser client with only public URL + publishable/anon key.
- `auth/login/route.ts:35-40` uses RPC `authenticate_school_account`; `auth/login/route.ts:68-80` writes a role-specific app session cookie.

#### AI provider patterns

- `common.ts:24-44` reads a single enabled `provider_capabilities` row, checks provider enabled/health/`secret_ref`, and resolves env secrets server-side via `resolveEnvSecret()` (`common.ts:46-52`).
- Student route requires `student_chat`, `project_classification`, and `bloom_classification` readiness before streaming (`student/chat/route.ts:38-42`), but only calls the `student_chat` model in the route.
- Teacher route requires `teacher_chat` readiness and a published teacher preset (`teacher/chat/route.ts:37-44`).
- Both chat routes use AI SDK streaming: `safeValidateUIMessages`, `convertToModelMessages`, `streamText`, `stepCountIs(5)`, `toUIMessageStreamResponse()` (`student/chat/route.ts:34-79`, `teacher/chat/route.ts:34-63`).
- Provider construction supports `gateway` via `createGateway()` and otherwise OpenAI-compatible via `createOpenAI()` (`student/chat/route.ts:12-18`, `teacher/chat/route.ts:12-18`).
- `retrieval.ts:21-84` supports embedding model resolution and `match_document_chunks` RPC, but no current chat route imports it.

#### Current student project/Bloom/challenge flow

- Client requires manual `projectTitle`; submit is disabled without it (`student-chat-client.tsx:36-45`, `student-chat-client.tsx:81-95`).
- If no `projectId`, student route requires `projectTitle` and upserts `text_projects` with `classification_state: 'classified'` (`student/chat/route.ts:48-58`). No project-classification model call is present in the route.
- Student route creates/fetches a conversation and inserts user/assistant messages (`student/chat/route.ts:60-76`); user message `bloom_state` is `pending`, assistant message is `unclassified`.
- Student project detail renders Bloom ladder from stored `conversation_messages.bloom_level` and project `highest_bloom_level` (`student/projects/[projectId]/page.tsx:35-69`).
- `bloom-badge.tsx:5-12` maps Bloom levels 1-6 to labels/hints; `bloom-ladder.tsx:21-56` displays levels and empty “尚无真实分类数据” state.
- Challenge page has `providerReady = false` and no data/API call; it renders blocked state for missing `practice_generation / practice_evaluation` (`student/challenge/page.tsx:14-31`).

#### Current teacher review/audit flow

- Teacher audit queue loads recent assistant messages, filters out rows with existing `audit_records`, and fetches latest user prompt per conversation (`teacher.ts:19-65`).
- The queue is flat assistant-message based; it does not currently build a student/project/conversation tree.
- `teacher-audit-client.tsx:35-141` renders a three-column queue/source/SFT-DPO form. It shows prompt + answer, but not the complete conversation transcript.
- SFT action validates quality/prompt/original/correction/rationale and inserts `audit_records` with `kind: 'sft'` and status `approved` or `rejected` (`teacher-actions.ts:7-49`).
- DPO action validates prompt/original/chosen/rejected/rationale and inserts `audit_records` with `kind: 'dpo'`, status `approved` (`teacher-actions.ts:52-95`).
- Teacher chat route automatically seeds a pending SFT audit record on AI finish (`teacher/chat/route.ts:58-61`).

#### Current logging/export support

- `with-api-logging.ts:3-47` wraps API handlers with started/completed/failed JSONL events.
- `log-event.ts:2-15` defines event fields; `log-event.ts:17-37` redacts keys matching password/secret/token/cookie/authorization/api key patterns.
- `server-log-store.ts:11-24` writes `.logs/app-events.jsonl`; `server-log-store.ts:28-65` reads recent app events/dev log lines and file status.
- `api/logs/route.ts:8-35` accepts client log payloads and writes sanitized events.
- `admin/logs/page.tsx:8-65` displays recent structured events and `next-dev.log` lines.
- `admin.ts:113-143` implements admin export data loader and `createExportBatch()`: selects approved `audit_records` by kind, serializes SFT as `{ prompt, completion, source_record_id }`, DPO as `{ prompt, chosen, rejected, source_record_id, rationale }`, stores in `export_batches.jsonl`, then marks records exported.
- No `web/src/app/admin/exports/page.tsx` exists in the app file list, although `/admin` links to `/admin/exports` (`admin/page.tsx:35-36`, `admin/page.tsx:149-150`). No API route for downloading export batches was found.

### Gaps for 05-05 UIUX Scope

- **Project assignment**: current student flow requires manual `projectTitle` and route upserts it as classified; no automatic AI project classification result is computed or lightly surfaced to the chat UI.
- **Bloom classification/path**: capability readiness is checked, and schema/UI can store/display `bloom_level`, but no route currently invokes `bloom_classification` or updates `conversation_messages.bloom_level`, `bloom_state: 'classified'`, or `text_projects.highest_bloom_level`.
- **Challenge flow**: schema has `practice_records` and capabilities include `practice_generation` / `practice_evaluation`, but the page is blocked with local constants and no generation/evaluation API exists.
- **Teacher review**: current review is SFT/DPO terminology form-based; PRD requires teacher-language review, complete student/project/session tree, inline AI pre-review highlights, direct answer bubble editing, and confirm/revise actions.
- **Student sync after teacher revision**: `conversation_messages` has only `content`, `parts`, `bloom_*`, `model_id`; no found fields or read paths for original answer vs teacher-revised answer, revision status, or “教师已修订” display. Current student pages read raw message content/questions only.
- **AI pre-review**: capability `audit_assist` exists in provider matrix/schema, but no route/helper found that calls it to mark suspicious spans or issue labels.
- **SFT/DPO export**: DB-side JSONL batch creation exists, but no admin exports page/download route was found; exported JSONL lacks separate review metadata export required by PRD, and DPO generation is manual via form rather than naturally produced from teacher revision.
- **Audit seed caveat**: student chat route attempts to insert a pending SFT `audit_records` row (`student/chat/route.ts:74-77`), while RLS allows audit insert only for teacher/admin (`202605030001_school_account_login_compat.sql:360-362`); the insert result is not checked in the route.

### Related Specs

- `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/tasks/05-05-uiux/prd.md` — requires true end-to-end student project assignment, Bloom/challenge, teacher review/revision/student sync, and SFT/DPO/review metadata export.
- `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/.trellis/spec/frontend/next-ai-sdk-guidelines.md` — route handler and AI SDK streaming contracts; current chat routes generally follow this pattern.
- `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/.trellis/spec/backend/database-guidelines.md` — placeholder only.
- `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a39fba629bf416a4b/.trellis/spec/backend/logging-guidelines.md` — placeholder only.

### External References

- Not used; this was an internal codebase/schema research task.

## Caveats / Not Found

- Active Trellis task resolution returned none; output path was provided explicitly by the user and used directly.
- No code changes were made outside this research file.
- `web/src/lib/supabase/database.types.ts` was not summarized in detail because migration files contain the executable schema contract.
- Search did not find an `/api/...` route for project classification, Bloom classification, practice generation/evaluation, audit-assist pre-review, student revision sync, export download, or review metadata export.
