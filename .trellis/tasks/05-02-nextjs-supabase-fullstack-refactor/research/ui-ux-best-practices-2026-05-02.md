# UI/UX Best Practices Research — 2026-05-02

Task: Next.js + Tailwind CSS + shadcn/ui + Vercel AI SDK + Supabase full-stack refactor.
Priority from user: finish UI/UX design first, from first principles, with no legacy/mock/fallback product paths.

## Evidence Sources

### Tavily research/search

- Tavily research prompt: AI-assisted education platforms with role-based student/teacher/admin workspaces, Bloom taxonomy, AI tutor chat, audit queues, admin governance consoles, streaming AI states, transparency, accessibility, and IA.
- Tavily search prompt: AI education app UX best practices role based dashboard Bloom taxonomy chat tutor empty states accessibility streaming AI citations.
- Useful source themes surfaced by Tavily:
  - Responsible AI in education: transparency, rigor, curiosity, human oversight, AI literacy, privacy, and accessibility.
  - Bloom taxonomy in AI-assisted learning: use Bloom to define learning outcomes and clarify what AI supports vs. what the student must still construct personally.
  - Teacher AI tools: teachers need intuitive workflows, editable outputs, clear source visibility, comparison/history, and human review controls.
  - Accessibility: semantic HTML first, ARIA only as enhancement, keyboard operability, screen-reader announcements, and human review of AI-generated alt/source descriptions.

### Context7 official-library verification

- Next.js: `/vercel/next.js`
  - App Router root layout is required and layouts/pages are Server Components by default.
  - Fetch protected data in Server Components/server helpers; pass data into Client Components only for interactivity.
  - App Router supports nested layouts, loading states, error boundaries, and file-system route organization.
- Tailwind CSS: `/websites/v3_tailwindcss`
  - Design tokens can be mapped to CSS variables and consumed through theme color definitions.
  - Use dark variants for dark mode and responsive utilities for adaptive cards/layouts.
  - Extend theme rather than overriding defaults when possible.
- shadcn/ui: `/shadcn-ui/ui`
  - `components.json` owns component registry configuration, aliases, RSC/TSX flags, CSS path, CSS variables, and icon library.
  - shadcn theming is CSS-variable driven; components are copied into the project and become project-owned design-system code.
  - Sidebar, table, dialog, sheet, tooltip, skeleton, progress, tabs, select, and form primitives are suitable for the role workspaces.
- Vercel AI SDK: `/vercel/ai`
  - React chat UIs should use `@ai-sdk/react` `useChat` plus `DefaultChatTransport`.
  - `messages` are rendered through `message.parts`; text parts are only one part type, and tool parts must be handled explicitly.
  - AI streaming UX must include loading/streaming/error states and prevent duplicate submit while streaming.
- Supabase SSR: `/supabase/ssr`
  - Next.js SSR auth uses `createServerClient` with explicit cookie `getAll`/`setAll` handlers.
  - Middleware should refresh sessions before protected Server Components rely on cookies.
  - Use `getUser()` for verified authorization decisions; do not use unverified cookie session data for role access.
  - Browser clients use only public URL + anon/publishable key.

## First-Principles UI/UX Synthesis

### Product physics

1. The product is not a chatbot shell. It is a role-aware education workbench where AI is one capability inside learning, teaching, audit, and governance workflows.
2. The core object is not `message`; the core object is `role -> task -> educational artifact`:
   - Student: poem/text project, question, practice attempt, Bloom progression.
   - Teacher: class/student scope, prompt preset, teaching interaction, audit record.
   - Admin: users/classes, provider/MCP capability, prompt preset publication, dataset export.
3. AI output is never final truth by itself. The UI must make AI state visible and preserve human review where decisions affect learning records, audit labels, exports, provider setup, or permissions.
4. No fallback means no fake success. If provider/Supabase/auth/config is missing, the UI must show an actionable blocked state instead of mock data or canned responses.
5. Cognitive load should match user role:
   - Student: guided, encouraging, next-step focused.
   - Teacher: efficient, inspectable, editable, class-scoped.
   - Admin: precise, configuration-first, no ambiguous operational state.

### Information architecture lock

```text
/login
/student
/student/projects
/student/projects/[projectId]
/student/practice or /student/challenge
/student/me
/teacher
/teacher/audit
/teacher/audit/[recordId]
/teacher/analytics
/admin
/admin/classes
/admin/providers
/admin/mcp
/admin/presets
/admin/exports
```

Route groups may be used for implementation organization, but URLs must remain role-obvious and not mix role surfaces.

### Workspace shell contract

Every protected workspace must expose:

- Role-specific sidebar navigation only for current role actions.
- Breadcrumbs for location and nested records.
- A role badge/profile footer.
- Layout-stable loading skeletons.
- Actionable empty states.
- Error states with retry/configure/contact-owner action where appropriate.
- No cross-role navigation leak.

### Student UX lock

Student UI centers on “ask → project filing → Bloom guidance → practice → reflection”.

Required surfaces:

1. Ask surface
   - Chat input with suggested prompts for common classical Chinese tasks.
   - Streaming response with `aria-live="polite"`.
   - Message parts renderer for text, retrieval/citation state, Bloom classification state, and project classification state.
   - Duplicate submit disabled during streaming.
   - No fake Bloom badge; pending classification shows `待标注`, failed classification shows `未分类`.
2. Project surface
   - Project card grid: title, author/source, last activity, question count, highest Bloom level, practice progress.
   - Project detail: question history + practice records + Bloom ladder.
   - Bloom ladder uses six stable levels and colors; it is learning guidance, not punishment.
3. Practice/challenge surface
   - Student sees target Bloom level, why this level matters, question, hint, answer field, submit, feedback, retry/next action.
   - Failed evaluation must preserve the student's answer and show constructive feedback.

