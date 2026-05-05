# Admin Workspace

> Executable frontend contracts for the admin capability cockpit.

---

## Evidence Anchors

- Scope source: `.trellis/tasks/05-04-ui-admin-capability/prd.md`.
- Current UI surface: `web/src/app/admin/**`, `web/src/components/workbench/provider-capability-matrix.tsx`, `web/src/components/workbench/provider-actions.tsx`, `web/src/components/workbench/admin-log-viewer.tsx`, `web/src/components/workbench/setup-checklist.tsx`.
- Current data functions: `getAdminDashboard`, `getAdminProviders`, `getAdminExports`, `getAdminMcp`, `getAdminPresets` in `web/src/lib/data/admin.ts`.
- Installed UI primitives: `dialog.tsx`, `command.tsx`, `table.tsx`, `select.tsx`, `tabs.tsx`, `badge.tsx`, `alert.tsx`, `progress.tsx`, `checkbox.tsx`, `switch.tsx`, `tooltip.tsx`.
- Supabase checked tables: `provider_configs`, `provider_capabilities`, `export_batches`, `profiles`, `classes`, `class_memberships`, `audit_records`, `mcp_servers`, `prompt_presets`, `user_import_batches`, `user_import_rows`.
- Tool caveat: GitNexus repository discovery succeeded for `GSW-WEB`, but symbol/context/cypher calls failed with a WAL corruption error. ABCoder only exposed `GSW-EDU` and did not contain the `web/**` files. Source contracts below are therefore verified by Supabase MCP, Augment retrieval, Context7, Tavily, and read-only file inspection.

Do not implement fake dashboard metrics. If a value cannot be derived from current logs, Supabase tables, or an explicit migration below, render an explicit blocked/schema-gap state.

---

## Scenario: Three-Question Cockpit

### 1. Scope / Trigger

- Trigger: `/admin` home, setup checklist replacement, or any admin first-screen health summary.
- The first viewport must answer: can students learn, can teachers teach, and can an incident be located.
- V1 uses polling/server render only. Do not add WebSocket or realtime subscription requirements.

### 2. Signatures

```ts
type ProviderCapability =
  | 'student_chat'
  | 'teacher_chat'
  | 'bloom_classification'
  | 'project_classification'
  | 'practice_generation'
  | 'practice_evaluation'
  | 'audit_assist'
  | 'embedding';

type ChainName = 'student_ai' | 'teacher_ai';

type CapabilityLinkStatus = {
  capability: ProviderCapability;
  label: string;
  enabledBindings: number;
  status: 'ready' | 'broken';
};

type AdminCockpit = {
  studentChain: {
    name: 'student_ai';
    required: ['student_chat', 'bloom_classification', 'project_classification'];
    status: 'ready' | 'blocked';
    links: CapabilityLinkStatus[];
  };
  teacherChain: {
    name: 'teacher_ai';
    required: ['teacher_chat', 'practice_generation', 'practice_evaluation'];
    status: 'ready' | 'blocked';
    links: CapabilityLinkStatus[];
  };
  health24h: {
    errorCount: number;
    recentExportBatches: Array<{
      id: string;
      exportType: 'sft' | 'dpo';
      status: 'queued' | 'ready' | 'failed';
      recordCount: number;
      createdAt: string;
    }>;
    auditCoverage: {
      total: number;
      approvedOrExported: number;
      exported: number;
      ratio: number;
    };
    providerLatestLatencyMs: Array<{
      providerId: string;
      name: string;
      lastHealthLatencyMs: number | null;
      lastHealthCheckAt: string | null;
    }>;
    tokenUsage24h: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      source: 'messages.token_usage';
    };
  };
};

export async function getAdminCockpit(): Promise<ActionResult<AdminCockpit>>;
```

Capability aggregation SQL:

```sql
with required_capabilities(capability) as (
  values
    ('student_chat'),
    ('teacher_chat'),
    ('bloom_classification'),
    ('project_classification'),
    ('practice_generation'),
    ('practice_evaluation')
)
select
  required_capabilities.capability,
  count(provider_capabilities.id) filter (
    where provider_capabilities.is_enabled = true
      and provider_configs.is_enabled = true
      and provider_configs.health_status in ('healthy', 'unchecked')
      and nullif(provider_capabilities.model_id, '') is not null
  ) as enabled_bindings
from required_capabilities
left join provider_capabilities
  on provider_capabilities.capability::text = required_capabilities.capability
left join provider_configs
  on provider_configs.id = provider_capabilities.provider_id
group by required_capabilities.capability;
```

