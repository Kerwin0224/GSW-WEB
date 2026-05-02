# Open Source Reuse Module Mapping v1

Status: reference note
Scope: `web/` only

## Decision

Do not fork a full open-source product shell as the main product. The current app keeps a school-facing four-module spine and borrows only small patterns where they improve the product.

Current product surface:

- App: `web/`
- Runtime: Next.js App Router route handlers + Supabase
- Modules: login, student, teacher, admin

## Reuse Principles

Allowed:

- Small component/layout inspiration.
- Interaction patterns for learning workspaces, audit review, provider configuration, and data export.
- Server-only integration patterns that fit Next.js route handlers and Supabase.

Not allowed:

- Reintroducing a deleted split frontend/API runtime.
- Replacing the school workbench with a generic AI chat shell.
- Adding hidden fallback providers or fake operational data.
- Bringing back SQLite/Chroma/FastAPI as active product dependencies.

## Module Mapping

### Student

Target files live under:

- `web/src/app/student/**`
- `web/src/components/workbench/**`
- `web/src/lib/data/student.ts`

Useful references:

- Learning workspace layouts.
- Resource/question/project sidebars.
- Citation and practice result cards.

### Teacher

Target files live under:

- `web/src/app/teacher/**`
- `web/src/lib/data/teacher.ts`
- `web/src/lib/data/teacher-actions.ts`

Useful references:

- Review queues.
- Audit detail workflows.
- Corrected/preferred answer capture for SFT/DPO.

### Admin

Target files live under:

- `web/src/app/admin/**`
- `web/src/lib/data/admin.ts`

Useful references:

- Provider health/configuration views.
- Capability/MCP control panels.
- Dataset export tables.

## Candidate Reference Projects

- DeepStudent: learning workspace ideas.
- AnythingLLM: resource sidebars and workspace feel.
- Open WebUI: provider/tool capability controls.
- Moodle / Open edX / TAO: education review and assessment patterns.
- Langfuse / Label Studio / Argilla: trace, audit, and dataset review patterns.

Borrow patterns only after adapting them to the school-account, role-scoped, Supabase-backed product contract.
