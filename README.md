# Classical Chinese Workbench

古诗文 AI 工作台 — 面向学校场景的学生、教师、管理员三端协同平台。

## Current Product Entry

`web/` is the only product implementation in this repository.

The previous split implementation (`frontend/` + `backend/`) has been removed. Do not add new product code under those paths and do not reintroduce the old FastAPI/SQLite/Chroma runtime as a fallback. The current product direction is a Next.js App Router application backed by Supabase and server-side AI routes.

## Product Scope

The current build is constrained to four modules:

- **Login**: school-managed account login and role-aware routing.
- **Student**: ask questions and practice within poem/classical-text projects.
- **Teacher**: ask for teaching support and audit records for SFT/DPO data production.
- **Admin**: manage teachers/classes/students, provider/MCP configuration, and audited data export.

Email login, public signup, social login, and legacy token fallbacks are out of scope.

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- Supabase project credentials for the application environment

### 1. Install dependencies

```bash
cd web
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

At minimum, configure the Supabase public URL/key used by the Next.js app:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Server-only AI/provider keys should be configured only in local or deployment secrets. Do not expose provider secrets with `NEXT_PUBLIC_*` names.

### 3. Run the product

```bash
cd web
npm run dev
```

Open `http://127.0.0.1:3000`.

## Validation

```bash
cd web
npm run lint
npm run build
```

Static legacy checks:

```bash
grep -R "find_login_email\|cwb_token\|jose\|NEXT_PUBLIC_API_BASE_URL\|FastAPI\|SQLite\|Chroma" -n web/src
```

Expected result: no runtime dependency on the deleted legacy stack and no email-login fallback path.

## Documentation

| Document | Purpose |
| --- | --- |
| [Product source of truth](docs/PRODUCT_SOURCE_OF_TRUTH.md) | Stable read order for current product planning |
| [PRD decision](docs/prd_decision_v1.md) | Current four-module product boundary |
| [Demo scope](docs/demo_scope_v1.md) | Current demo flows and explicitly deferred scope |
| [Architecture](docs/ARCHITECTURE.md) | `web/` architecture and data flow |
| [Team handoff](docs/TEAM_HANDOFF.md) | Collaboration and cleanup notes |

## Project Structure

```text
classical-chinese-workbench/
├── web/          # Sole Next.js + Supabase product implementation
│   ├── src/app/           # App Router pages and route handlers
│   ├── src/components/    # shadcn/ui and product components
│   ├── src/lib/           # auth, Supabase clients, data helpers
│   └── supabase/          # local Supabase migrations for this app
├── docs/                  # Current product and architecture docs
├── .trellis/              # Workflow, specs, and task context
├── .agents/               # Project-local agent skills
└── models/                # Optional local model placeholders, not product runtime
```

## What NOT to reintroduce

- `frontend/` as a product app.
- `backend/` as a product API runtime.
- Email-login discovery (`find_login_email`) or legacy `cwb_token` cookie flows.
- `jose` JWT fallback auth.
- `NEXT_PUBLIC_API_BASE_URL` clients for a deleted FastAPI service.
- SQLite/Chroma as the active product data layer.

## License

See [LICENSE](LICENSE).