Health SQL:

```sql
select id, export_type, status, record_count, created_at
from public.export_batches
order by created_at desc
limit 5;

select
  count(*) as total,
  count(*) filter (where status in ('approved', 'exported')) as approved_or_exported,
  count(*) filter (where status = 'exported') as exported
from public.audit_records
where created_at >= now() - interval '30 days';

select id, name, last_health_latency_ms, last_health_check_at
from public.provider_configs
where is_enabled = true
order by last_health_check_at desc nulls last;

select
  coalesce(sum((token_usage->>'prompt_tokens')::int), 0) as prompt_tokens,
  coalesce(sum((token_usage->>'completion_tokens')::int), 0) as completion_tokens,
  coalesce(sum((token_usage->>'total_tokens')::int), 0) as total_tokens
from public.messages
where created_at >= now() - interval '24 hours'
  and token_usage is not null;
```

### 3. Contracts

- Student chain is ready only when `student_chat`, `bloom_classification`, and `project_classification` each have at least one enabled binding.
- Teacher chain is ready only when `teacher_chat`, `practice_generation`, and `practice_evaluation` each have at least one enabled binding.
- The first screen must label the blocked downstream feature, not only the missing setup item.
- Latest provider latency is not P95. True P95 requires a provider-call metric table or structured event series. Until such storage exists, label it as latest health latency.
- 24h error count comes from structured app events with `level = 'error'` and timestamp within 24 hours. If the log reader cannot filter by time, add a server-only log query helper before changing the UI.
- Audit coverage is computed from real `audit_records`; zero total records displays `0/0` with an empty-state explanation, not 100%.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing `student_chat` binding | `student_ai.status = 'blocked'`; show "student chat blocked" action to `/admin/providers` |
| Missing `bloom_classification` binding | student chain blocked; explain Bloom badges/classification are off |
| Missing `project_classification` binding | student chain blocked; explain text/project classification is off |
| Missing `teacher_chat` binding | teacher chain blocked; explain teacher ask is off |
| Missing `practice_generation` or `practice_evaluation` | teacher chain blocked; explain challenge generation/evaluation is off |
| No structured logs | health card shows zero/error-empty state with log setup hint |
| `messages.token_usage` empty | show `0` tokens with source label; do not estimate |
| Supabase query fails | show `ErrorState`; do not render stale hardcoded counts |

### 5. Good/Base/Bad Cases

- Good: first card says `学生 AI 链路已断：缺 bloom_classification`, with a destructive badge and link to provider capabilities.
- Good: health card distinguishes "latest provider health check 420ms" from unsupported P95.
- Base: zero providers, zero exports, zero audit records produce clear blocked/empty states.
- Bad: six setup cards all say missing without naming which student/teacher feature is disabled.

### 6. Tests Required

- Unit: capability aggregation turns every missing required capability into `status: 'broken'`.
- Component: `/admin` renders three cockpit groups before user/class tables.
- Component: zero audit records shows empty coverage, not a complete progress bar.
- Integration: failed Supabase query returns `ErrorState` and no fake metrics.
- Static: no hardcoded provider latency, token count, audit coverage, or export count arrays in admin pages.

### 7. Wrong vs Correct

#### Wrong

```tsx
const setupItems = [
  { label: '模型能力', ready: readyCaps.has('student_chat') && readyCaps.has('teacher_chat') },
];
```

#### Correct

```tsx
const studentChain = summarizeChain(['student_chat', 'bloom_classification', 'project_classification'], capabilityCounts);
const teacherChain = summarizeChain(['teacher_chat', 'practice_generation', 'practice_evaluation'], capabilityCounts);
```

---

## Scenario: Capability Matrix With Broken-Link Alerts

### 1. Scope / Trigger

- Trigger: `/admin/providers`, `ProviderCapabilityMatrix`, provider capability assignment, or model route readiness display.
- The matrix must make capability blind spots visually and semantically obvious.

### 2. Signatures

```ts
type CapabilityMatrixRow = {
  capability: ProviderCapability;
  label: string;
  enabledBindings: Array<{
    providerId: string;
    providerName: string;
    modelId: string;
    providerHealthStatus: 'healthy' | 'failed' | 'blocked' | 'unchecked';
  }>;
  status: 'ready' | 'broken';
  impactedSurfaces: Array<'/student' | '/student/projects' | '/student/challenge' | '/teacher' | '/teacher/audit'>;
};

export async function getProviderCapabilityHealth(): Promise<ActionResult<CapabilityMatrixRow[]>>;
```

Broken-link SQL:

