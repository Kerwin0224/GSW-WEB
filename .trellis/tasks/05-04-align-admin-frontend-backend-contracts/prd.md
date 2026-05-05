# Align Admin Frontend and Backend Contracts

## Goal

Make every `/admin` frontend page reflect the actual backend/data/API contract it depends on, and fix mismatches that can make admin UI show impossible states, hide backend failures, or call the wrong action shape.

## What I already know

* User reported that many admin pages do not match backend function/API interfaces and selected “计划后执行”.
* Admin route pages currently exist at:
  * `web/src/app/admin/page.tsx`
  * `web/src/app/admin/classes/page.tsx`
  * `web/src/app/admin/exports/page.tsx`
  * `web/src/app/admin/logs/page.tsx`
  * `web/src/app/admin/mcp/page.tsx`
  * `web/src/app/admin/presets/page.tsx`
  * `web/src/app/admin/providers/page.tsx`
* Data/action functions are concentrated in `web/src/lib/data/admin.ts`:
  * dashboard: `getAdminDashboard()` at lines 155-309
  * classes: `getAdminClasses()` / `createClass()` at lines 311-332
  * providers: `getAdminProviders()` at lines 373-439, `saveModelTierBinding()` at lines 447-483, legacy `saveProviderConfig()` at lines 485-504, V2/action helpers at lines 521-710
  * MCP: `getAdminMcp()` / MCP actions at lines 713-850
  * presets: `getAdminPresets()` at lines 853-859, `savePromptPreset()` at lines 1020-1035
  * exports: `getAdminExports()` at lines 1037-1048; legacy/unreferenced `createExportBatch()` at lines 1050-1067; active export client uses `/api/admin/datasets/export`.
* Active admin API routes currently exist under `web/src/app/api/admin`:
  * dataset export/download: `web/src/app/api/admin/datasets/export/route.ts`, `web/src/app/api/admin/datasets/download/route.ts`
  * provider health/model list: `web/src/app/api/admin/providers/health-check/route.ts`, `web/src/app/api/admin/providers/list-models/route.ts`
  * user import: `web/src/app/api/admin/users/import/route.ts`
* Runtime model gate uses `getModelTier()` / capability status in `web/src/lib/data/common.ts:53-89`, requiring enabled tier, enabled provider, non-failed/non-blocked health, `secret_ref`, and resolvable env/encrypted secret.

## Current mismatch inventory

1. Dashboard readiness can diverge from runtime AI gate.
   * `web/src/lib/data/admin.ts:69-77` treats `healthy` and `unchecked` providers with model IDs as enabled bindings.
   * `web/src/lib/data/common.ts:80-85` blocks missing `secret_ref`, failed/blocked health, and unresolved secret refs.
   * `web/src/app/admin/page.tsx:137-140` presents student/teacher chains as operational readiness.
2. Dashboard returns placeholder count arrays and a `Set` in `AdminCockpit`.
   * `web/src/lib/data/admin.ts:270-276` returns `classes`, `presets`, `mcp` as synthetic arrays and `readyCaps` as a `Set`.
   * `web/src/app/admin/page.tsx:119-133` uses those values for admin metrics; the `Set` is only safe while kept inside a server-only path.
3. Classes page creates classes but does not expose membership assignment or import flow despite claiming member-boundary governance.
   * `web/src/app/admin/classes/page.tsx:25-40` describes membership/import requirements.
   * `web/src/lib/data/admin.ts:311-332` only loads class membership counts and creates a class row.
   * CSV import functions exist at `web/src/lib/data/admin.ts:902-1018` and are used from dashboard import UI, not classes page.
4. Providers page is mostly V2, but legacy provider action remains and can mislead future wiring.
   * Current UI uses `ProviderConfigDialog` and `saveProviderConfigV2()` (`web/src/components/workbench/provider-config-dialog.tsx:11-45`).
   * Legacy `saveProviderConfig(formData)` at `web/src/lib/data/admin.ts:485-504` still encodes old capability-checkbox semantics and silently returns on failure.
   * Tier cards in `web/src/components/workbench/provider-capability-matrix.tsx:94-105` approximate readiness with `secretLastFour` and health, which should be checked against the same contract as runtime tier status.
