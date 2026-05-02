# API Reference

The product API surface now lives inside `web/src/app/api/**/route.ts` as Next.js App Router route handlers.

There is no separate FastAPI product server.

## Current Route Handlers

| Route | Purpose |
| --- | --- |
| `POST /api/auth/login` | School-account login and role-aware session setup |
| `POST /api/student/chat` | Student AI ask flow for the current product surface |
| `POST /api/teacher/chat` | Teacher AI ask flow for teaching support |
| `GET /auth/callback` | Supabase auth callback route |

## Auth Contract

- Login is school-account-only.
- Email-login discovery is not supported.
- Legacy JWT/cookie fallbacks are not supported.
- Role routing must use verified Supabase/profile data.

## Implementation Contract

- Add new server endpoints as App Router route handlers under `web/src/app/api/**/route.ts`.
- Put shared server-only behavior under `web/src/lib/**`.
- Keep provider/service-role keys server-only.
- Use Supabase migrations and generated types for schema-backed changes.