```sql
select
  provider_capabilities.capability::text as capability,
  provider_configs.id as provider_id,
  provider_configs.name as provider_name,
  provider_configs.health_status,
  provider_capabilities.model_id
from public.provider_capabilities
join public.provider_configs on provider_configs.id = provider_capabilities.provider_id
where provider_capabilities.is_enabled = true
  and provider_configs.is_enabled = true
  and nullif(provider_capabilities.model_id, '') is not null;
```

### 3. Contracts

- A capability is broken when the enabled binding count is `0`.
- A failed provider health check does not erase the binding, but it downgrades the row state to blocked for operational use.
- Broken rows use `Badge variant="destructive"` plus text such as `断链`, never color alone.
- `ProviderCapabilityMatrix` may remain provider-row oriented, but it must include a capability-blind-spot summary above or beside the table.
- `audit_assist` and `embedding` are not part of the student/teacher cockpit chains, but they still appear in the full provider capability matrix.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| No providers | empty state links to provider creation dialog |
| Provider exists but no capabilities | every capability row is broken |
| Capability has disabled provider only | broken; disabled providers do not count |
| Capability has empty `model_id` | broken; empty model assignment does not count |
| Provider health is `failed` | row shows assigned model and failed health; downstream surface blocked |
| Multiple providers cover same capability | show count and allow drill into provider rows |

### 5. Good/Base/Bad Cases

- Good: `bloom_classification` row says `断链`, impact `学生 Bloom 标注关闭`, and CTA `配置能力`.
- Good: `student_chat` shows two enabled providers and a healthy/latest-check badge.
- Base: full list of eight capabilities with ready/broken states.
- Bad: provider table shows `已配能力: 未配置` but does not aggregate which global capability is unavailable.

### 6. Tests Required

- Unit: disabled provider does not count toward readiness.
- Unit: `model_id = ''` does not count toward readiness.
- Component: broken capability renders destructive variant plus readable text.
- Component: provider table still exposes per-provider health, model count, secret mask, and actions.
- Accessibility: capability status can be understood without color.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Badge variant="outline">{capability}</Badge>
```

#### Correct

```tsx
<Badge variant={row.status === 'broken' ? 'destructive' : 'default'}>
  {row.status === 'broken' ? '断链' : '可用'} · {row.label}
</Badge>
```

---

## Scenario: Provider Secret Lifecycle

### 1. Scope / Trigger

- Trigger: creating, editing, rotating, displaying, or auditing provider and MCP secrets.
- Applies to `provider_configs` first; the same display principles apply to `mcp_servers`.

### 2. Signatures

Current `provider_configs` fields verified in Supabase:

```ts
type ProviderConfigCurrentColumns = {
  id: string;
  name: string;
  provider_type: string;
  base_url: string;
  secret_ref: string | null;
  secret_last_four: string | null;
  is_enabled: boolean;
  health_status: string;
  api_models: unknown[];
  created_at: string;
  updated_at: string;
  last_health_check_at: string | null;
  last_health_latency_ms: number | null;
};
```

Required lifecycle fields not currently present:

```sql
alter table public.provider_configs
  add column if not exists last_used_at timestamptz,
  add column if not exists rotated_at timestamptz,
  add column if not exists secret_expires_at timestamptz,
  add column if not exists daily_request_limit integer,
  add column if not exists monthly_token_budget integer,
  add column if not exists budget_alert_threshold numeric not null default 0.8;

alter table public.provider_configs
  add constraint provider_configs_budget_alert_threshold_range
  check (budget_alert_threshold > 0 and budget_alert_threshold <= 1);