5. Server actions still silently fail in key admin flows.
   * `createClass()` returns `void` and silently exits on unauthorized, validation, and DB errors (`web/src/lib/data/admin.ts:320-331`).
   * `savePromptPreset()` returns `void` and silently exits on invalid input / DB error (`web/src/lib/data/admin.ts:1020-1035`).
   * `createExportBatch()` returns `void` and silently exits on no records / DB errors (`web/src/lib/data/admin.ts:1050-1067`).
6. Presets page lists all prompt presets, but teacher runtime only consumes published teacher presets.
   * `getAdminPresets()` selects all rows at `web/src/lib/data/admin.ts:853-859`.
   * `savePromptPreset()` hardcodes `target_role: 'teacher'` at `web/src/lib/data/admin.ts:1030`.
   * Page copy says teachers only use published versions (`web/src/app/admin/presets/page.tsx:29-35`), but table does not show target role or clarify runtime eligibility.
7. MCP page assumes array-shaped role data at render time.
   * `web/src/app/admin/mcp/page.tsx:22-33` casts `allowed_roles` to `Role[]`; line 98 calls `.join()` directly.
   * `createMcpServer()` / `updateMcpServer()` sanitize allowed roles in `web/src/lib/data/admin.ts:763-819`, but existing/null/legacy rows could crash rendering.
8. Exports page uses a newer JSON API path, while an older server action remains orphaned.
   * `web/src/app/admin/exports/page.tsx:7-20` expects `{ approved, history }` from `getAdminExports()` for metrics/history.
   * `web/src/app/admin/exports/dataset-export-client.tsx:44-77` posts `{ type, filters, preview }` to `/api/admin/datasets/export`.
   * `web/src/app/api/admin/datasets/export/route.ts:10-21` validates that API body and lines 91-141 return preview/export JSON.
   * `createExportBatch()` at `web/src/lib/data/admin.ts:1050-1067` is unreferenced by current frontend and should be removed or explicitly marked out of the active contract after impact analysis.
9. Logs page renders file-based logs directly while `/api/logs` only accepts client POST events.
   * Page reads from `server-log-store` in `web/src/app/admin/logs/page.tsx:25-29`.
   * API route only implements authenticated POST at `web/src/app/api/logs/route.ts:21-47`.
   * This may be acceptable, but admin page/API naming should not imply a missing GET endpoint unless the UI uses one.

## Requirements

* Use “契约纠错优先” as the MVP boundary: fix mismatches against existing backend/API capabilities without turning this into an admin feature rebuild.
* Audit every `/admin` route page against its actual data/action/API contract.
* Fix admin readiness displays so they use the same readiness semantics as runtime student/teacher AI paths, especially model tier/provider/secret/health gates.
* Replace or remove stale/legacy admin actions that no current frontend should call.
* Convert user-triggered admin mutations to typed action results where the UI needs feedback; do not leave silent failure paths on create/save operations.
* Align page copy, visible fields, and table metrics with real backend eligibility: published teacher presets, actual classes/memberships, model tiers, exportable audit records, MCP allowed roles.
* Preserve admin-only access checks through `requireRole('admin')` or existing route layout/session protection.
* Keep scope focused on contract alignment; do not redesign the entire admin product surface.

## Acceptance Criteria

* [ ] Each admin page has a verified data source/action map documented in the implementation notes or PR summary.
* [ ] `/admin` dashboard readiness agrees with runtime model tier/capability gating for configured providers, missing secrets, failed/blocked health, and unchecked health.
* [ ] Admin create/save/export forms surface validation or database errors instead of appearing successful after a no-op.
* [ ] Provider page has no live dependency on legacy `saveProviderConfig(formData)` semantics, or that legacy function is removed if unused.
* [ ] Presets page clearly distinguishes all admin-visible presets from teacher-runtime-eligible published teacher presets.
* [ ] MCP page cannot crash if `allowed_roles` is null/non-array in existing data.
* [ ] Exports page client request body and response handling match `/api/admin/datasets/export`, download URL handling works, and the stale `createExportBatch()` contract is removed or proven harmless.
* [ ] Classes/import UI accurately reflects what the backend supports now, with membership count/import behavior not overstated.
* [ ] Typecheck and relevant lint/tests pass.
* [ ] Frontend behavior is manually verified in a browser for the admin golden paths.

