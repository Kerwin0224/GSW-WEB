# Research: Specs and Prior UI Decisions for 05-05-uiux

- **Query**: Research existing Trellis specs, PRDs, and design-related documents relevant to `.trellis/tasks/05-05-uiux`; include relevant `.trellis/spec` entries, prior UI/UX PRDs/design docs, constraints or conventions for implementation/check agents.
- **Scope**: internal
- **Date**: 2026-05-05

## Findings

### Files Found

| File Path | Description |
|---|---|
| `.trellis/tasks/05-05-uiux/prd.md` | Current UI/UX architecture refactor plan; defines target visual direction, seven sample pages, and end-to-end real data loop. |
| `PRD.md` | Root product PRD; contains original product positioning, Bloom model, role permissions, core UX sketches, UI/UX style guide, responsive/accessibility specs, and technical constraints. |
| `.trellis/spec/frontend/index.md` | Frontend spec index; active specs include design tokens, UI/UX, role workspaces, component/state/type/quality guidelines. |
| `.trellis/spec/frontend/ui-ux-guidelines.md` | Product interaction contract for role IA, public entry promise, Bloom student UX, teacher audit, admin governance, AI streaming states, accessibility. |
| `.trellis/spec/frontend/design-tokens.md` | Executable Tailwind v4 + shadcn CSS variable contract; semantic tokens, Bloom six-color tokens, font, contrast, dark-mode requirements. |
| `.trellis/spec/frontend/student-workspace.md` | Prior executable student core-loop spec: three-pane chat, per-message Bloom status, project cards, challenge/profile contracts. |
| `.trellis/spec/frontend/teacher-workspace.md` | Prior executable teacher spec: three-pane audit layout, SFT/DPO form contract, prompt presets, actionable analytics. |
| `.trellis/spec/frontend/admin-workspace.md` | Prior executable admin spec: capability cockpit, provider capability matrix, unified admin patterns, no fake metrics. |
| `.trellis/spec/frontend/component-guidelines.md` | shadcn/ui ownership, component placement, Server/Client component boundaries, state component contracts. |
| `.trellis/spec/frontend/state-management.md` | Explicit empty/loading/error/blocked/permission/success/streaming state contracts; no demo rows or pretend success. |
| `.trellis/spec/frontend/quality-guidelines.md` | UI quality gate: lint/build, forbidden legacy/scaffold/fallback patterns, no mock operational rows or fake Bloom. |
| `.trellis/spec/frontend/type-safety.md` | Type and validation constraints for role strings, Bloom levels, audit statuses, provider capabilities, AI SDK parts. |
| `.trellis/spec/frontend/next-ai-sdk-guidelines.md` | AI SDK App Router and streaming UI contracts; relevant for real chat/teacher/admin AI states. |
| `.trellis/spec/frontend/directory-structure.md` | Current `web` App Router ownership and route/component/lib structure constraints. |
| `.trellis/spec/frontend/hook-guidelines.md` | Client hook boundaries, AI SDK `useChat`, SSR-safe responsive hooks, data hook states. |
| `.trellis/spec/backend/supabase-pgvector-guidelines.md` | Supabase/Auth/RLS/provider/secret/export data contracts; key no-fallback backend constraints for real UI loops. |
| `.trellis/tasks/05-02-nextjs-supabase-fullstack-refactor/ui-ux-design.md` | Earlier detailed UI/UX architecture and wireframes for role workspaces, login, student, teacher, admin, exports. |
| `.trellis/tasks/05-04-ui-design-system/prd.md` | Prior design-system task; established Tailwind v4/shadcn/Bloom token/font verification requirements. |
| `.trellis/tasks/05-04-ui-student-core-loop/prd.md` | Prior student UX PRD; changed student home from intro page to workbench and scoped challenge/Bloom decisions. |
| `.trellis/tasks/05-04-ui-teacher-audit-triple/prd.md` | Prior teacher UX PRD; established teacher ask/audit/analytics loop and three-pane audit decisions. |
| `.trellis/tasks/05-04-ui-admin-capability/prd.md` | Prior admin UX PRD; established admin capability cockpit, broken-link provider alerts, unified dialog pattern. |
| `.trellis/tasks/05-03-prd/prd.md` | PRD audit/refinement task; records no-hallucination and real-library/API verification principles. |

