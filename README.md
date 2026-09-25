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
npx tsc --noEmit
npm run lint
npm test
```

Static legacy checks:

```bash
grep -R "find_login_email\|cwb_token\|jose\|NEXT_PUBLIC_API_BASE_URL\|FastAPI\|SQLite\|Chroma" -n web/src
```

Expected result: no runtime dependency on the deleted legacy stack and no email-login fallback path.

## Documentation

| Document | Purpose |
| --- | --- |
| [Domain context](CONTEXT.md) | Product language and invariants |
| [Design notes](DESIGN.md) | Current interface and product design notes |
| [Deployment workflow](docs/agents/deployment.md) | Cloud Supabase and Vercel workflow |
| [Architecture decisions](docs/adr/) | Accepted product and data-model decisions |

## Project Structure

```text
classical-chinese-workbench/
├── web/          # Sole Next.js + Supabase product implementation
│   ├── src/app/           # App Router pages and route handlers
│   ├── src/components/    # shadcn/ui and product components
│   ├── src/lib/           # auth, Supabase clients, data helpers
│   └── supabase/          # cloud schema migrations for this app
├── docs/                  # deployment, domain, and architecture docs
├── .claude/               # project-local agent skills
└── .scratch/              # issue and verification artifacts
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
