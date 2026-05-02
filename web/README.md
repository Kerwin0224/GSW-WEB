# 文韵智途 Web

`web/` is the sole product application for Classical Chinese Workbench.

- Framework: Next.js App Router
- UI: Tailwind CSS + shadcn/ui primitives owned in this repo
- AI: Vercel AI SDK route handlers under `src/app/api/**`
- Data/Auth: Supabase Auth, Postgres, RLS, pgvector migrations under `supabase/`

## Run locally

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://127.0.0.1:3000`.

## Environment boundary

Commit `web/.env.local.example`; never commit `web/.env.local`.

Supabase stores shared, auditable metadata: provider rows, model IDs, `secret_ref`, masked last-four values, MCP capabilities, prompt presets, roles/classes/projects/audit/export data.

Local/deploy env or a secret manager stores runtime authority: `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, MCP bridge tokens/commands/env, proxy settings, and local model paths/binaries.

Missing config is a blocked state. Do not add mock providers, default models, deleted API fallback, or email login.

## Quality gate

```bash
npm run lint
npm run build
```
