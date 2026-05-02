# UI/UX-First Refactor Design Lock

This task is active for the full Next.js + Tailwind CSS + shadcn/ui + Vercel AI SDK + Supabase refactor, but implementation must start with a complete UI/UX design lock.

## User Directive

- Use Next.js + Tailwind CSS + shadcn/ui + Vercel AI SDK + Supabase.
- Use Tavily to research best practices.
- Use Context7 to verify library APIs and patterns.
- Reason from first principles.
- Thoroughly refactor and clean up.
- No fallback paths, no mock success, no legacy dependency for new surfaces.
- Finish the detailed UI/UX design before application implementation.

## Current Repo Reality

Target app root is `frontend-new/`, not the older `frontend/` surface.

Observed target files:

- App Router: `frontend-new/src/app/**`
- shadcn config: `frontend-new/components.json`
- Global theme: `frontend-new/src/app/globals.css`
- Shared shell: `frontend-new/src/components/app-shell.tsx`, `frontend-new/src/components/app-sidebar.tsx`
- Workbench components: `frontend-new/src/components/workbench/bloom-badge.tsx`, `frontend-new/src/components/workbench/bloom-ladder.tsx`, `frontend-new/src/components/workbench/role-badge.tsx`
- Supabase helpers: `frontend-new/src/lib/supabase/browser.ts`, `frontend-new/src/lib/supabase/server.ts`

Target package versions observed in `frontend-new/package.json`:

- Next.js `16.2.4`
- React `19.2.4`
- Tailwind CSS `^4`
- shadcn CLI `^4.6.0`
- `ai` `^6.0.174`
- `@ai-sdk/react` `^3.0.176`
- `@supabase/ssr` `^0.10.2`
- `@supabase/supabase-js` `^2.105.1`

## Research Artifacts

- `ui-ux-design.md` — final UI/UX design lock for implementation.
- `research/context7-api-verification-2026-05-02.md`
- `research/next-ai-supabase-rag-best-practices.md`
- `research/ui-design-spec-shadcn.md`
- `research/ui-ux-best-practices-2026-05-02.md`

## First-Principles Product Model

```text
role -> workspace -> task -> educational artifact -> audit/export/learning evidence
```

The interface must not be a generic chat skin. AI appears inside role-specific work:

- Student: asks and practices inside poem/text projects, sees Bloom progression as guidance.
- Teacher: uses prompt presets for teaching support and audits real interaction records.
- Admin: configures users/classes/providers/MCP/presets/exports so the system is safe to operate.

## Information Architecture Lock

```text
Public/auth
  /                 product entry or redirect
  /login            role-aware school account login
  /auth/callback    Supabase auth callback

Student
  /student                      ask workspace
  /student/projects             project grid/list
  /student/projects/[projectId] project detail: conversation, Bloom ladder, practice records
  /student/challenge            challenge/practice entry; may later move under project detail
  /student/me                   learning profile

Teacher
  /teacher                      preset-first teaching ask
  /teacher/audit                audit queue master/detail
  /teacher/audit/[recordId]     deep-link audit detail
  /teacher/analytics            class/student learning and audit summaries

Admin
  /admin                        setup/users dashboard
  /admin/classes                class membership and teacher assignment
  /admin/providers              model provider and capability config
  /admin/mcp                    MCP server capability config
  /admin/presets                global prompt preset governance
  /admin/exports                audited SFT/DPO JSONL exports
```

Implementation may use route groups internally, but user-facing URLs must remain role-obvious.

## Visual Design Lock: 墨韵学堂

The design system should keep the already-established Chinese classical-learning visual direction:

- Background: rice paper / warm neutral (`--background`).
- Primary: Dai blue (`--primary`).
- Destructive/emphasis: cinnabar (`--destructive`).
- Achievement/accent: zijin/gold (`--accent`).
- Headings: WenKai-style Chinese serif fallback via `--font-heading`.
- Body: Source Han/Noto Sans Chinese fallback via `--font-sans`.
- Border radius: 12px base.
- Bloom levels use `--bloom-1` through `--bloom-6` and always show label + number, never color alone.

## Page-Level UX Requirements

### Login

- Centered school-account login card.
- Explains that accounts are school-managed.
- Uses accessible labels and `role="alert"` error region.
- Routes only after verified role/profile resolution.
- If profile/role is missing, show setup error; do not guess role.

### Student Ask

- Empty state: prompt suggestions for classical poetry/classical Chinese learning.
- Chat composer: textarea, send button, keyboard behavior, duplicate submit guard.
- Message renderer: render `message.parts`; support text, citation/retrieval, Bloom/project status, unknown safe ignore.
- Streaming: visible indicator, `aria-live="polite"`, keep layout stable.
- Bloom: pending/failed/success states; no hardcoded fake badge.

### Student Projects + Project Detail

- Project grid cards: title, author/source, question count, last activity, highest Bloom level, practice status.
- Project detail: Bloom ladder, question history, practice records, next practice CTA.
- Empty project state: explain how asking creates projects.
- Bloom ladder: six levels, tooltip/detail for question nodes, accessible labels.

### Student Practice/Challenge

- Select project before challenge when not already inside a project.
- Show target Bloom level and student-friendly explanation.
- Preserve answer on failed evaluation.
- Feedback must be constructive and offer retry or next-step practice.

### Teacher Ask

- Preset selector appears before chat.
- Preset metadata shown: scenario, version, variables, owner/publication status.
- Chat uses same AI SDK parts renderer but teacher-specific actions: save, copy, convert to material where supported.
- Missing preset/provider shows actionable blocked state.

### Teacher Audit

- Audit queue with filters: class, student, source, status, candidate type, Bloom level, date.
- Master/detail layout: list + source conversation + annotation tabs.
- SFT form required fields: source record, corrected answer or approval, quality status, rationale when changed.
- DPO form required fields: prompt, chosen answer, rejected answer, preference rationale.
- Submit validates fields and displays row/form errors; no silent approval.

### Admin

- Admin home is a setup/status console, not a generic dashboard.
- Users/classes: tables plus create/import dialogs and row-level import validation.
- Providers: capability matrix for student chat, teacher chat, classification, practice, embeddings.
- MCP: capability availability by role/action, disabled-by-default unless configured.
- Presets: draft/published/disabled lifecycle.
- Exports: audited SFT/DPO only; no export for unaudited/mock records.

## State Contract

Every primary page must include explicit designs for:

- Empty
- Loading/skeleton
- Streaming when AI is involved
- Error
- Permission denied
- Missing configuration
- Validation failure
- Success/committed state

## No-Fallback Design Contract

Forbidden:

- Legacy FastAPI/SQLite/Chroma dependency for new UI flows.
- Mock provider/model/chat responses.
- Demo students/classes/records displayed as real data.
- Hardcoded Bloom labels on live messages.
- Guessing role from user input without verified profile.
- Exporting or auditing records that do not exist in Supabase.

Required:

- Clear blocked states when real configuration/data is absent.
- Real Supabase-backed data for operational pages.
- Real AI SDK provider configuration for AI actions.
- Explicit pending/failed states for async classifications.

## Implementation Sequence After UI/UX Lock

1. Replace scaffold/home and normalize role shell using product-specific layout.
2. Build shared UI primitives and state components: empty, error, loading, blocked, AI message renderer, Bloom UI.
3. Implement role pages against real contracts, starting with auth/setup and then student/teacher/admin core flows.
4. Wire Vercel AI SDK routes and Supabase only after UI contracts are stable.
5. Run trellis-check, lint, typecheck, and spec compliance.
