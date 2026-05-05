# Research: Admin Model Tier UX

- **Query**: Research UI/UX approach for the admin provider page in `/Users/kerwin/Desktop/classical-chinese-workbench`. Persist findings to `.trellis/tasks/05-04-decouple-model-tiers-from-provider-capabilities/research/admin-model-tier-ux.md`. Inspect current components and propose how to make two model settings (Flash Model, Advanced Model) beautiful, useful, convenient while preserving provider list actions. Include layout, states, empty/error, role/scenario mapping display, and testing considerations. Do not modify code outside research file.
- **Scope**: internal
- **Date**: 2026-05-04

## Findings

### Files Found

| File Path | Description |
|---|---|
| `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/tasks/05-04-decouple-model-tiers-from-provider-capabilities/prd.md` | Task contract for replacing direct scenario capability bindings with two global model tiers: Flash Model and Advanced Model. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/tasks/05-04-decouple-model-tiers-from-provider-capabilities/research/model-tier-schema.md` | Prior research recommending a first-class `model_tier_bindings` table plus code-level scenario-to-tier mapping. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/app/admin/providers/page.tsx` | Current admin providers page: fetches providers, normalizes provider rows, renders hero, add-provider dialog, and provider matrix/list. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/components/workbench/provider-capability-matrix.tsx` | Current provider matrix/list component: computes broken capability alerts and renders provider row actions. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/components/workbench/provider-actions.tsx` | Client provider row actions: health check, fetch models, capability assignment dialog, edit dialog, delete confirmation, health badge. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/components/workbench/provider-config-dialog.tsx` | Add-provider dialog with single responsibility: create provider only, then use row actions for health/model/capability actions. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/components/workbench/admin-dialog-shell.tsx` | Shared admin dialog wrapper used by provider actions; provides consistent modal shell, header, and footer. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/components/workbench/workspace-hero.tsx` | Existing visual hero and `SectionHeader` primitives for admin/provider pages. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/components/workbench/state-surfaces.tsx` | Existing empty/error/blocked/loading/success surfaces for consistent page states. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/components/ui/card.tsx` | Card primitive with current project styling, heading font, grouped content/header/footer slots. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/lib/data/admin.ts` | Admin server actions/data: `getAdminProviders`, provider CRUD, health/model-list persistence, and capability update action. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/web/src/lib/supabase/database.types.ts` | Current hand-maintained DB type contract for `provider_configs`, `provider_capabilities`, and scenario capability union. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/frontend/admin-workspace.md` | Current executable frontend admin contracts for capability matrix broken-link alerts and provider secret lifecycle. |
| `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/frontend/ui-ux-guidelines.md` | Current UI/UX contracts for admin setup/governance states, secret masking, provider setup, and AI blocked states. |

### Code Patterns

#### Current provider page structure

- `/admin/providers` currently creates a `ProviderListItem[]` from raw Supabase rows at `web/src/app/admin/providers/page.tsx:46-63`. It includes provider identity, base URL, masked secret metadata, enablement, health fields, fetched `apiModels`, and enabled capability rows.
- The page hero is still provider-operation oriented: title `独立动作 · 关注点分离`, description explaining add/test/fetch/configure as independent row actions, and metrics for provider count, capability count, and encryption at `web/src/app/admin/providers/page.tsx:67-75`.
- The main section is titled `Provider 列表` and renders `ProviderCapabilityMatrix providers={providers}` at `web/src/app/admin/providers/page.tsx:78-93`.
- Add-provider is already decoupled from model/capability assignment: `ProviderConfigDialog` is triggered from the section action at `web/src/app/admin/providers/page.tsx:82-90`.

#### Current provider list and capability alert behavior

- `ProviderCapabilityMatrix` returns an `EmptyState` when there are no providers at `web/src/components/workbench/provider-capability-matrix.tsx:47-55`. The text tells admins to add a provider, then independently test, fetch models, and configure capabilities.
- It computes broken capabilities by scanning providers with `provider.isEnabled`, matching capability, non-empty `modelId`, and health `healthy` or `unchecked` at `web/src/components/workbench/provider-capability-matrix.tsx:57-70`.
- The broken-link summary card renders a badge showing either `N 项断链` or `全部已绑定` at `web/src/components/workbench/provider-capability-matrix.tsx:75-83`.
- Broken rows include a destructive badge with readable `BROKEN · 断链`, a localized capability label, raw capability key, and impacted surfaces such as `/student`, `/teacher`, `/teacher/audit` at `web/src/components/workbench/provider-capability-matrix.tsx:85-99`.
- The provider table preserves operations in a compact right-aligned action group: `HealthCheckButton`, `FetchModelsButton`, `CapabilityAssignmentDialog`, `EditProviderDialog`, and `DeleteProviderButton` at `web/src/components/workbench/provider-capability-matrix.tsx:153-160`.