## Technical Approach

Use a contract-first sweep rather than page-by-page cosmetic patching:

1. Build/confirm an admin contract matrix: page → data loader → mutation/API → returned shape → UI assumptions.
2. Normalize shared backend action result style for admin mutations that are invoked by UI controls.
3. Make dashboard readiness depend on the same model-tier readiness semantics as runtime code, or extract a shared helper if impact analysis permits.
4. Update pages/components to render real backend state and explicit blocked/error states.
5. Remove stale action code only after confirming no references remain.
6. Verify with typecheck, targeted tests if present, and browser walkthrough.

## Implementation Plan

1. Contract matrix and impact checks
   * Confirm route → loader → mutation/API mapping for dashboard, providers, presets, MCP, classes, exports, logs.
   * Run GitNexus impact analysis before editing each target symbol in `web/src/lib/data/admin.ts`, `web/src/lib/data/common.ts`, API route handlers, or component functions.
2. Runtime readiness alignment
   * Reuse or mirror runtime model-tier readiness semantics from `getModelTier()` / `getModelTiers()` for admin dashboard and provider tier cards.
   * Make unchecked, missing secret, unresolved secret, failed, and blocked states visibly distinct.
3. Mutation feedback cleanup
   * Convert active class/preset form actions to return typed results or move them behind client wrappers that can display errors.
   * Remove or quarantine unreferenced legacy actions such as `saveProviderConfig(formData)` and `createExportBatch()` only after impact analysis/reference checks.
4. Page-specific contract corrections
   * Dashboard: replace synthetic/unsafe metrics where they imply real records; remove non-serialized state from public contracts if not needed.
   * Providers: ensure tier cards and provider rows reflect actual backend readiness and action outcomes.
   * Presets: show teacher-runtime eligibility clearly: target role and published status.
   * MCP: normalize `allowed_roles` defensively at the data boundary or render boundary.
   * Classes: make create/import/member copy match existing backend support; do not add full membership assignment UI in this task.
   * Exports: verify `/api/admin/datasets/export` and download contract, and remove stale server-action expectations from UI/data layer.
   * Logs: keep page/API distinction clear; only add API read path if current UI actually needs it.
5. Verification
   * Run `npm run lint` and any relevant type/build/test command from `web/package.json`.
   * Start the dev server and manually walk admin golden paths: dashboard, providers, presets create, classes create, MCP list/edit safety, exports preview/export, logs.
   * Run GitNexus detect-changes before commit if committing later.


**Decision**: Use backend contract alignment as the organizing principle: first verify every admin route’s data/action/API shape, then fix shared data/actions and page UI assumptions together.

**Consequences**: This may touch several admin pages and `web/src/lib/data/admin.ts`, but avoids piecemeal fixes that leave the dashboard and runtime gates inconsistent.

## Out of Scope

* Rebuilding non-admin student/teacher UX.
* Adding new AI provider SDK integrations beyond aligning existing provider/model-tier contracts.
* Building full class membership assignment UI; current task may only make existing class/import behavior truthful and non-misleading.
* Expanding dataset export filtering beyond the fields already supported by `/api/admin/datasets/export`.
* Introducing a new observability backend or metrics table unless required to prevent current admin UI from lying.
* Designing a full role/membership management system beyond making current class/import behavior truthful and usable.

## Technical Notes

* GitNexus query for admin concept returned no process results; continue using file evidence and symbol-level GitNexus impact before editing individual functions/classes/methods.
* Project instruction requires GitNexus impact analysis before editing symbols and detect-changes before committing.
* Next.js guidance in `web/AGENTS.md` says read relevant `node_modules/next/dist/docs/` docs before writing code because this Next version may differ from training data.