```

Frontend view model:

```ts
type ProviderSecretLifecycle = {
  providerId: string;
  secretLastFour: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  rotatedAt: string | null;
  secretExpiresAt: string | null;
  rotationStatus: 'fresh' | 'due_soon' | 'overdue' | 'unknown';
  budgetStatus: 'ok' | 'near_limit' | 'over_limit' | 'not_configured';
};
```

### 3. Contracts

- Never render full API keys after submit. Only render `secret_last_four`, creation/update time, rotation status, and usage status.
- `created_at` and `updated_at` already exist and must be displayed before adding new fields.
- `last_used_at`, `rotated_at`, `secret_expires_at`, request limits, and token budgets require the migration above before the UI can claim them.
- On secret replacement, set `rotated_at = now()`, update `secret_ref`, update `secret_last_four`, and keep `created_at` unchanged.
- If lifecycle fields are missing, the UI renders `schema gap: rotation tracking not enabled`, not a guessed date.
- Cost controls are governance fields, not decorative labels. A provider without `daily_request_limit` and `monthly_token_budget` has `budgetStatus = 'not_configured'`.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| `secret_last_four` exists | show masked secret such as `****1234` |
| `secret_ref` exists but no `secret_last_four` | show `saved secret, last four unavailable`; do not reveal cipher |
| `secret_expires_at` within 14 days | warning badge and rotate CTA |
| `secret_expires_at` in the past | destructive badge and downstream capability blocked |
| `last_used_at` null | show "not observed yet" |
| Budget fields missing | show `not configured`; no percent bar |
| Key replacement validation fails | keep dialog open and show field-level error |

### 5. Good/Base/Bad Cases

- Good: provider row shows `****7791`, `created May 4, 2026`, `last health check 420ms`, `rotation due in 12 days`.
- Good: edit dialog password field is empty with placeholder `leave blank to keep current secret`.
- Base: current schema shows created/updated/latest health fields and a schema-gap notice for rotation.
- Bad: using `updated_at` as a fake rotation date when a base URL changed.

### 6. Tests Required

- Unit: rotation status from `secret_expires_at` covers fresh, due soon, overdue, unknown.
- Server action: replacing `apiKey` updates only secret fields plus `updated_at`/`rotated_at`.
- Component: full secret never appears after submit.
- Component: missing lifecycle columns produce a schema-gap state.
- Static: provider secret cipher fields are never passed into Client Component props except masked metadata.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Input value={provider.secretRef} readOnly />
```

#### Correct

```tsx
<SecretLifecycleCell
  lastFour={provider.secretLastFour}
  createdAt={provider.createdAt}
  rotatedAt={provider.rotatedAt}
  expiresAt={provider.secretExpiresAt}
/>
```

---

## Scenario: Unified Dialog Pattern

### 1. Scope / Trigger

- Trigger: Provider, MCP, Prompt Preset, CSV Import, Export, class/user creation, or destructive confirmation flows.
- Admin forms must use one consistent overlay grammar.

### 2. Signatures

Installed local primitives:

```ts
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
```

Project-owned wrapper contract:

```ts
type AdminEntityDialogProps<TInput, TResult> = {
  trigger: React.ReactNode;
  title: string;
  description: string;
  mode: 'create' | 'edit' | 'import' | 'export' | 'assign' | 'confirm';
  initialValue: TInput;
  submitLabel: string;
  onSubmit(input: TInput): Promise<ActionResult<TResult>>;
  renderForm(args: {
    value: TInput;
    setValue(next: TInput): void;
    fieldErrors: Record<string, string>;
  }): React.ReactNode;
};
```

Example usages:

```tsx
<AdminEntityDialog<ProviderConfigInput, { providerId: string }>
  mode="create"
  title="Add Provider"
  description="Create the provider first, then run health check and assign capabilities."
  initialValue={{ name: '', providerType: 'openai-compatible', baseUrl: '', apiKey: '' }}
  submitLabel="Save provider"
  onSubmit={saveProviderConfigV2}
  trigger={<Button>添加 Provider</Button>}
  renderForm={renderProviderForm}
/>

<AdminEntityDialog<UserCsvImportInput, UserCsvImportPreview>
  mode="import"
  title="Import school accounts"
  description="Preview rows and class resolution before creating accounts."
  initialValue={{ importType: 'student', file: null }}
  submitLabel="Preview CSV"
  onSubmit={previewUserCsvImport}
  trigger={<Button>CSV 导入</Button>}
  renderForm={renderCsvImportForm}
/>
```

### 3. Contracts

- Every dialog must include `DialogHeader`, `DialogTitle`, and `DialogDescription`; visually hidden titles are allowed only through `sr-only`.
- Current local `DialogTrigger` uses the project primitive API; follow existing local usage such as `render={<Button>添加 Provider</Button>}` when the primitive requires it.
- Tables use installed `Table` primitives. Do not assume a generated `DataTable` wrapper exists unless the file is added in the same implementation task.
- Use `Command` only for searchable option sets such as model selection or class/user lookup; simple enums use `Select`.
- Destructive actions use an explicit confirmation dialog or alert dialog. Do not use `window.confirm` for new admin workflows.
- Dialog submit actions must expose pending, success, field error, server error, and cancel states.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Dialog missing title | reject implementation |
| Server action pending | submit disabled and spinner/label shown |
| Field invalid | field message plus summary alert when needed |
| Server rejects action | keep dialog open; show returned message |
| CSV preview has invalid rows | show row table; commit disabled |
| Export has zero approved rows | dialog opens read-only explanation or button disabled with tooltip |
| Searchable model/class list exceeds 20 options | use `Command`/combobox pattern |