#### Current provider row action behavior to preserve

- `ProviderListItem` includes enough data to render tier assignment choices without exposing secrets: `id`, name/type/base URL, masked secret timestamps, enablement, health, fetched `apiModels`, and capability/model rows at `web/src/components/workbench/provider-actions.tsx:33-48`.
- Health check is a client row action that POSTs to `/api/admin/providers/health-check` and reports success/failure via toast at `web/src/components/workbench/provider-actions.tsx:53-80`.
- Fetch models is a client row action that POSTs to `/api/admin/providers/list-models`, reports discovered count, and relies on the server route/action to persist `api_models` at `web/src/components/workbench/provider-actions.tsx:86-113`.
- The current capability assignment dialog uses a row list where each row chooses a capability and model ID, with fetched models exposed through a native `datalist`; it allows manual model ID entry when models have not been fetched at `web/src/components/workbench/provider-actions.tsx:120-228`.
- Edit provider keeps API Key blank to preserve existing secret and displays created/used/rotated masked lifecycle metadata at `web/src/components/workbench/provider-actions.tsx:304-323`.
- Delete confirmation warns that removing a unique binding can break downstream student/teacher functions at `web/src/components/workbench/provider-actions.tsx:363-380`.
- `HealthBadge` renders health as explicit text plus icon/badge, not color alone, at `web/src/components/workbench/provider-actions.tsx:389-418`.

#### Current design primitives available

- `WorkspaceHero` provides a rounded, visually rich admin page hero with radial gradient accents, metrics, and optional actions/children at `web/src/components/workbench/workspace-hero.tsx:39-69`.
- `SectionHeader` provides section title/description/action alignment for admin subsections at `web/src/components/workbench/workspace-hero.tsx:72-93`.
- `EmptyState`, `BlockedState`, `ErrorState`, `LoadingSurface`, `PermissionState`, and `SuccessState` already exist for consistent state rendering at `web/src/components/workbench/state-surfaces.tsx:16-98`.
- `Card`/`CardHeader`/`CardContent`/`CardFooter` provide the current rounded-card grammar and heading typography at `web/src/components/ui/card.tsx:4-102`.
- Available local UI primitives include `tabs`, `card`, `progress`, `alert`, `switch`, `radio-group`, `dialog`, `badge`, `table`, `button`, `checkbox`, `select`, `input`, `textarea`, and `skeleton` under `web/src/components/ui/`.

#### Task requirements and spec tensions

- The task PRD requires two prominent model setting cards: Flash Model and Advanced Model; each card must show provider, model, health, cost/speed intent, and affected scenarios at `.trellis/tasks/05-04-decouple-model-tiers-from-provider-capabilities/prd.md:30-43`.
- The confirmed default mapping is Flash Model = `student_chat`, `bloom_classification`, `project_classification`, `practice_generation`; Advanced Model = `teacher_chat`, `practice_evaluation`, `audit_assist`; `embedding` remains separate at `.trellis/tasks/05-04-decouple-model-tiers-from-provider-capabilities/prd.md:24-32`.
- The PRD says provider creation, health check, model fetching, edit, and delete workflows must remain at `.trellis/tasks/05-04-decouple-model-tiers-from-provider-capabilities/prd.md:31-36`.
- Prior schema research recommends a new `model_tier_bindings` table plus code-level scenario-to-tier mapping, while keeping embedding separate, at `.trellis/tasks/05-04-decouple-model-tiers-from-provider-capabilities/research/model-tier-schema.md:71-82`.
- Current frontend admin spec still requires capability broken-link rows and provider-row coverage display at `.trellis/spec/frontend/admin-workspace.md:209-268`; this conflicts with the new tier-first PRD and should be treated as spec drift for the main agent to reconcile.
- Current UI/UX spec still says provider configuration is capability-based at `.trellis/spec/frontend/ui-ux-guidelines.md:560-565`, but the new task PRD supersedes that for this task.

