# Architecture Overview

## Current Architecture

`web/` is the only product implementation. The product is a Next.js App Router application with Supabase-backed identity/data access and server-side AI route handlers.

```text
┌──────────────────────────────────────────────────────────────┐
│ web/                                                │
│ Next.js App Router + React + Tailwind/shadcn                 │
│                                                              │
│ Routes:                                                      │
│   /login                                                     │
│   /student, /student/projects, /student/projects/[projectId] │
│   /teacher, /teacher/audit                                   │
│   /admin, /admin/classes, /admin/providers, /admin/mcp       │
│                                                              │
│ Route handlers:                                              │
│   /api/auth/login                                            │
│   /api/student/chat                                          │
│   /api/teacher/chat                                          │
└───────────────────────────────┬──────────────────────────────┘
                                │ Supabase SSR/browser clients
                                ▼
┌──────────────────────────────────────────────────────────────┐
│ Supabase                                                     │
│ Auth + Postgres + RLS + pgvector migrations                  │
│ School-managed accounts, role profiles, project records,     │
│ audit/export records, provider/admin configuration           │
└───────────────────────────────┬──────────────────────────────┘
                                │ server-only AI credentials
                                ▼
┌──────────────────────────────────────────────────────────────┐
│ AI provider routes                                           │
│ Vercel AI SDK-compatible server route handlers.              │
│ Missing provider configuration fails clearly; there is no     │
│ fake answer or deleted backend fallback.                     │
└──────────────────────────────────────────────────────────────┘
```

## Directory Structure

```text
web/
├── src/
│   ├── app/
│   │   ├── login/page.tsx
│   │   ├── auth/callback/route.ts
│   │   ├── student/**
│   │   ├── teacher/**
│   │   ├── admin/**
│   │   └── api/**/route.ts
│   ├── components/
│   │   ├── ui/**
│   │   └── workbench/**
│   ├── hooks/**
│   └── lib/
│       ├── auth.ts
│       ├── school-login.ts
│       ├── supabase/browser.ts
│       ├── supabase/server.ts
│       └── data/**
└── supabase/migrations/**
```

## Auth Boundary

- Login is school-account-only: 8-digit student ID/staff ID plus password.
- Public signup, social login, email-login discovery, phone-login discovery, and legacy token cookies are not product paths.
- Route protection belongs in the Next.js proxy/auth boundary and in server-side data helpers.
- Role routing must use verified profile role data, not user-entered hints.

## Data Flow

### Login

1. User submits school account credentials at `/login`.
2. `web/src/app/api/auth/login/route.ts` validates `profiles.login_id` plus password through Supabase-backed school-account logic.
3. The app issues a signed app session and routes to the verified role workspace.

### Student Ask / Practice

1. Student works under `/student` and project routes.
2. Server routes/data helpers store project/question/practice records in Supabase tables.
3. AI route handlers use server-only provider configuration.
4. Project history remains poem/text-project based, not a generic chat archive.

### Teacher Ask / Audit

1. Teacher uses `/teacher` for teaching support and `/teacher/audit` for dataset review.
2. Audit preserves source prompt/answer, teacher judgment, corrected/preferred answer, dataset type, status, and metadata.
3. Class/student access remains teacher-scoped unless an admin policy expands it.

### Admin Operations

1. Admin manages teacher/class/student relationships.
2. Admin configures providers and MCP availability.
3. Admin exports audited SFT/DPO data only after required audit status is met.


## Configuration Persistence Boundary

Configuration is split by first principles: shared product facts belong in Supabase; runtime authority and machine-local material belong in environment secrets. The app must fail closed when a required configuration record or secret is missing. It must not silently fall back to mock providers, local files, deleted services, or placeholder AI answers.

### Store in Supabase

Supabase stores auditable, shareable, non-plaintext-secret business configuration and product records:

- Provider configuration metadata: provider type, display name, capability readiness, model IDs, optional base URL, `secret_ref`, `secret_last_four`, health status, and audit timestamps.
- Provider capabilities by role/task: `student_chat`, `teacher_chat`, `bloom_classification`, `project_classification`, `practice_generation`, `practice_evaluation`, `audit_assist`, and `embedding`.
- MCP server metadata: server ID/name, description, declared capabilities/tools, role scope, enabled status, health status, non-secret `connection_ref`, `secret_ref`, `secret_last_four`, and audit fields.
- Prompt presets, class/user/project data, conversations/messages, audit records, and export batches.
- Local-model metadata only when it is shareable business configuration: logical model ID, provider/runtime type, task capability, dimension/context metadata, health state, and optional environment-scoped `secret_ref`. Shared rows must not contain developer-machine absolute paths.

### Store in local/deploy environment or a secret manager

Environment variables and deployment secret stores hold runtime secrets and machine-local values:

- `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Langfuse/xAI provider keys, and other provider credentials.
- Local model binary paths, model cache roots, runtime toggles, and machine-specific accelerator settings.
- Local MCP bridge tokens, command paths, per-host environment variables, proxy settings, and development-only ports.
- Any credential that can authorize a request. Real secret values must never be written to client-visible fields, normal Supabase table columns, docs, examples, or logs.

### Local model rule

Model binaries and absolute paths do not enter git. Environment may hold paths or enablement flags for a specific machine/deployment. Supabase may store model configuration metadata and `secret_ref`, but local absolute paths are allowed only when the row is explicitly environment-scoped and not treated as shared business configuration. If a required model path, model ID, provider capability, or API key is absent, the route returns a blocked configuration error; no fallback model is selected.

### MCP rule

MCP server metadata, capabilities, role scope, enabled state, non-secret connection references, health, and audit trail persist in Supabase. Connection secrets, real endpoints that expose private infrastructure, local commands, bridge tokens, and server-specific environment variables live only in server-side env or a secret manager. Admin UI may show connection refs, masked values, last four characters, and health state; it must never render plaintext secrets.

## Removed Legacy Runtime

The legacy split runtime has been deleted:

- No `frontend/` product app.
- No `backend/` FastAPI product API.
- No active SQLite/Chroma data layer.
- No `NEXT_PUBLIC_API_BASE_URL` fallback client.

If a future feature needs server logic, implement it inside `web/src/app/api/**/route.ts` and shared server-only helpers under `web/src/lib/**`, or represent schema changes as Supabase migrations.
