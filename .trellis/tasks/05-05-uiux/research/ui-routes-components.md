# Research: UI routes, app shell, and reusable components for 05-05-uiux

- **Query**: Research the existing UI routes, layouts, sidebar/app shell, and reusable UI/workbench components for task `.trellis/tasks/05-05-uiux`; include current routes by role, key component files, existing design tokens/styles, reuse opportunities, and risks for the PRD's seven sample pages.
- **Scope**: internal
- **Date**: 2026-05-05

## Findings

### Files Found

| File Path | Description |
|---|---|
| `web/src/app/layout.tsx` | Root HTML/body, `TooltipProvider`, Geist Mono variable, Chinese metadata. |
| `web/src/app/globals.css` | Tailwind/shadcn imports, semantic tokens, Bloom six-level colors, CJK font variables, light/dark themes. |
| `web/src/app/page.tsx` | Root redirects authenticated users to role home and unauthenticated users to `/login`. |
| `web/src/app/login/page.tsx` | Public login page with product promise and school account form. |
| `web/src/app/student/layout.tsx` | Student protected layout, validates profile role/status, wraps `AppShell`. |
| `web/src/app/teacher/layout.tsx` | Teacher protected layout, validates profile role/status, wraps `AppShell`. |
| `web/src/app/admin/layout.tsx` | Admin protected layout, validates profile role/status, wraps `AppShell`. |
| `web/src/components/app-shell.tsx` | Shared protected shell with sidebar, sticky header, breadcrumb derivation, role badge. |
| `web/src/components/app-sidebar.tsx` | Role-specific sidebar nav arrays for student/teacher/admin. |
| `web/src/components/workbench/workspace-hero.tsx` | Reusable page hero, metrics, section headers, principle cards. |
| `web/src/components/workbench/state-surfaces.tsx` | Shared empty/blocked/error/loading/permission/success surfaces. |
| `web/src/components/workbench/student-chat-client.tsx` | Student AI chat UI using AI SDK `useChat`; currently requires manual project title. |
| `web/src/components/workbench/ai-message-list.tsx` | AI SDK `message.parts` renderer and chat bubbles. |
| `web/src/components/workbench/teacher-audit-client.tsx` | Current audit master/detail/labeling UI with SFT/DPO side panel. |
| `web/src/components/workbench/project-card.tsx` | Student project card with title, counts, highest Bloom badge, progress. |
| `web/src/components/workbench/bloom-badge.tsx` | Bloom level label/hint metadata and token-colored badge. |
| `web/src/components/workbench/bloom-ladder.tsx` | Six-level Bloom ladder for project detail. |
| `web/src/components/workbench/provider-capability-matrix.tsx` | Admin Provider capability matrix. |
| `web/src/app/api/student/chat/route.ts` | Student chat API route exists for real AI/data path. |
| `web/src/app/api/teacher/chat/route.ts` | Teacher chat API route exists for real AI/data path. |
| `.trellis/tasks/05-05-uiux/prd.md` | PRD defining design-system/app shell and seven key sample pages. |
| `.trellis/spec/frontend/ui-ux-guidelines.md` | Frontend product/UI contracts, route IA, state requirements. |
| `.trellis/spec/frontend/component-guidelines.md` | Component ownership and shared state component rules. |
| `.trellis/spec/frontend/directory-structure.md` | `web/src/app`, `components/ui`, `components/workbench`, data/API placement contract. |

### Current Routes by Role

Public/auth:
- `/` → `web/src/app/page.tsx`; calls `getUser()` then redirects to `/student`, `/teacher`, `/admin`, or `/login` (`page.tsx:4-9`).
- `/login` → `web/src/app/login/page.tsx`; login form posts to `/api/auth/login`, then routes by returned role (`login/page.tsx:38-65`).
- `/auth/callback` route handler exists.
- API handlers found: `/api/auth/login`, `/api/auth/logout`, `/api/logs`, `/api/student/chat`, `/api/teacher/chat`.

Student:
- `/student` → student ask/workspace page; loads workspace, projects, profile summary and renders `WorkspaceHero` + `StudentChatClient` (`student/page.tsx:9-14`, `student/page.tsx:58-71`).
- `/student/projects` → project grid/list with `ProjectCard` (`student/projects/page.tsx:7-18`, `student/projects/page.tsx:51-59`).
- `/student/projects/[projectId]` → project detail with tabs and `BloomLadder` (`student/projects/[projectId]/page.tsx:10-18`, `student/projects/[projectId]/page.tsx:61-94`).
- `/student/challenge` → challenge placeholder/blocked page using `BloomBadge` and state surfaces (`student/challenge/page.tsx:11-18`, `student/challenge/page.tsx:29-40`).
- `/student/me` → learning profile/Bloom distribution (`student/me/page.tsx:7-11`, `student/me/page.tsx:26-44`).