### Code Patterns

This research pass was document-focused and read-only; no source code was modified. The implementation/check agents should still treat the following line-cited document contracts as binding context:

#### Current 05-05 UI/UX task

- `.trellis/tasks/05-05-uiux/prd.md:4-6` defines the task as an experience-architecture refactor from “后台模板” to “现代教育 SaaS + 古典气质点缀”, not simple repainting.
- `.trellis/tasks/05-05-uiux/prd.md:17-22` requires a minimal reusable design system plus unified role App Shell, role sidebar, page title area, and content container.
- `.trellis/tasks/05-05-uiux/prd.md:24-37` defines student golden path: natural ask, automatic project attribution, project-first sidebar, session Bloom path, project-level Bloom distribution, separate challenge route.
- `.trellis/tasks/05-05-uiux/prd.md:38-50` defines teacher review loop: dashboard focuses on cognition and verification, two-column immersive review, inline segment highlighting, direct editing of AI answer bubbles, student sees only revised answer.
- `.trellis/tasks/05-05-uiux/prd.md:52-62` defines admin AI-native backend: school management vs AI operations sidebar groups, SFT/DPO/provider/MCP/log/export terminology allowed only on admin side.
- `.trellis/tasks/05-05-uiux/prd.md:63-78` requires Phase 1 to be real end-to-end: real AI, real Supabase reads/writes, real attribution/Bloom/challenge/pre-review/revision/export loop; AI judgment should show result by default, teacher pre-review shows sentence/segment red highlight plus issue type.
- `.trellis/tasks/05-05-uiux/prd.md:79-91` lists required baseline pages: login, student dashboard, student ask, student challenge, teacher dashboard, teacher review, admin dashboard.
- `.trellis/tasks/05-05-uiux/prd.md:220-250` acceptance/DoD requires runnable pages, real role golden paths, lint/type checks, AI/Supabase availability, SFT/DPO/metadata export format, and empty/loading/error/confirmed/revised/pending states.
- `.trellis/tasks/05-05-uiux/prd.md:252-259` excludes immersive ancient-academy styling, pure ChatGPT UI, challenge mixed into normal ask, teacher-side SFT/DPO terms, and student exposure to pre-revision incorrect AI answer.

#### Root PRD and earlier UX architecture

- `PRD.md:4-10` positions the product around Bloom-driven classical Chinese learning, teacher audit, and natural production of SFT/DPO data.
- `PRD.md:14-23` defines Bloom L1-L6 names and classical-literature examples; all Bloom UI should preserve this model.
- `PRD.md:115-133` defines the student/teacher AI conversation flow: streaming answer, poem classification/project attribution, Bloom tagging in parallel.
- `PRD.md:168-260` describes Bloom path and challenge UX: ladder metaphor, project cards, challenge generated from current level, independent challenge interface.
- `PRD.md:446-461` gives interaction state matrix for chat, project list, cognitive path, challenge, radar, audit panel, heatmap, provider, export.
- `PRD.md:1401-1412` sets original visual style: traditional-culture color inspiration, rice-paper background, ink text, CJK heading font, light shadow, restrained decorative elements.
- `PRD.md:1581-1586` requires desktop/tablet/mobile responsive behavior.
- `PRD.md:1614-1665` requires WCAG 2.1 AA principles, visible focus, labels, `aria-live="polite"`, semantic page structure, and non-color-only Bloom meaning.
- `.trellis/tasks/05-02-nextjs-supabase-fullstack-refactor/ui-ux-design.md` remains relevant as prior IA/wireframe source: role workspaces, route map, login promise, student project/Bloom/challenge, teacher audit, admin providers/MCP/exports.

#### Frontend specs