### 5. Good/Base/Bad Cases

- Good: Provider, MCP, Preset, CSV Import, and Export all share header/body/footer/action placement.
- Good: CSV import dialog has file input, preview table, progress, and row errors before commit.
- Base: simple provider edit dialog with labeled fields and server error alert.
- Bad: provider uses inline row buttons, MCP uses dialog, export uses a separate unrelated list action, and delete uses `confirm()`.

### 6. Tests Required

- Component: every admin dialog has accessible title and description.
- Component: server error keeps dialog open.
- Component: invalid CSV rows disable commit.
- Component: command-based pickers have empty state and keyboard navigation.
- Visual smoke: dialog content fits mobile and desktop widths without clipped labels.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Button onClick={() => saveProvider(form)}>Save</Button>
```

#### Correct

```tsx
<Dialog>
  <DialogTrigger render={<Button>添加 Provider</Button>} />
  <DialogContent>
    <DialogHeader>
      <DialogTitle>添加 Provider</DialogTitle>
      <DialogDescription>保存基础信息后再测速、拉取模型、分配能力。</DialogDescription>
    </DialogHeader>
    <ProviderForm />
    <DialogFooter>
      <SubmitButton pending={pending}>保存 Provider</SubmitButton>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Scenario: Log Explorer

### 1. Scope / Trigger

- Trigger: `/admin/logs`, `AdminLogViewer`, structured app-event reading, or log filtering route handlers.
- V1 is a searchable paginated log explorer over local structured events plus optional dev log tail.

### 2. Signatures

URL contract:

```text
/admin/logs?level=error&trace_id=req_123&user_id=<uuid>&q=provider&page=1&page_size=25
```

Route/data contract:

```ts
type AdminLogLevel = 'debug' | 'info' | 'warn' | 'error';

type AdminLogSearchParams = {
  level?: AdminLogLevel;
  trace_id?: string;
  user_id?: string;
  q?: string;
  area?: string;
  page?: number;
  page_size?: 10 | 25 | 50;
};

type AdminLogRow = {
  timestamp: string;
  level: AdminLogLevel;
  area: string;
  event: string;
  message?: string;
  traceId?: string;
  requestId?: string;
  userId?: string;
  route?: string;
  status?: number;
  durationMs?: number;
};

export async function getAdminLogs(params: AdminLogSearchParams): Promise<ActionResult<{
  rows: AdminLogRow[];
  page: number;
  pageSize: number;
  total: number;
}>>;
```

Next.js route handler shape when an API endpoint is needed:

```ts
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  return NextResponse.json(await getAdminLogs(parseAdminLogSearchParams(searchParams)));
}
```

Wireframe:

```text
[level Select] [trace_id Input] [user_id Input] [Search q Input] [Reset]

Structured events table
time | level | area | event | trace/request | user | route | status | duration

[Previous] Page n [Next]

Dev log tail remains a secondary panel below/aside and is not the primary filter target.
```

### 3. Contracts

- `trace_id` matches `event.traceId` when present, otherwise `event.requestId`.
- `user_id` only filters records that contain a user id. Do not infer user from message text.
- Search `q` matches event name, message, area, route, trace/request id, and user id.
- `page_size` clamps to `10`, `25`, or `50`; default is `25`.
- The URL is the source of truth for filters so refresh/share preserves the explorer state.
- `loading.tsx` shows table skeleton for slow reads; `error.tsx` shows log-load failure and reset action.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Invalid `level` query | ignore level and show all levels |
| Invalid `page` | clamp to `1` |
| No results after filtering | empty state shows active filters and reset |
| Log file missing | empty state explains how logs are produced |
| Structured JSON line malformed | skip line, count parse error in non-blocking warning |
| Dev log unavailable | primary structured event table still renders |
| User not admin | permission denied from data function |

### 5. Good/Base/Bad Cases

- Good: admin pastes a request id into `trace_id` and sees one provider health-check failure.
- Good: `level=error&q=provider` shows matching structured events with route and duration.
- Base: list latest events when no filters are set.
- Bad: six recent cards with no level/user/trace filter.

### 6. Tests Required

- Unit: parser clamps invalid URL params.
- Unit: `trace_id` matches both `traceId` and `requestId`.
- Component: filter controls update URL and rendered rows.
- Component: no-results state lists active filters.
- Route handler: `NextRequest.nextUrl.searchParams` is parsed without using browser-only hooks.

### 7. Wrong vs Correct

