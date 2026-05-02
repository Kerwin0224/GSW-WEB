# Contributing Guide

This document covers practical steps for contributing to Classical Chinese Workbench.

## Product Entry

`web/` is the only product implementation. Do not add new product code under deleted legacy paths.

## Prerequisites

- Node.js 20+
- npm
- Supabase project credentials for local development

## Quick Start

```powershell
git clone <repo-url>
cd classical-chinese-workbench
cd web
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://127.0.0.1:3000`.

## Development Workflow

### Branching

- Branch from `main` for each feature or fix.
- Name branches descriptively: `feature/student-practice`, `fix/school-login`.
- Keep one logical change per branch.

### Before You Code

1. Read `docs/PRODUCT_SOURCE_OF_TRUTH.md` for product direction.
2. Read `docs/prd_decision_v1.md` for current product boundaries.
3. Read `docs/demo_scope_v1.md` for current in/out-of-scope flows.
4. Use Trellis task context and specs before implementation.

### Code Conventions

- Use Next.js App Router conventions in `web/src/app/**`.
- Put App Router route handlers under `web/src/app/api/**/route.ts`.
- Put shared server-only/data behavior under `web/src/lib/**`.
- Keep shadcn/ui primitives under `web/src/components/ui/**` and product components under `web/src/components/workbench/**` or focused feature folders.
- Use Supabase migrations/types for schema-backed changes.
- Login remains school-account-only; do not add email-login discovery, public signup, or legacy token fallbacks.

### Validation

Before submitting a PR:

```powershell
cd web
npm run lint
npm run build
```

Run targeted static checks when touching auth or old-stack boundaries:

```powershell
grep -R "find_login_email\|cwb_token\|NEXT_PUBLIC_API_BASE_URL" -n src
```

## Pull Requests

- Fill in the PR template (`.github/PULL_REQUEST_TEMPLATE.md`).
- Include what changed and why.
- List validation steps you ran.
- Update docs if behavior changed.

## What NOT to Commit

The `.gitignore` blocks common local artifacts, but double-check:

- Local `.env*` files except checked-in examples.
- Runtime data and generated exports.
- Local model binaries.
- `*.log` runtime logs.
- `node_modules/`, `.next/`, TypeScript build info.
- Browser profiles, Playwright screenshots, local agent/runtime state.

## Troubleshooting

### App build fails

- Run `npm install` in `web/`.
- Delete `web/.next/` and retry.
- Read the lint/build output first; do not mask build failures with fallback code.

### Auth issues

- Check Supabase URL/key configuration in `web/.env.local`.
- Confirm school account/profile data exists for the tested role.
- Do not work around missing profile data by defaulting to a role route.

## Architecture Overview

See `docs/ARCHITECTURE.md` for system structure and data flow.

## API Reference

See `docs/API_REFERENCE.md` for route-handler documentation.