- `.trellis/spec/frontend/ui-ux-guidelines.md:52-77` says the product is a school-facing AI education workbench, not generic chatbot/LMS; role → workspace → task → educational artifact; no fake success when provider/Supabase/profile/permission is missing.
- `.trellis/spec/frontend/ui-ux-guidelines.md:227-263` defines role route IA: `/student`, `/student/projects`, `/student/projects/[projectId]`, `/student/challenge`, `/student/me`, `/teacher`, `/teacher/audit`, `/teacher/analytics`, `/admin`, `/admin/classes`, `/admin/providers`, `/admin/mcp`, `/admin/presets`, `/admin/exports`.
- `.trellis/spec/frontend/ui-ux-guidelines.md:267-315` defines public entry copy: primary promise “学好古诗文，教好古诗文。”; do not foreground admin/provider/MCP/export copy on public login/entry.
- `.trellis/spec/frontend/ui-ux-guidelines.md:381-455` defines Bloom-centered student UX: Chinese labels, pending/failed classification states, project cards with title/author/activity/question count/highest level/practice progress, not color alone.
- `.trellis/spec/frontend/ui-ux-guidelines.md:458-535` defines teacher ask/audit UX: preset-first ask, audit queue scoped by class/student, source conversation visible before SFT/DPO labeling, no approval with missing fields.
- `.trellis/spec/frontend/ui-ux-guidelines.md:538-594` defines admin governance UX: provider capability-based config, masked secrets, MCP disabled until configured, exports only from audited/approved real records.
- `.trellis/spec/frontend/ui-ux-guidelines.md:612-681` requires AI SDK UIs to render `message.parts`, guard duplicate submit, keep input/history visible after errors, and avoid leaking private tool metadata.
- `.trellis/spec/frontend/ui-ux-guidelines.md:685-755` requires empty/loading/error/permission/validation/success states, semantic HTML, labels, `role="alert"`, `aria-live="polite"`, dialog focus management, keyboard access, and responsive smoke.
- `.trellis/spec/frontend/design-tokens.md:68-83` requires calm academic styling, semantic tokens over raw colors, Bloom colors as cognitive levels rather than severity, Bloom never as only signal, explicit dark-mode token remap.
- `.trellis/spec/frontend/design-tokens.md:85-93` records the CJK heading font contract; note the file contains historical wording variants around `@fontsource` vs local font loading, so implementers should inspect current `web/src/app/globals.css` and `web/src/app/layout.tsx` before changing font loading.
- `.trellis/spec/frontend/design-tokens.md:94-100` forbids hardcoded brand/Bloom hex and raw Tailwind palette classes for product semantic UI.
- `.trellis/spec/frontend/design-tokens.md:125-130` requires WCAG 2.1 AA contrast and 3:1 non-text UI contrast.
- `.trellis/spec/frontend/component-guidelines.md:40-50` requires shadcn primitives to remain generic, product components under `components/workbench` or feature folders, Server Components by default, `className` support, `cn()`, role data from server boundaries, and reusable empty/loading/error/disabled states.
- `.trellis/spec/frontend/state-management.md:47-56` says empty means no real data, blocked means missing prerequisite, error uses `role="alert"`, success only after real commit, streaming keeps input/history visible and guards duplicate submit.
- `.trellis/spec/frontend/quality-guidelines.md:28-36` requires lint/build, no legacy FastAPI/SQLite/Chroma/scaffold/legacy AI message patterns, all primary page states, masked secrets, no mock-success operational rows, no canned AI answers, no fake Bloom labels.

#### Role workspace specs from 05-04