#### Wrong

```tsx
readRecentAppEvents(6).map(event => <EventCard event={event} />);
```

#### Correct

```tsx
const params = parseAdminLogSearchParams(searchParams);
const result = await getAdminLogs(params);
return <AdminLogExplorer rows={result.data.rows} filters={params} />;
```

---

## Scenario: User Table v2

### 1. Scope / Trigger

- Trigger: `/admin` user table, `/admin/classes`, account creation, class membership display, or CSV import.
- The admin user table must show school account identity, class relation, role/status, and login/activity recency.

### 2. Signatures

Current public table fields:

```ts
type ProfileCurrentColumns = {
  id: string;
  role: 'admin' | 'teacher' | 'student';
  display_name: string;
  external_code: string | null;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
  login_id: string | null;
  password_hash: string | null;
};

type ClassMembershipCurrentColumns = {
  id: string;
  class_id: string;
  profile_id: string;
  role: 'teacher' | 'student';
  created_at: string;
};
```

View model:

```ts
type AdminUserRow = {
  id: string;
  displayName: string;
  loginId: string | null;
  role: 'admin' | 'teacher' | 'student';
  status: 'active' | 'disabled';
  classes: Array<{ id: string; name: string; grade: string | null; role: 'teacher' | 'student' }>;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
};

export async function getAdminUsers(params: {
  role?: 'admin' | 'teacher' | 'student';
  class_id?: string;
  status?: 'active' | 'disabled';
  q?: string;
}): Promise<ActionResult<AdminUserRow[]>>;
```

Class relation SQL:

```sql
select
  profiles.id,
  profiles.display_name,
  profiles.login_id,
  profiles.role,
  profiles.status,
  profiles.updated_at,
  class_memberships.role as membership_role,
  classes.id as class_id,
  classes.name as class_name,
  classes.grade
from public.profiles
left join public.class_memberships on class_memberships.profile_id = profiles.id
left join public.classes on classes.id = class_memberships.class_id
order by profiles.created_at desc;
```

Login field requirement:

```sql
alter table public.profiles
  add column if not exists last_login_at timestamptz;

alter table public.profiles
  add column if not exists last_activity_at timestamptz;
```

CSV import schema gap for school accounts:

```sql
alter table public.user_import_rows
  add column if not exists login_id text;
```

### 3. Contracts

- Class names come from `class_memberships -> classes`, not duplicated profile fields.
- `lastLoginAt` must come from `profiles.last_login_at`, server-only `auth.users.last_sign_in_at`, or an explicit auth callback update. Do not display `created_at` as login recency.
- `lastActivityAt` may use a real activity aggregate such as max conversation/practice/audit timestamp or `profiles.last_activity_at` after migration. Do not guess from row order.
- Disabled "Add account" and "CSV import" placeholder buttons are not acceptable; use Dialog flows or remove unavailable actions.
- CSV import previews write `user_import_batches` and `user_import_rows`; invalid rows never create users.
- Existing `user_import_rows` has `email`, `display_name`, and `class_name`; school-account imports that require `login_id` need the migration above.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| User has no class membership | show `未分班` with assign action |
| Teacher belongs to multiple classes | show count plus expandable/list display |
| `last_login_at` missing | show schema-gap/not-collected state |
| CSV row missing display name | row-level error |
| CSV row has unknown class | row-level error with class creation/assignment path |
| Duplicate `login_id` | row-level duplicate error; no commit |
| Import batch has failed rows | summary counts created/updated/skipped/failed |

### 5. Good/Base/Bad Cases

- Good: user table columns are name, account, role, status, class, last login, last activity, actions.
- Good: CSV dialog previews `row_number`, `display_name`, `login_id`, `class_name`, status, and errors.
- Base: class column shows `未分班` when there is no relation.
- Bad: user table only shows name/account/role/status and leaves CSV button disabled.

### 6. Tests Required

- Unit: class membership rows group into one `AdminUserRow` per profile.
- Unit: duplicate import login ids produce row errors.
- Component: no-class users render `未分班`.
- Component: last-login missing renders not-collected state, not created date.
- Integration: invalid CSV preview cannot execute commit.

### 7. Wrong vs Correct

#### Wrong

```tsx
<TableCell>{user.created_at}</TableCell>
```

used as "last login".

#### Correct

```tsx
<LastLoginCell value={user.lastLoginAt} missingLabel="登录时间尚未采集" />
```

---

## Scenario: Dataset Preview

### 1. Scope / Trigger

