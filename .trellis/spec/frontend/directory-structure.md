# Directory Structure

> Frontend organization for the Next.js + Supabase + Vercel AI SDK refactor.

---

## Scenario: `frontend-new` App Router Ownership

### 1. Scope / Trigger

- Trigger: adding, moving, or refactoring frontend files for the new MVP.
- Applies to `frontend-new/**` as the target refactor surface.
- Legacy `frontend/**` may remain during transition, but new MVP UI/API work must target `frontend-new/**` unless explicitly scoped otherwise.

### 2. Signatures

Target structure:

```text
frontend-new/
  src/
    app/
      layout.tsx
      globals.css
      page.tsx
      login/page.tsx
      auth/callback/route.ts
      student/**
      teacher/**
      admin/**
      api/**/route.ts
    components/
      ui/**
      workbench/**
      app-shell.tsx
      app-sidebar.tsx
    hooks/**
    lib/
      auth.ts
      supabase/browser.ts
      supabase/server.ts
      utils.ts
      ai/**              future server-only AI helpers
      data/**            future Supabase data access helpers
    types/**             future shared UI/domain types when reused
```

Route handler signature:

```text
frontend-new/src/app/api/<domain>/<action>/route.ts
```

### 3. Contracts

- Use App Router route directories for user-facing pages.
- Keep role workspaces under role URL roots: `/student`, `/teacher`, `/admin`.
- Keep copied shadcn primitives under `components/ui`; domain components under `components/workbench` or future feature folders.
- Supabase browser/server clients live under `lib/supabase` and must not be duplicated in pages.
- Server-only AI/provider/retrieval logic belongs under `lib/ai/**` or route handlers, not Client Components.
- Do not import legacy `frontend/lib/api.ts` or FastAPI clients into `frontend-new`.
- Do not add broad `utils.ts` dumping grounds beyond simple generic utilities; create focused modules when behavior has a domain.

### 4. Validation & Error Matrix

| Condition | Required location | Assertion |
| --- | --- | --- |
| New protected page | `src/app/<role>/**/page.tsx` | role route visible |
| New API route | `src/app/api/**/route.ts` | App Router route handler |
| Browser Supabase use | `lib/supabase/browser.ts` factory | public key only |
| Server Supabase use | `lib/supabase/server.ts` or server helper | cookie-aware, request-scoped |
| AI streaming route | `src/app/api/**/route.ts` + `lib/ai/**` helpers | no client secrets |
| shadcn primitive | `components/ui/**` | generic primitive only |
| Domain UI | `components/workbench/**` or feature folder | product semantics allowed |

### 5. Good/Base/Bad Cases

- Good: `frontend-new/src/app/student/projects/[projectId]/page.tsx` renders project detail from server-loaded data.
- Good: `frontend-new/src/lib/ai/student-chat.ts` contains server-only model composition used by `/api/student/chat`.
- Base: one route-local component in a page file before reuse is proven.
- Bad: new MVP page calls `NEXT_PUBLIC_API_BASE_URL` FastAPI endpoint.
- Bad: provider secrets stored in a Client Component.

### 6. Tests Required

- Static grep/check: `frontend-new` must not depend on legacy FastAPI client paths for new MVP surfaces.
- Typecheck confirms aliases from `components.json` resolve.

### 7. Wrong vs Correct

#### Wrong

```ts
// frontend-new/src/app/student/page.tsx
fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/student/chat`)
```

#### Correct

```ts
// frontend-new/src/app/student/page.tsx client component
new DefaultChatTransport({ api: '/api/student/chat' })
```
