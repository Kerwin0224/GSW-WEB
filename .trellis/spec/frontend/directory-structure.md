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

---

## Scenario: Next.js Proxy Auth Boundary

### 1. Scope / Trigger

- Trigger: adding or changing `frontend-new/src/proxy.ts`, protected route auth, root redirects, or public route allowlists.
- Applies to Next.js 16 `proxy.ts` in `frontend-new`; use the local Next docs before editing because proxy replaced middleware in this version.

### 2. Signatures

Proxy file and config signature:

```ts
// frontend-new/src/proxy.ts
export default async function proxy(request: NextRequest) {
  // auth and redirect logic
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'],
};
```

Public route allowlist:

```ts
const publicPaths = ['/login', '/auth/callback', '/api/auth'];
```

### 3. Contracts

- The exported matcher object must be named `config`; names such as `proxyConfig` are ignored by Next.js and make proxy run on static assets.
- The matcher must exclude `api`, `_next/static`, `_next/image`, favicon, metadata files, and file-extension assets.
- Public auth surfaces include `/login`, `/auth/callback`, and `/api/auth/**`.
- Protected pages without `cwb_token` redirect to `/login`.
- Root redirects must only use known roles (`student`, `teacher`, `admin`). Unknown JWT roles clear the cookie and redirect to a setup/login error; never default to `/student`.
- Server actions and route handlers still perform their own authorization. Proxy is a request boundary, not the only security boundary.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| `/_next/static/**` CSS/JS asset requested | `200` with `text/css` or `application/javascript`; no redirect |
| Login page requested | `200` without auth token |
| `/auth/callback` requested | allowed through proxy |
| Protected role page without token | `307` to `/login` |
| Root path with known role token | redirect to that role home |
| Root path with unknown role token | delete `cwb_token`; redirect to `/login?error=role_required` |
| Matcher export name is wrong | blocking bug: static assets may redirect to login HTML and browser reports `Unexpected token '<'` |

### 5. Good/Base/Bad Cases

- Good: curl a login page asset and confirm `Content-Type: text/css` or `Content-Type: application/javascript`.
- Base: protected page redirects when no token exists.
- Bad: proxy returns `/login` HTML for `/_next/static/chunks/*.js`; the UI appears unstyled or broken despite correct page code.

### 6. Tests Required

- Required after proxy edits:
  - `curl -fsSI http://127.0.0.1:3000/_next/static/...css` shows `200` and `text/css`.
  - `curl -fsSI http://127.0.0.1:3000/_next/static/...js` shows `200` and `application/javascript`.
  - `curl -sSI http://127.0.0.1:3000/student` without cookies shows `307` to `/login`.
- Run `npm run lint` and `npm run build` after changing proxy or auth boundaries.

### 7. Wrong vs Correct

#### Wrong

```ts
export const proxyConfig = {
  matcher: ['/((?!_next|api|.*\\.|favicon\\.ico).*)'],
};
```

#### Correct

```ts
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'],
};
```