- Trigger: `/admin/exports`, export creation dialog, export history, or dataset sample inspection.
- Admins must inspect the first 100 rows, text distribution, and audit coverage before trusting an export.

### 2. Signatures

Current export fields:

```ts
type ExportBatchCurrentColumns = {
  id: string;
  export_type: 'sft' | 'dpo';
  status: 'queued' | 'ready' | 'failed';
  record_count: number;
  jsonl: string;
  created_by: string | null;
  created_at: string;
};
```

Preview contract:

```ts
type SftJsonlRow = {
  prompt: string;
  completion: string;
  source_record_id: string;
};

type DpoJsonlRow = {
  prompt: string;
  chosen: string;
  rejected: string;
  source_record_id: string;
  rationale?: string;
};

type ExportPreview = {
  batch: {
    id: string;
    exportType: 'sft' | 'dpo';
    status: 'queued' | 'ready' | 'failed';
    recordCount: number;
    createdAt: string;
  };
  sample: Array<SftJsonlRow | DpoJsonlRow>;
  sampleLimit: 100;
  textDistribution: Array<{ title: string; count: number }>;
  coverage: {
    eligibleApprovedCount: number;
    exportedCount: number;
    ratio: number;
  };
};

export async function getExportPreview(exportBatchId: string): Promise<ActionResult<ExportPreview>>;
```

SQL for coverage:

```sql
select
  count(*) filter (where status in ('approved', 'exported')) as eligible_approved_count,
  count(*) filter (where status = 'exported') as exported_count
from public.audit_records
where kind = $1;
```

Distribution source:

```sql
select
  coalesce(
    audit_records.source_metadata->>'title',
    audit_records.metadata->>'title',
    'unknown'
  ) as title,
  count(*) as count
from public.audit_records
where audit_records.id = any($1::uuid[])
group by title
order by count desc, title asc;
```

SFT JSONL example:

```json
{"prompt":"请解释《登鹳雀楼》中“欲穷千里目”的含义。","completion":"这句写出诗人想看得更远，也表达继续向上求索的志向。","source_record_id":"00000000-0000-0000-0000-000000000000"}
```

DPO JSONL example:

```json
{"prompt":"评价学生对《静夜思》的理解。","chosen":"学生能抓住思乡主题，但还需要结合意象说明。","rejected":"回答不错。","source_record_id":"00000000-0000-0000-0000-000000000001","rationale":"chosen gives concrete teaching feedback"}
```

### 3. Contracts

- Preview reads `export_batches.jsonl`, parses at most the first 100 non-empty lines, and validates the row shape against `export_type`.
- `source_record_id` must remain in exported rows so preview can join back to `audit_records` for distribution.
- Text distribution uses real audit metadata. Unknown metadata is grouped as `unknown`; do not invent text titles.
- Coverage uses real audit statuses and export type. A zero denominator renders an empty-state explanation.
- `status = 'failed'` batches show failure state and still allow inspecting any persisted JSONL when present.
- Do not expose raw file paths or server storage internals unless they are already safe public download URLs.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| JSONL empty | sample empty state |
| JSONL line malformed | mark line invalid; do not crash preview |
| SFT row missing `completion` | row validation error |
| DPO row missing `chosen` or `rejected` | row validation error |
| `source_record_id` missing | row validation error and excluded from distribution join |
| No text metadata | distribution row `unknown` |
| Record count exceeds 100 | show first 100 plus total count |

### 5. Good/Base/Bad Cases

- Good: export detail shows first 100 samples, SFT/DPO type badge, distribution by poem/text title, and coverage ratio.
- Good: malformed rows are isolated with line numbers.
- Base: no approved audit records disables export creation with explanation.
- Bad: export page only offers a download link without sample inspection.

### 6. Tests Required

- Unit: JSONL parser returns first 100 valid rows and line errors.
- Unit: SFT and DPO validators reject the wrong row shape.
- Component: preview table renders sample, invalid rows, and empty states.
- Component: distribution shows `unknown` for missing metadata.
- Integration: export creation includes `source_record_id` in every row.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Button href={batch.file_path}>下载</Button>
```

without preview.

#### Correct

```tsx
<ExportPreviewPanel
  sample={preview.sample}
  distribution={preview.textDistribution}
  coverage={preview.coverage}
/>
```

---

## Scenario: User Permissions Page and Class Membership Management

### 1. Scope / Trigger

- Trigger: `/admin/users`, `/admin/classes`, admin school-management sidebar entries, CSV user import entry points, or class membership assignment UI.
- This is cross-layer UI/data-helper work because it reads `profiles`, `classes`, and `class_memberships`, and calls the existing CSV import API.
- Do not expand this into a full RBAC matrix; V1 is school account visibility plus class assignment operations.

### 2. Signatures

```ts
type AdminUserFilters = {
  query?: string;
  role?: AppRole | 'all';
  status?: ProfileStatus | 'all';
};