Teacher:
- `/teacher` → teaching chat/workspace; loads workspace, analytics, audit queue and renders `TeacherChatClient` (`teacher/page.tsx:9-14`, `teacher/page.tsx:56-66`).
- `/teacher/audit` → audit queue via `TeacherAuditClient` (`teacher/audit/page.tsx:4-8`).
- `/teacher/analytics` → action metrics and empty state (`teacher/analytics/page.tsx:6-20`, `teacher/analytics/page.tsx:45-49`).
- No `/teacher/audit/[recordId]` file was found in current route tree.

Admin:
- `/admin` → setup/users dashboard, logs, setup checklist, governance links (`admin/page.tsx:12-17`, `admin/page.tsx:59-66`, `admin/page.tsx:68-153`).
- `/admin/classes` exists.
- `/admin/providers` → Provider capability setup/matrix (`admin/providers/page.tsx:12-20`, `admin/providers/page.tsx:35-43`, `admin/providers/page.tsx:46-80`).
- `/admin/mcp` → MCP capability governance (`admin/mcp/page.tsx:10-18`, `admin/mcp/page.tsx:31-41`).
- `/admin/presets` exists.
- `/admin/logs` → structured/dev log viewer (`admin/logs/page.tsx:8-16`, `admin/logs/page.tsx:19-28`, `admin/logs/page.tsx:59-61`).
- Sidebar includes `/admin/exports`, but no `web/src/app/admin/exports/page.tsx` file was found; admin dashboard also links to `/admin/exports` (`app-sidebar.tsx:62`, `admin/page.tsx:149`).

### Code Patterns

- Protected role layouts repeat the same guard pattern: `getProfile()`, redirect if no profile, redirect on role mismatch, redirect on inactive status, then render `AppShell` with a role-specific display name (`student/layout.tsx:4-14`, `teacher/layout.tsx:4-14`, `admin/layout.tsx:4-14`).
- `AppShell` is already the single shell: `SidebarProvider` wraps `AppSidebar`, a sticky header provides `SidebarTrigger`, breadcrumbs, and `RoleBadge` (`app-shell.tsx:50-72`). Breadcrumb labels are currently hardcoded in `breadcrumbMap` for known routes including `/admin/exports` (`app-shell.tsx:14-29`).
- Sidebar IA is currently role-filtered by separate arrays: student has 4 items, teacher 3, admin 7 (`app-sidebar.tsx:43-64`); active state checks exact route or nested path (`app-sidebar.tsx:91-99`). Admin items are a flat list, not grouped into “学校管理 / AI 运维”.
- Global design tokens are centralized in `globals.css`: Tailwind v4 `@theme inline` maps semantic variables (`globals.css:6-66`), light theme defines rice-paper/ink/Dai-blue/cinnabar/Zijin/Bloom tokens (`globals.css:68-134`), dark theme mirrors them (`globals.css:136-180`), headings use `--font-heading` (`globals.css:191-193`).
- shadcn/base-ui primitives live under `components/ui`; `Button` uses `cva` variants/sizes and semantic token classes (`button.tsx:5-39`).
- Product-level composition is already in `components/workbench`: `WorkspaceHero` standardizes hero, actions, metrics (`workspace-hero.tsx:19-70`); `SectionHeader` standardizes section title/action layout (`workspace-hero.tsx:72-93`); `state-surfaces.tsx` centralizes empty/blocked/error/loading/permission/success UI (`state-surfaces.tsx:16-98`).
- AI chat UI follows AI SDK v6-style parts rendering: `StudentChatClient` uses `useChat` with `DefaultChatTransport({ api: '/api/student/chat' })` (`student-chat-client.tsx:27-29`), `AIMessageList` renders `message.parts` and ignores unknown safe parts (`ai-message-list.tsx:26-43`, `ai-message-list.tsx:45-67`).
- Bloom UI is tokenized and accessible: `BloomBadge` shows `L{level} 中文标签`, title, and aria label (`bloom-badge.tsx:14-25`); `BloomLadder` uses labels/tooltips and not color alone (`bloom-ladder.tsx:21-58`).

### Reuse Opportunities