- `.trellis/spec/frontend/student-workspace.md:17-24` makes `/student` a three-pane workbench: left project rail, center chat, right session Bloom panel; no hero-first layout.
- `.trellis/spec/frontend/student-workspace.md:101-109` requires server data loading in `/student/page.tsx`, client-only state for `useChat`, real projects from `getStudentProjects()`, session-level Bloom state, and visible provider/classification blocked states.
- `.trellis/spec/frontend/student-workspace.md:165-171` requires per-message Bloom pending/classified/failed/unclassified states and backend-supplied ascension suggestion rendering.
- `.trellis/tasks/05-04-ui-student-core-loop/prd.md:88-92` made prior scope decisions: no gold-particle animation, no decorative traditional-color layer/water-ink texture, no MCP Server UI, no streaks/weeklies. This may conflict with 05-05’s renewed classical accents; treat 05-05 as current for accents, but keep “restrained, not immersive” from both docs.
- `.trellis/spec/frontend/teacher-workspace.md:18-25` requires `/teacher/audit` to be a three-pane workbench, not table-only: candidate list, source conversation, annotation form; mobile stacks candidate → source → form.
- `.trellis/spec/frontend/teacher-workspace.md:80-90` requires source prompt/answer visible before labels, stable highlighted source message, SFT/DPO sibling tabs, internal pane scrolling, AI SDK parts rendered by type.
- `.trellis/spec/frontend/teacher-workspace.md:143-219` defines canonical SFT/DPO fields and statuses; V1 supports pairwise chosen/rejected DPO only.
- `.trellis/tasks/05-04-ui-teacher-audit-triple/prd.md:83-86` prior non-goals: no teacher heatmap v1, no three-way DPO, no multi-teacher collaborative labeling.
- `.trellis/spec/frontend/admin-workspace.md:19-25` requires admin first screen to answer whether students can learn, teachers can teach, and incidents can be located; server-render/polling only in V1.
- `.trellis/spec/frontend/admin-workspace.md:152-160` defines readiness by provider capability chains and forbids stale hardcoded metrics.
- `.trellis/tasks/05-04-ui-admin-capability/prd.md:35-38` requires provider broken-link color via destructive token and unified Dialog pattern across MCP/Provider/Preset/CSV/Export.
- `.trellis/tasks/05-04-ui-admin-capability/prd.md:85-88` prior admin non-goals: no multi-tenant school×grade structure v1, no MCP runtime integration UI, no realtime WebSocket log stream.

#### Backend/data constraints relevant to UI claims

- `.trellis/spec/backend/supabase-pgvector-guidelines.md:279-285` says privileged App Router endpoints still need explicit role checks before side effects such as CSV import, provider/MCP config, preset publishing, or dataset export.
- `.trellis/spec/backend/supabase-pgvector-guidelines.md:293-296` says missing Supabase/RPC/embedding/provider config must fail clearly and be visible; do not fall back to SQLite, Chroma, text-search placeholders, or FastAPI.
- `.trellis/spec/backend/supabase-pgvector-guidelines.md:311-316` says secrets are server-only; Supabase stores metadata/secret refs/last-four, MCP connection keys stay server-only, and missing capability/key/path is a blocked state with no mock provider or placeholder answer.
- `.trellis/spec/backend/supabase-pgvector-guidelines.md:397-405` says protected data helpers require verified Supabase profile/role, `profiles.role` is routing authority, teacher audit inserts only after source assistant message accessibility and SFT/DPO validation, exports only approved records.
- `.trellis/spec/backend/supabase-pgvector-guidelines.md:415-421` maps missing provider/model/embedding/invalid SFT/DPO/no approved audit records to blocked/errors rather than canned output or fake export.

### External References

None used. This task was internal-only research over Trellis specs, PRDs, and design docs.

### Related Specs

- `.trellis/spec/frontend/ui-ux-guidelines.md` — primary UI/UX product contract.
- `.trellis/spec/frontend/design-tokens.md` — primary visual token contract.
- `.trellis/spec/frontend/student-workspace.md` — student core loop contract.
- `.trellis/spec/frontend/teacher-workspace.md` — teacher audit/ask/analytics contract.
- `.trellis/spec/frontend/admin-workspace.md` — admin capability cockpit contract.
- `.trellis/spec/frontend/component-guidelines.md` — component architecture and shadcn ownership.
- `.trellis/spec/frontend/state-management.md` — state surface and no-demo-state contract.
- `.trellis/spec/frontend/quality-guidelines.md` — lint/build and no-fallback verification contract.
- `.trellis/spec/backend/supabase-pgvector-guidelines.md` — Supabase/provider/secret/RLS/export no-fallback constraints.

## Caveats / Not Found

- Active Trellis task lookup returned none in this worktree, but the user explicitly provided the target path `.trellis/tasks/05-05-uiux`; output was written there as requested.
- The exact requested output path did not exist in the worktree before creation; the `research/` directory was created under the provided task path.
- GitNexus/MCP tools were not used in this research pass; prior specs themselves record GitNexus WAL corruption caveats for 05-04 specs. Implementation agents should re-run any required GitNexus impact analysis before editing symbols.
- Some earlier 05-04 PRDs intentionally scoped down decorative classicism and animations; current 05-05 PRD reintroduces “现代教育 SaaS + 古典气质点缀”. Treat 05-05 as current direction, while preserving restraint and readability from prior specs.
- This file is a concise document map, not implementation review; it does not assert current code compliance.