type AdminClassMembership = {
  id: string;
  classId: string;
  profileId: string;
  role: 'teacher' | 'student';
  createdAt: string;
  profile: { displayName: string; loginId: string | null; role: AppRole } | null;
  classInfo?: { name: string; grade: string | null } | null;
};

type AdminUserListItem = {
  id: string;
  displayName: string;
  loginId: string | null;
  role: AppRole;
  status: ProfileStatus;
  createdAt: string;
  updatedAt: string;
  memberships: AdminClassMembership[];
  assignmentSummary: string;
};

type AdminClassListItem = {
  id: string;
  name: string;
  grade: string | null;
  status: 'active' | 'archived';
  teachers: AdminClassMembership[];
  students: AdminClassMembership[];
  memberCount: number;
};

export async function getAdminUsers(filters: AdminUserFilters): Promise<DataResult<AdminUserListItem[]>>;
export async function getAdminClasses(): Promise<DataResult<AdminClassListItem[]>>;
export async function addClassMember(formData: FormData): Promise<void>;
export async function removeClassMember(formData: FormData): Promise<void>;
```

CSV import UI contract:

```ts
POST /api/admin/users/import
body preview: { csvText: string, commit?: false }
body commit:  { csvText: string, commit: true }
```

### 3. Contracts

- Admin sidebar `学校管理` group must include `用户权限 -> /admin/users` and `班级关系 -> /admin/classes`.
- `/admin/users` must read real `profiles` and show display name, login id, role, status, and class assignment summary.
- `/admin/users` must support query search across name/login/class summary, role filter, and status filter.
- `/admin/users` must use the real CSV import flow (`/api/admin/users/import` or the shared import dialog), not a static instruction-only dialog.
- `/admin/classes` must show teacher count, student count, member count, and member previews for each class.
- Class membership UI must use existing `class_memberships`; do not add a schema just for V1 assignment UI.
- Adding a student to a class must remove existing `role='student'` memberships first so a student has one active class assignment at the app boundary.
- Adding a teacher to a class must no-op if that teacher is already assigned to the same class.
- Removing a member must revalidate `/admin/classes`, `/admin/users`, and `/admin` so assignment summaries refresh.
- Admin AI 运维 pages may retain `Provider`, `MCP`, `SFT`, and `DPO`; do not sanitize professional admin terminology.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| No profiles | `/admin/users` renders empty state with CSV import CTA |
| Query has no match | render filtered-empty state and keep filters visible |
| Role filter selected | only matching `profiles.role` rows remain |
| Status filter selected | only matching `profiles.status` rows remain |
| CSV text invalid | preview returns row-level errors; commit blocked |
| CSV import succeeds | current route revalidates/refreshes |
| Class has no teachers | show explicit no-teacher warning/state |
| Add existing teacher to same class | no duplicate membership inserted; show/return already-assigned behavior |
| Add student to new class | old student-class membership removed before new one is inserted |
| Remove last teacher | UI must warn before or during removal flow |

### 5. Good/Base/Bad Cases

- Good: admin searches `高一` on `/admin/users` and sees students whose assignment summary contains that class.
- Good: admin imports CSV, previews invalid rows, fixes them, commits, and sees `/admin/users` refresh.
- Good: assigning a student to a new class moves them from the previous class.
- Base: class member dialog accepts a profile id with a datalist and lists current teachers/students.
- Bad: `/admin/users` shows a static CSV format dialog but never calls the import API.
- Bad: adding the same teacher twice creates duplicate `class_memberships` rows.

### 6. Tests Required

- Component/route smoke: `/admin/users` empty, populated, filtered-empty, role-filtered, and status-filtered states.
- Integration/API: CSV preview returns valid/invalid rows and commit writes profiles/memberships.
- Data helper: `getAdminUsers()` computes assignment summaries for admin, teacher, assigned student, and unassigned student.
- Data helper: adding a student deletes old `student` memberships before inserting the new one.
- Data helper: adding an existing teacher to the same class does not insert a duplicate.
- Static check: admin school-management sidebar includes `/admin/users`.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Dialog>
  <p>CSV 格式：display_name,login_id,role,class_name</p>
</Dialog>
```

#### Correct

```tsx
<UserImportDialog trigger={<Button>CSV 导入</Button>} />
```