### Proposed Admin Model Tier UX

#### Information architecture

Use a tier-first page with three vertical zones:

1. **Hero: model routing console**
   - Keep `WorkspaceHero`, but shift copy from provider operations to two global model decisions.
   - Suggested hero metrics:
     - `Flash Model`: `ready` / `blocked` / `missing`
     - `Advanced Model`: `ready` / `blocked` / `missing`
     - `Provider`: count of registered providers, preserving current operational context
   - Keep one primary action: `添加 Provider`, because provider creation remains prerequisite for tier assignment.

2. **Primary section: two model setting cards**
   - Render two large cards side by side on desktop and stacked on mobile.
   - Cards should be more prominent than the provider list because the new mental model is “choose two app-wide models,” not “bind every scenario.”
   - Recommended card titles:
     - `Flash Model` with subtitle `快速、低成本、高吞吐`
     - `Advanced Model` with subtitle `更强推理、更高质量`
   - Each card should show:
     - current status badge: `已配置`, `未配置`, `Provider 失败`, `未测速`, `模型未拉取`
     - selected provider name and provider type
     - selected model ID in a monospace chip
     - provider health via existing `HealthBadge`-like visual language
     - masked secret last four only, if needed for confidence
     - affected scenario chips
     - primary action: `选择模型` or `更换模型`
     - secondary helper action if provider exists but no models: `先拉取模型`
   - Visual distinction can use existing design tokens without new primitives:
     - Flash card: primary/blue accent ring or radial wash; icon such as lightning/zap if using lucide icons.
     - Advanced card: accent/gold or deeper foreground treatment; icon such as brain/sparkles if using lucide icons.
     - Both must still use readable text status; do not encode tier readiness by color alone.

3. **Secondary section: scenario mapping display**
   - Replace the current broken capability summary as the main decision surface with a static/derived scenario map.
   - Show rows or grouped chips for `Role / Scenario / Tier / Status / Impact`.
   - Suggested groups:
     - Student: `student_chat`, `bloom_classification`, `project_classification`, `practice_generation` -> Flash Model.
     - Teacher: `teacher_chat`, `practice_evaluation`, `audit_assist` -> Advanced Model.
     - System/RAG: `embedding` -> separate provider capability, not Flash/Advanced.
   - The display should make clear that scenarios no longer require separate model binding. Example row meaning: “学生对话 uses Flash Model, so changing Flash changes this route.”
   - Include a short immutable-label treatment for the mapping if it is code-defined in MVP: `系统默认映射`, `不可在此页单独覆盖`.

4. **Operational section: Provider list actions**
   - Preserve the provider table below tier cards.
   - Keep row actions: health check, fetch models, edit, delete.
   - Replace or demote the current `CapabilityAssignmentDialog` action for app scenarios once tier bindings exist. Options:
     - Preferred: row action becomes `用于模型层` / `选择为 Flash/Advanced` only if the interaction assigns a tier from that provider.
     - If embedding still uses `provider_capabilities`, keep an `Embedding 配置` action or a small separate embedding row/card rather than the old eight-capability assignment dialog.
   - Provider rows should remain useful for infrastructure governance: base URL, secret mask, health, fetched model count, and tier usage badges such as `Flash`, `Advanced`, `Embedding`.

#### Tier assignment dialog/panel

A convenient tier assignment flow should avoid making admins search through provider rows manually:

- Trigger from each tier card: `选择模型` / `更换模型`.
- Dialog title should include the tier: `配置 Flash Model` or `配置 Advanced Model`.
- Dialog body should have two dependent fields:
  1. Provider select: only configured providers, with status text like `健康 · 213ms`, `未测速`, or `失败`.
  2. Model select/input: fetched `apiModels` for selected provider, with manual input fallback.
- If selected provider has no fetched models, show an inline `Alert` explaining: “可先点击 Provider 列表中的拉取模型，或手动输入真实模型 ID。”
- Show affected scenario chips inside the dialog so the admin understands blast radius before saving.
- Save button should be disabled until provider and non-empty model ID are present.
- The dialog should use `AdminDialogShell` for consistency with provider CRUD/actions.

