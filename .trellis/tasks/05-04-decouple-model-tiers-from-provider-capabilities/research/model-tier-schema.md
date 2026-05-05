# Research: Model Tier Schema

- **Query**: Research architecture options for decoupling app scenario capabilities from provider/model bindings in `/Users/kerwin/Desktop/classical-chinese-workbench`. Compare `model_tier_bindings`, reusing `provider_capabilities` with tier metadata, config JSON table, and code-only mapping; summarize conventions, repo constraints, migration/RLS risks, and recommend one approach.
- **Scope**: mixed
- **Date**: 2026-05-04

## Findings

### Files Found

| File Path | Description |
|---|---|
| `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/tasks/05-04-decouple-model-tiers-from-provider-capabilities/prd.md` | Current task requirements: two tier keys (`flash`, `advanced`), scenario-to-tier defaults, embedding separate, and current `.limit(1)` nondeterminism. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/lib/data/common.ts` | Server-only provider/model resolution helper currently coupled to scenario capability rows. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/lib/data/admin.ts` | Admin data/actions for provider dashboard, capability readiness summaries, provider CRUD, health, and capability updates. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/app/admin/providers/page.tsx` | Admin provider page normalizes `provider_configs` + `provider_capabilities` for the provider matrix. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/components/workbench/provider-capability-matrix.tsx` | UI source of the eight scenario capability labels and broken-link summary behavior. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/components/workbench/provider-actions.tsx` | Client dialog that assigns capability/model rows per provider. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/app/api/student/chat/route.ts` | Student chat route resolves `student_chat`, `project_classification`, and `bloom_classification` directly from capability bindings. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/app/api/teacher/chat/route.ts` | Teacher chat route resolves `teacher_chat` directly from capability bindings. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/lib/challenge-engine.ts` | Practice generation/evaluation paths resolve `practice_generation` and `practice_evaluation` directly from capability bindings. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/lib/data/retrieval.ts` | Embedding/RAG path resolves `embedding` through the same capability helper; PRD says this remains separate. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/supabase/migrations/202605030001_school_account_login_compat.sql` | Latest compatibility migration defining `provider_capabilities` schema and RLS policies. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/supabase/migrations/202605020001_fullstack_refactor.sql` | Original fullstack migration defining `provider_capability` enum and provider tables. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/supabase/migrations/202605040001_admin_capability_lifecycle.sql` | Provider lifecycle migration adding secret lifecycle/model-list fields to `provider_configs`. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/lib/supabase/database.types.ts` | Hand-maintained TypeScript DB contract for provider capabilities and provider config rows. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/backend/supabase-pgvector-guidelines.md` | Backend contracts for Supabase persistence, secret boundaries, blocked states, provider capability readiness, and migration requirements. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/frontend/admin-workspace.md` | Frontend contracts for provider capability broken-link display and provider secret lifecycle. |

### Code Patterns

#### Current binding model

- `provider_capabilities` is the direct scenario-to-provider/model binding table. The current compat migration defines `provider_id`, enum `capability`, `model_id`, `is_enabled`, `metadata`, and uniqueness on `(provider_id, capability, model_id)` at `web/supabase/migrations/202605030001_school_account_login_compat.sql:135-143`.
- RLS currently allows admins to manage provider capabilities and authenticated app users to read enabled capability rows: `provider_caps_admin_all` and `provider_caps_authenticated_read` at `web/supabase/migrations/202605030001_school_account_login_compat.sql:345-348`.
- The generated/manual DB type makes capabilities a finite union of eight scenario keys at `web/src/lib/supabase/database.types.ts:3-11`, and types `provider_capabilities` at `web/src/lib/supabase/database.types.ts:42-45`.
- `getCapability()` directly queries `provider_capabilities` by scenario capability, filters `is_enabled`, and then uses `.limit(1).maybeSingle()` at `web/src/lib/data/common.ts:25-34`. The PRD explicitly identifies this as nondeterministic when multiple enabled rows exist.
- Readiness is resolved from joined provider state, `secret_ref`, and server secret resolution at `web/src/lib/data/common.ts:37-41`; this logic is reusable for tier bindings because it already performs the required health/secret blocked-state checks.

#### Current consumers

- Student chat asks for three scenario capabilities before calling a model: `student_chat`, `project_classification`, and `bloom_classification` at `web/src/app/api/student/chat/route.ts:71-75`; it persists the selected `model_id` at `web/src/app/api/student/chat/route.ts:102-113`.
- Teacher chat asks for `teacher_chat` directly at `web/src/app/api/teacher/chat/route.ts:37-40` and persists `model_id` at `web/src/app/api/teacher/chat/route.ts:50-60`.
- Challenge generation asks for `practice_generation` at `web/src/lib/challenge-engine.ts:100-115`; challenge evaluation asks for `practice_evaluation` at `web/src/lib/challenge-engine.ts:230-244`.
- RAG/embedding uses `getCapability('embedding')` per grep result in `web/src/lib/data/retrieval.ts:71`; the PRD says embedding should remain separate and not use Flash/Advanced.

#### Current admin UI and actions

- The canonical UI capability list is hard-coded in `ProviderCapabilityMatrix`: `student_chat`, `teacher_chat`, `bloom_classification`, `project_classification`, `practice_generation`, `practice_evaluation`, `audit_assist`, `embedding` at `web/src/components/workbench/provider-capability-matrix.tsx:14-23`.
- Broken capability status is computed by scanning enabled provider rows with non-empty `modelId` and acceptable health at `web/src/components/workbench/provider-capability-matrix.tsx:57-70`.
- `/admin/providers` fetches `provider_configs` with nested `provider_capabilities` at `web/src/lib/data/admin.ts:279-285`, then maps enabled nested rows into `ProviderListItem.capabilities` at `web/src/app/admin/providers/page.tsx:46-63`.
- The capability assignment dialog describes and implements “capability with modelId” association at `web/src/components/workbench/provider-actions.tsx:117-119`, and the update action deletes all rows for a provider then inserts the submitted rows at `web/src/lib/data/admin.ts:453-470`.
- Admin dashboard chain readiness is currently capability-count based, with student chain `['student_chat', 'bloom_classification', 'project_classification']` and teacher chain `['teacher_chat', 'practice_generation', 'practice_evaluation']` at `web/src/lib/data/admin.ts:22-23`.

#### Related specs and constraints

- Task PRD confirms the desired default mapping: Flash = `student_chat`, `bloom_classification`, `project_classification`, `practice_generation`; Advanced = `teacher_chat`, `practice_evaluation`, `audit_assist`; embedding remains separate at `.trellis/tasks/05-04-decouple-model-tiers-from-provider-capabilities/prd.md:24-32`.
- Task PRD calls out possible implementation options: `model_tier_bindings` table, compatibility use of `provider_capabilities.metadata`, new `getModelTier('flash' | 'advanced')`, centralized scenario-to-tier mapping, and tier-first admin page at `.trellis/tasks/05-04-decouple-model-tiers-from-provider-capabilities/prd.md:57-64`.
- Backend spec says Supabase stores auditable, non-plaintext-secret business configuration, while runtime secrets stay server-only; missing provider capability/model/key is a blocked state with no fallback at `.trellis/spec/backend/supabase-pgvector-guidelines.md:302-317`.
- Backend spec still defines provider readiness as capability-specific with all eight capability names at `.trellis/spec/backend/supabase-pgvector-guidelines.md:395-406`; this is now a spec tension with the new PRD’s tier-first decision and likely needs later spec update by the main agent.
- Frontend admin spec currently requires capability broken-link rows and multiple-provider coverage display for `/admin/providers` at `.trellis/spec/frontend/admin-workspace.md:213-268`; this is another spec tension with a tier-first admin surface.

### Architecture Options Compared

| Pattern | Shape | Common conventions | Fit with current repo | Migration/RLS risks | Notes |
|---|---|---|---|---|---|
| New `model_tier_bindings` table | Add `model_tier` enum/check (`flash`, `advanced`) and table rows like `(tier, provider_id, model_id, is_enabled, metadata, updated_at)` with one active row per tier. Keep `provider_capabilities` for compatibility or embedding only. | Normalized relational config for first-class domain concepts; explicit unique constraints; FK to provider row; RLS per table; typed helper returns a stable config row. | Strong fit: PRD asks for two stable tier settings, tier cards, deterministic routing, and provider/model reuse. Current `getCapability()` health/secret checks can be adapted to a tier resolver. Existing provider creation, health, model fetch, secret storage stay unchanged. | Requires new table + DB types + policies + migration/backfill. Need avoid leaking provider config through joins; because current provider configs are admin-only, non-admin tier resolution through browser-side Supabase could hit RLS join limits unless done server-side or via security-definer RPC. Must prevent tier delete/orphan issues when provider is deleted; FK `on delete restrict` or cascade with blocked state consequences must be deliberate. | Best separation: scenario concepts map to tiers in code; tier rows bind to provider/model. Avoids overloading scenario capability semantics and removes `.limit(1)` nondeterminism. |
| Reuse `provider_capabilities.metadata` with tier metadata | Store canonical tier marker in existing rows, e.g. `metadata.tier = 'flash'`; resolve tier by querying capability rows or metadata rows. | Transitional/compatibility pattern when preserving an existing table matters; JSON metadata used for optional attributes. | Low migration surface because table and RLS already exist; can preserve old UI/data temporarily. But it keeps tier binding coupled to scenario capability rows unless a synthetic capability or duplicated metadata convention is introduced. | JSON keys lack strong enum/FK-like guarantees unless extra check constraints/indexes are added. Existing unique key `(provider_id, capability, model_id)` does not express “one active binding per tier.” Current authenticated read policy exposes enabled rows including metadata; adding tier metadata to a table read by all authenticated users may broaden visibility. | Useful as short-term compatibility/backfill, but conceptually confusing: a tier is not a provider capability, and rows remain scenario-shaped. |
| Config JSON table | Add generic config table, e.g. `app_config(key text primary key, value jsonb)` with `key='model_tiers'` storing `{flash:{providerId,modelId},advanced:{...}}`. | Common for low-cardinality app settings and feature flags; simple one-row admin form; flexible shape without migrations for every field. | Moderate fit because only two global settings are needed. It can avoid capability row churn and keeps provider config unchanged. | Weak DB integrity: JSON cannot naturally enforce provider FK/model existence, one binding per tier, or valid tier keys without custom constraints/triggers. RLS must distinguish public/server-readable non-secret config from admin-write config. TypeScript types and validation need runtime parsing. Provider deletion can leave stale JSON references. | Simpler initially but less auditable/relational than the rest of this Supabase schema, which uses typed tables and enums for core product data. |
| Code-only mapping | Keep provider_capabilities as-is for provider/model bindings; hard-code scenario-to-tier and possibly provider/model selection in TypeScript/env. | Common for default policy mapping, not for admin-editable runtime business configuration. | Good only for scenario-to-tier defaults; poor for tier assignments because PRD requires admin cards where providers/models can be chosen from configured providers and fetched models. | No DB migration if provider/model assignment stays env/code-only, but admin UI cannot persist user choices. If still selecting from `provider_capabilities`, nondeterministic `.limit(1)` remains unless deterministic ordering/metadata is added. Secrets must remain server-only. | Appropriate for the static scenario-to-tier map, not sufficient as the whole solution. |

### Recommendation

Recommend **new `model_tier_bindings` table plus code-level scenario-to-tier mapping**, while keeping `embedding` as an explicit separate capability path.

Rationale:

1. The PRD introduces `flash` and `advanced` as first-class product settings, not per-scenario provider capabilities. A first-class table matches that mental model and avoids encoding tier semantics inside `provider_capabilities.metadata`.
2. It directly solves the current nondeterministic `.limit(1).maybeSingle()` route selection in `getCapability()` by making the resolver load exactly one canonical tier row.
3. It preserves existing provider operations: `provider_configs` still stores provider type/base URL/secret ref/model list/health; admin can still health-check and fetch models. The tier table only points a tier at a provider/model.
4. It gives the database a place to enforce invariants: valid tier keys, one active binding per tier, provider FK, non-empty model ID, and predictable delete behavior.
5. It limits compatibility risk: existing `provider_capabilities` can remain for embedding and/or old dashboard compatibility during migration, while app routing moves to `getModelTier()`.

Suggested minimal schema shape for the main agent to evaluate:

```sql
create table public.model_tier_bindings (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('flash', 'advanced')),
  provider_id uuid not null references public.provider_configs(id) on delete restrict,
  model_id text not null check (length(trim(model_id)) > 0),
  is_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tier)
);
```

A stricter variant could use a `model_tier` enum, but a check constraint is easier to extend in Supabase/Postgres migrations if tiers change later. The PRD states arbitrary custom tiers are out of scope, so either is acceptable; the repo already uses enums for stable product concepts, as seen with `provider_capability`, but adding enum values later needs extra migration care.

### Migration / RLS Risks

- **Backfill ambiguity**: existing data may contain multiple enabled providers per capability. The PRD notes `.limit(1)` is currently arbitrary. Backfill from old capability rows to Flash/Advanced cannot be deterministic without an explicit admin choice or deterministic rule. A migration may seed empty disabled rows or pick only when exactly one compatible binding exists per target tier.
- **RLS join behavior**: current `provider_configs` is admin-all only, while `provider_capabilities` has authenticated read for enabled rows. Current server helpers can query joined provider config details, but new tier reads should stay in `server-only` helpers and should not expose raw `secret_ref` to Client Components. If non-admin routes query via regular Supabase user context, policies must permit the server helper to read enough joined provider fields, or the implementation should use a security-definer RPC/service-context pattern that returns only non-secret routing fields plus blocked status.
- **Secret visibility**: `secret_ref` may be encrypted API-key material or an env reference. Specs forbid raw secrets in browser/UI/logs. Tier admin UI should show provider name/model/health and masked provider secret metadata only; model call code may resolve `secret_ref` server-side via `resolveEnvSecret()`.
- **Provider deletion**: `provider_capabilities` currently cascades on provider delete. For `model_tier_bindings`, `on delete restrict` prevents silently removing Flash/Advanced routes; `on delete cascade` is simpler but can create sudden blocked tier states. The admin delete flow should surface affected tiers before deletion if `restrict` is used.
- **Type drift**: `database.types.ts` is hand-maintained in this repo. Any migration adding `model_tier_bindings` also needs the TypeScript DB contract updated, otherwise server actions/helpers cannot type queries consistently.
- **Spec drift**: existing backend/frontend specs still describe provider readiness as capability-based. The new PRD supersedes that for app model routing, but the main agent should update executable specs through the Trellis spec workflow rather than silently letting specs diverge.
- **Admin dashboard chain summaries**: current dashboard chain readiness counts scenario capability bindings. After decoupling, it should summarize Flash/Advanced tier readiness plus affected scenarios; otherwise dashboard may report stale “broken capability” status even when tiers are configured.

### External References

- No external documentation was required for this research. The question is dominated by repository schema, RLS, and product constraints rather than framework/library API usage.

### Related Specs

- `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/backend/supabase-pgvector-guidelines.md` — current backend contract for provider capability persistence, secret boundaries, blocked states, and migration application.
- `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/frontend/admin-workspace.md` — current admin capability matrix and secret lifecycle frontend contract.
- `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/tasks/05-04-ui-admin-capability/prd.md` — related UI admin capability work referenced by the task PRD.
- `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/tasks/05-04-configure-poolside-provider-capabilities/prd.md` — related provider capability configuration work referenced by the task PRD.

## Caveats / Not Found

- No existing `model_tier_bindings`, `model_tiers`, or tier resolver module was found in the searched source/spec files.
- The GitNexus exploring skill instructions were loaded, but no GitNexus MCP resource/tool was available in this agent’s tool namespace, so repository exploration used direct file search/read instead.
- The active Trellis task command returned “none”; output was written to the explicit task research path supplied by the user.
- This report does not modify code, migrations, specs, or generated types; it only records architecture research.
