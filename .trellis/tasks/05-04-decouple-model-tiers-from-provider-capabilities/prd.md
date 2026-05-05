# Decouple Model Tiers from Provider Capabilities

## Goal

Replace per-scenario direct provider/model binding with two global model tiers: **Flash Model** for cheap, fast, high-throughput productivity work, and **Advanced Model** for stronger reasoning/quality. Providers remain many and configurable, but application scenarios choose one of these two tier settings instead of independently binding provider/model rows.

## Requirements

* Introduce a backend model resolution layer that resolves `flash` or `advanced` to provider + model + secret.
* Add first-class persistent tier bindings instead of overloading scenario capability rows.
* Use the confirmed default scenario mapping:
  * Flash Model: `student_chat`, `bloom_classification`, `project_classification`, `practice_generation`.
  * Advanced Model: `teacher_chat`, `practice_evaluation`, `audit_assist`.
  * Embedding: remains separate and does not use Flash/Advanced.
* Provide a tier-first admin UI with two prominent cards: Flash Model and Advanced Model.
* Let admin choose provider + fetched model for each tier.
* Let scenario rows display which tier they use, not require separate model binding.
* Keep provider creation, health check, model fetching, edit, delete workflows.
* Provider list should become operational infra view: health, model count, base URL, secret lifecycle, and which tiers use it.
* Make page design good-looking, useful, and convenient.
* Preserve secret safety: no API key exposure in browser or DB readbacks.
* Verify teacher chat and at least one Flash-routed flow still work.

## Acceptance Criteria

* [ ] DB has a first-class `model_tier_bindings` contract for `flash` and `advanced`.
* [ ] Admin can see two prominent model setting cards: Flash Model and Advanced Model.
* [ ] Each card shows provider, model, health, cost/speed intent, and affected scenarios.
* [ ] Admin can assign each tier from configured providers and fetched models.
* [ ] Scenario mapping display shows Flash/Advanced/Embedding routing and status.
* [ ] Backend AI routes resolve model by tier instead of direct scenario provider binding.
* [ ] Existing provider health-check and list-models routes still work.
* [ ] Teacher chat works through Advanced Model.
* [ ] Student fast tasks or classification path works through Flash Model.
* [ ] No nondeterministic `.limit(1)` capability selection remains for app model routing.
* [ ] Raw `secret_ref`/API key/cipher text never reaches client components.

## Definition of Done

* DB migration applied safely.
* TypeScript DB contract updated.
* App code updated and lint/typecheck pass.
* Backend route tests/smoke tests pass.
* UI manually tested in browser.
* RLS/secret behavior verified.

## Research References

* [`research/model-tier-schema.md`](research/model-tier-schema.md) — recommends a new `model_tier_bindings` table plus code-level scenario-to-tier mapping.
* [`research/admin-model-tier-ux.md`](research/admin-model-tier-ux.md) — recommends a tier-first admin page with two cards, scenario mapping, and provider operations below.

## Technical Approach

* Add `public.model_tier_bindings` with `tier in ('flash','advanced')`, `provider_id`, `model_id`, `is_enabled`, `metadata`, timestamps, and `unique(tier)`.
* Use `provider_id references provider_configs(id) on delete restrict` to avoid silently breaking Flash/Advanced when deleting a provider.
* Add RLS: admin all; signed app sessions can read enabled tier bindings and enabled provider details needed for server-side model routing.
* Add centralized `model-tiers` module:
  * `type ModelTier = 'flash' | 'advanced'`.
  * `scenarioModelTiers` mapping for existing app capabilities.
  * `getModelTier(tier)` resolver mirroring current provider health/secret checks.
  * Optional `getCapability()` compatibility wrapper maps non-embedding scenarios to tiers; `embedding` stays direct capability path.
* Update app routes:
  * Student chat/classification paths use Flash.
  * Teacher chat uses Advanced.
  * Challenge generation uses Flash.
  * Practice evaluation uses Advanced.
  * Embedding remains current direct capability path.
* Update admin provider data/actions:
  * Fetch providers and tier bindings together.
  * Add save/update tier binding action.
  * Preserve provider CRUD/health/list-models actions.
* Update admin provider UI:
  * Hero reframed as model routing console.
  * Two large tier cards above provider list.
  * Scenario mapping table shows app impact.
  * Provider operations list shows tier usage badges.

## Decision (ADR-lite)

**Context**: Direct capability-to-provider binding creates repeated choices, nondeterministic routing, and high admin UI cognitive load.
**Decision**: Use first-class `model_tier_bindings` plus code-level scenario-to-tier mapping. Keep `embedding` outside Flash/Advanced.
**Consequences**: Simpler admin experience and deterministic routing; requires DB migration, DB type update, RLS review, and UI rewrite of provider capability matrix into tier-first routing console.

## Out of Scope

* Supporting arbitrary custom model tiers in MVP.
* Per-class/per-user model overrides.
* Provider adapters beyond currently supported OpenAI-compatible/gateway paths unless already present.
* Price accounting/token budget UI unless data already exists.
* Full deletion-blocking UX polish beyond naming affected tiers in delete copy.

## Technical Notes

* Current direct resolver: `web/src/lib/data/common.ts` `getCapability()`/`getCapabilities()`.
* Current app consumers: `web/src/app/api/student/chat/route.ts`, `web/src/app/api/teacher/chat/route.ts`, `web/src/lib/challenge-engine.ts`, `web/src/lib/data/retrieval.ts`.
* Current admin UI: `web/src/app/admin/providers/page.tsx`, `web/src/components/workbench/provider-capability-matrix.tsx`, `web/src/components/workbench/provider-actions.tsx`, `web/src/components/workbench/provider-config-dialog.tsx`.
* Existing specs are capability-first and should be treated as spec drift for this task: `.trellis/spec/backend/supabase-pgvector-guidelines.md`, `.trellis/spec/frontend/admin-workspace.md`, `.trellis/spec/frontend/ui-ux-guidelines.md`.