### Teacher UX lock

Teacher UI centers on “preset-assisted teaching ask → inspect/edit AI output → audit records → dataset candidate quality”.

Required surfaces:

1. Teacher ask
   - Preset selector is first-class, not a hidden setting.
   - Each preset displays scenario, intended use, variable requirements, and version.
   - AI output must be editable/copiable/savable as a teacher artifact.
2. Audit queue
   - Queue filters: class, student, source type, Bloom level, audit status, candidate type, date.
   - Split pane or master/detail layout: record list on left, source conversation + annotation panel on right.
   - SFT and DPO tabs must use explicit field labels matching export contracts.
   - Submit must validate required fields; no partial silent save as approved.
3. Analytics
   - MVP analytics should support teacher action, not broad vanity dashboards.
   - Show class/student scope, distribution, recent audit workload, and student progression summaries only when backed by real data.

### Admin UX lock

Admin UI centers on “make the system safe and usable before learning flows run”.

Required surfaces:

1. Setup/status dashboard
   - Provider configured?
   - Supabase reachable/auth configured?
   - Users/classes present?
   - Prompt presets published?
   - MCP capabilities enabled?
   - Audited exports available?
2. Users/classes
   - Tables with empty states, import preview, validation errors, and confirmation before commit.
   - Teacher-class and student-class relationships must be visible.
3. Providers/MCP
   - Capability-based config, not just raw key/value fields.
   - Server-side secrets must never be displayed after save.
   - Missing provider blocks AI actions; UI must say which action is blocked and which admin page resolves it.
4. Presets/export
   - Prompt preset lifecycle: draft -> published -> disabled.
   - Dataset export lifecycle: eligible -> audited -> approved -> exported.

## shadcn/ui + Tailwind Component Mapping

| Product need | shadcn/ui primitive | Notes |
| --- | --- | --- |
| Workspace navigation | `sidebar`, `breadcrumb`, `separator`, `avatar`, `badge` | Role-filter nav before render. |
| Login/auth forms | `card`, `label`, `input`, `button`, `alert` | Errors use `role="alert"`; do not reveal auth internals. |
| Student chat | `textarea`, `button`, `scroll-area`, `badge`, `skeleton`, `tooltip` | AI SDK `message.parts` renderer; live region for stream. |
| Bloom ladder | `card`, `badge`, `tooltip`, `progress` | Use CSS variables `--bloom-1..6`; no hardcoded class-only colors. |
| Teacher preset picker | `select`, `tabs`, `card`, `badge` | Show preset metadata/version. |
| Teacher audit | `resizable`, `scroll-area`, `tabs`, `radio-group`, `textarea`, `table` | Master/detail; validate required SFT/DPO fields. |
| Admin tables | `table`, `dialog`, `sheet`, `input`, `select`, `switch`, `alert` | Batch import preview + row errors. |
| Loading/error/empty | `skeleton`, `alert`, `button`, `card` | Must be role-specific and actionable. |

## Required State Matrix

| State | Student | Teacher | Admin |
| --- | --- | --- | --- |
| First use | Start ask/project prompt suggestions | Select preset + explain teaching ask | Setup checklist |
| No data | No projects yet, ask-first CTA | No audit records, explain eligible sources | No users/classes/providers with create/import CTA |
| Loading | Chat/project skeletons, stream indicator | Queue/table/detail skeletons | Table/config skeletons |
| Streaming | Disable duplicate submit, cancel if supported | Disable duplicate submit, preserve preset context | AI actions generally not streaming except config tests |
| Error | Keep student answer/context visible | Keep audit/source context visible | Show exact blocked configuration domain |
| Permission denied | Return to login/help state | Explain class-scope mismatch | Explain admin-only operation |
| Missing provider | Block AI action with admin setup instruction | Block AI action with admin setup instruction | Provider setup page shows missing fields |

## Accessibility Lock

- Use semantic HTML before ARIA.
- Every form control must have a visible label or `aria-label` when visual label is impossible.
- Streaming containers use `aria-live="polite"`; errors use `role="alert"`.
- Dialog/sheet focus must be trapped and restored by the primitive.
- Keyboard-only path must complete login, student ask, teacher audit, and admin provider setup.
- Bloom color is never the only signal; show L number + Chinese label + description.
- Contrast must meet WCAG AA for text and key controls.

## No-Fallback UI Rule

Forbidden:

- Showing demo/mock students, records, providers, presets, or AI responses as if they are real.
- Hardcoding Bloom classification on messages.
- Allowing student/teacher AI chat when provider config is missing.
- Allowing audit/export actions on records not backed by Supabase data.
- Silently using legacy FastAPI/SQLite/Chroma paths.

Correct behavior:

- Empty means empty.
- Missing config means blocked with a clear setup CTA.
- Pending async classification means pending.
- Failed async classification means unclassified plus retry/investigate path.

## Implementation Acceptance Criteria For UI/UX Phase

- [ ] Root/home page is replaced by product-specific role-aware entry, not Next.js scaffold content.
- [ ] `/login` uses the design system, displays auth errors accessibly, and routes by verified role.
- [ ] Student workspace has ask, projects, project detail, and practice/challenge designs with empty/loading/error/streaming states.
- [ ] Teacher workspace has preset-first ask and audit master/detail designs with SFT/DPO validation states.
- [ ] Admin workspace has setup dashboard, users/classes, providers, MCP, presets, and exports designs with no mock-success fallback.
- [ ] `globals.css` owns the design tokens; components consume tokens rather than hardcoded brand colors where possible.
- [ ] `components.json` aliases and shadcn ownership are respected.
- [ ] Core screens are keyboard-navigable and have labels/live regions/error semantics.