#### Empty states

Use existing state surfaces, but split empty-state messaging by missing prerequisite:

| Condition | UX |
|---|---|
| No providers | Page can still render tier cards in `未配置` state; below them render `EmptyState` with CTA `添加 Provider`. Explain both Flash and Advanced are blocked until a provider exists. |
| Providers exist, no tier bindings | Tier cards show `未配置`; each card CTA opens assignment dialog. Scenario map rows show `blocked: tier not configured`. Provider list remains visible for health/model operations. |
| Provider exists but no fetched models | Tier assignment dialog allows manual model ID; card/dialog should show helper text to fetch models for convenience, not block manual entry. |
| Only Flash configured | Flash card `已配置`; Advanced card `未配置`; scenario map shows student/fast routes ready and teacher/evaluation/audit routes blocked. |
| Only Advanced configured | Advanced card `已配置`; Flash card `未配置`; scenario map shows teacher/evaluation/audit ready and student/classification/practice-generation routes blocked. |
| Embedding not configured | Do not mark Flash/Advanced broken. Show a separate embedding row/card warning for RAG/project retrieval routes. |

#### Error and blocked states

- Preserve top-level `ErrorState` for `getAdminProviders()` failure; if tier bindings are fetched separately, combine errors into a page-level error only when provider/tier data cannot be trusted.
- A tier should be `blocked` when its binding exists but selected provider is disabled, provider health is `failed`/`blocked`, provider lacks a usable secret, or model ID is empty.
- A tier should be `unchecked` rather than failed when provider health is `unchecked`. Current broken-capability logic treats `healthy` and `unchecked` as acceptable at `provider-capability-matrix.tsx:64-65`; the tier UI can preserve this operational leniency but should label it clearly as `未测速`.
- If saving a tier assignment fails, keep the dialog open and render an inline destructive `Alert`, matching provider action dialogs at `provider-actions.tsx:220-225` and provider config dialog at `provider-config-dialog.tsx:98-103`.
- If deleting a provider that is used by Flash or Advanced, the delete confirmation should name affected tiers and scenarios. Current delete copy only warns about downstream ability chains generically at `provider-actions.tsx:363-380`; tier UX should make the affected tier explicit.

#### Role/scenario mapping display

A compact mapping table is the most useful display because it can replace the old mental model without hiding operational impact.

Suggested columns:

| Role / Surface | Scenario | Uses | Status | Notes |
|---|---|---|---|---|
| Student `/student` | 学生对话 `student_chat` | Flash Model | Ready/Blocked | Fast conversational feedback. |
| Student `/student` | 布鲁姆分类 `bloom_classification` | Flash Model | Ready/Blocked | High-throughput annotation. |
| Student `/student/projects` | 篇目识别 `project_classification` | Flash Model | Ready/Blocked | Fast project setup/classification. |
| Student `/student/challenge` / Teacher `/teacher` | 挑战出题 `practice_generation` | Flash Model | Ready/Blocked | Cheap generation loop. |
| Teacher `/teacher` | 教师对话 `teacher_chat` | Advanced Model | Ready/Blocked | Quality/reasoning interaction. |
| Student challenge evaluation | 挑战评判 `practice_evaluation` | Advanced Model | Ready/Blocked | Stronger judgement path. |
| Teacher `/teacher/audit` | 审计辅助 `audit_assist` | Advanced Model | Ready/Blocked | Quality/audit support. |
| Student projects/RAG | 向量嵌入 `embedding` | Embedding provider | Ready/Blocked | Separate from Flash/Advanced. |

Implementation notes for the main agent:

- Derive scenario row status from the tier status rather than querying each scenario binding separately.
- Use badges with both readable text and variants: `Flash`, `Advanced`, `Embedding`, `可用`, `阻塞`, `未配置`, `未测速`.
- Keep raw scenario keys in monospace secondary text for admin/debug usefulness.
- Add a sentence above the mapping: “场景映射由系统定义；管理员只需维护两个模型层。”

#### Preserving provider list actions

The provider list should remain below the tier cards and scenario map, but its purpose changes from app-routing configuration to provider operations.

Keep:

- Add provider via `ProviderConfigDialog`.
- Health check via `HealthCheckButton`.
- Fetch/list models via `FetchModelsButton`.
- Edit provider via `EditProviderDialog`.
- Delete provider via `DeleteProviderButton`.
- `HealthBadge` status display.
- Fetched model count and masked secret metadata.