- Keep using `WorkspaceHero`, `SectionHeader`, `PrincipleCard`, and metric cards as page-title/content-container baseline for the seven PRD pages.
- Keep using `AppShell` and `AppSidebar` as the protected role shell baseline; changes for project-first student nav or grouped admin nav can be localized there.
- Reuse `EmptyState`, `BlockedState`, `ErrorState`, `LoadingSurface`, `PermissionState`, `SuccessState` for required empty/loading/error/blocked/success states across the seven pages.
- Reuse `AIMessageList` and `ChatComposer` for student ask and teacher review chat-message rendering; they already support streamed `message.parts` and guarded submit patterns.
- Reuse `ProjectCard`, `BloomBadge`, `BloomStatusBadge`, and `BloomLadder` for student dashboard, project cards, challenge entry, and challenge route visualization.
- Reuse `ProviderCapabilityMatrix`, `AdminLogViewer`, `SetupChecklist`, and table primitives for admin dashboard/provider/log/export surfaces.
- Reuse existing Supabase data helpers surfaced through pages (`getStudentWorkspace`, `getStudentProjects`, `getStudentProfileSummary`, `getTeacherWorkspace`, `getTeacherAuditQueue`, `getTeacherAnalytics`, `getAdminDashboard`) as the route-level data-loading pattern.

### Risks / Gaps for PRD's Seven Sample Pages

1. 登录页: current page already matches the public promise direction and uses classical visual touches (`login/page.tsx:71-197`); risk is mainly ensuring any design-system changes keep this style aligned with protected shell.
2. 学生看板: `/student` currently combines dashboard hero, principles, chat, recent projects, and next-step cards on one page (`student/page.tsx:30-123`). PRD wants a dashboard focused on project overview, project-level Bloom distribution, and next actions; existing `/student/me` has distribution but not project-level dashboard cards (`student/me/page.tsx:26-44`).
3. 学生提问页: current `/student` chat requires manual project title before submit (`student-chat-client.tsx:23-45`) and has no left project/session tree. PRD requires natural ask first, automatic project assignment, lightweight “已归入《篇目》项目” feedback, and project-first sidebar highlighting without forced navigation.
4. 学生挑战页: `/student/challenge` is currently a blocked/manual answer placeholder with `providerReady = false` hardcoded (`student/challenge/page.tsx:14-18`, `student/challenge/page.tsx:29-40`). PRD requires project challenge card wall and single-project Bloom climbing route backed by real generation/evaluation.
5. 教师看板: `/teacher` currently emphasizes teaching chat and still displays “待审样本 / SFT / DPO” in teacher-facing text (`teacher/page.tsx:35-39`, `teacher/page.tsx:85-90`). PRD wants dashboard focused on student cognition, records needing verification, high-risk sessions/projects, and no SFT/DPO terminology.
6. 教师审阅页: `TeacherAuditClient` is currently 3 columns: queue, source prompt/model answer, SFT/DPO forms (`teacher-audit-client.tsx:58-139`). PRD wants 2-column immersive layout with student/project/session tree, full chat transcript, inline sentence-level highlights, direct editing of AI answer bubbles, and actions “确认无误 / 保存修订”.
7. 管理员看板: `/admin` has setup/user/log/data-governance pieces and links (`admin/page.tsx:39-153`), but sidebar is not grouped and `/admin/exports` page is missing while linked. PRD requires two dashboard summary groups, grouped sidebar, AI ops summary, and export entries for SFT JSONL / DPO JSONL / review metadata.

### Related Specs

- `.trellis/tasks/05-05-uiux/prd.md` — target UI/UX architecture and seven key sample pages.
- `.trellis/spec/frontend/ui-ux-guidelines.md` — role IA, design-token contract, state matrix, Bloom/teacher/admin UX contracts.
- `.trellis/spec/frontend/component-guidelines.md` — `components/ui` vs `components/workbench`, shared state surfaces, client/server component guidance.
- `.trellis/spec/frontend/directory-structure.md` — required route structure and `web/**` ownership.
- `.trellis/spec/frontend/next-ai-sdk-guidelines.md` — likely relevant for chat/streaming route work, not deeply read in this pass.

### External References

None. This was an internal code/spec research request.

## Caveats / Not Found

- Trellis active task command returned no current task, so this report was written to the explicit user-provided task path.
- No `web/src/app/admin/exports/page.tsx` was found despite sidebar/dashboard links.
- No `web/src/app/teacher/audit/[recordId]/page.tsx` was found despite spec route IA.
- This pass did not inspect every admin/classes/presets implementation in detail; focus stayed on routes, shell, reusable UI/workbench components, and the seven PRD pages.
