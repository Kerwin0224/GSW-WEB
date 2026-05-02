# Team Handoff

This repository has been cleaned so `web/` is the only product implementation.

## Keep

- `web/` product code.
- `web/supabase/migrations/` database schema work for the current app.
- `docs/` current product docs.
- `.trellis/` workflow, specs, and task context.
- `.github/` collaboration templates.
- `models/README.md` and placeholder files when they document optional local assets.

## Removed / Do Not Restore

- Legacy `frontend/` product app.
- Legacy `backend/` product API runtime.
- `.omc/` legacy local mission/runtime state.
- Root `PRD` draft that described the old implementation path.
- Email-login discovery, legacy JWT/cookie auth fallback, and deleted FastAPI API clients.

## Recommended Development Loop

```bash
cd web
npm install
npm run lint
npm run build
```

Use Trellis tasks/specs for planning and quality gates. Keep work focused on the current four-module product spine: login, student, teacher, admin.

## Data and Secrets

- Do not commit local `.env*` files except checked-in examples.
- Do not expose service-role or provider secrets to browser bundles.
- Supabase migrations/types must stay in sync when schema changes.
- Runtime data, model binaries, local logs, and generated build output stay out of git.