Change display emphasis:

- Replace `已配能力` with `用途` or `被使用于`, showing badges such as `Flash`, `Advanced`, and `Embedding`.
- Keep `apiModels.length` visible because it directly supports tier selection convenience.
- Keep base URL and provider type for operational debugging.
- If capability rows remain temporarily for migration, label them as `旧能力绑定` or hide them from the primary UI to avoid contradicting the two-tier product model.

#### Suggested component shape

No code changes are made by this research, but the UI can be organized with existing primitives:

- `AdminProvidersPage`
  - fetch providers and tier bindings together
  - render `WorkspaceHero`
  - render `ModelTierSettingsSection`
    - `ModelTierCard tier="flash" ...`
    - `ModelTierCard tier="advanced" ...`
  - render `ScenarioTierMappingTable`
  - render `ProviderOperationsTable`
- New or adapted client dialog:
  - `ModelTierAssignmentDialog`
  - uses `AdminDialogShell`, `Select`, `Input`, `Alert`, `Badge`, `Button`
- Provider row actions stay in `provider-actions.tsx` unless the main agent creates a tier-specific action module.

### External References

- No external documentation was required. The task is governed by local product PRD, existing components, and project-specific UI/spec contracts rather than third-party API behavior.

### Related Specs

- `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/frontend/admin-workspace.md` — current admin capability matrix, provider lifecycle, and unified dialog contracts; contains capability-first expectations that conflict with the new tier-first task.
- `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/frontend/ui-ux-guidelines.md` — current admin setup/governance and provider blocked-state UI rules; also still says provider configuration is capability-based.
- `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/frontend/type-safety.md` — blocked/missing config should be typed states, not placeholder/fallback data.
- `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/backend/supabase-pgvector-guidelines.md` — provider/secret/backend blocked-state rules; prior schema research notes spec drift because it is still capability-first.

### Testing Considerations

- Component: renders two prominent cards with titles `Flash Model` and `Advanced Model`, including provider/model/health/scenario chips when configured.
- Component: no providers renders tier cards as blocked/missing plus provider empty CTA; provider list actions are not shown as broken controls.
- Component: only Flash configured shows Flash scenarios ready and Advanced scenarios blocked.
- Component: only Advanced configured shows Advanced scenarios ready and Flash scenarios blocked.
- Component: embedding missing appears as separate embedding blocked state, not as a Flash/Advanced failure.
- Component: provider table still exposes health, fetch models, edit, delete, secret mask, and model count.
- Component/accessibility: tier and scenario statuses include readable text (`阻塞`, `未配置`, `可用`) and are not color-only.
- Interaction: tier assignment dialog disables save until provider and model ID are selected/provided.
- Interaction: tier assignment dialog supports provider with no fetched models by allowing manual model ID and showing fetch-model helper text.
- Interaction: failed tier assignment keeps dialog open and renders destructive inline error.
- Server/action: saving a tier revalidates `/admin/providers` and `/admin` just as existing provider/capability actions do.
- Static/security: raw `secret_ref`/API key/cipher text must not be passed into tier Client Components; only masked last-four and lifecycle metadata may appear.
- Regression: existing `HealthCheckButton`, `FetchModelsButton`, `EditProviderDialog`, and `DeleteProviderButton` remain reachable from the provider operations table.

## Caveats / Not Found

- No existing `model_tier_bindings`, `model_tiers`, Flash/Advanced resolver, or tier assignment UI was found in `web/src`; tier terms were only found in the task PRD and prior research file.
- The active Trellis task command returned `Current task: (none)` in this agent environment; output was written to the explicit task path provided by the user.
- The worktree at `/Users/kerwin/Desktop/classical-chinese-workbench/.claude/worktrees/agent-a95a558296caa724f` did not contain the requested task directory and showed an older provider page. The requested task and newer admin provider files exist in `/Users/kerwin/Desktop/classical-chinese-workbench`, so this report is based on that explicit project root.
- Current frontend specs are capability-first and conflict with the task PRD’s tier-first direction; main agent should update executable specs through Trellis workflow if implementing this UX.
- This report does not modify code, migrations, specs, or generated types; it only writes the requested research file.
