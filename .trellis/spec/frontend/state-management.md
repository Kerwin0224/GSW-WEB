# State Management

> State contracts for the Next.js + shadcn/ui UI/UX implementation.

---

## Scenario: Explicit UI Surface States

### 1. Scope / Trigger

- Trigger: any page or component in `frontend-new/**` that renders async data, auth/role checks, AI provider readiness, form submission, audit/export state, or empty operational data.
- Applies to Student, Teacher, Admin, login, and shared workbench components.

### 2. Signatures

Shared state surface components:

```ts
type SurfaceProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
};

function EmptyState(props: SurfaceProps): JSX.Element;
function BlockedState(props: SurfaceProps): JSX.Element;
function ErrorState(props: SurfaceProps): JSX.Element;
function PermissionState(props: SurfaceProps): JSX.Element;
function SuccessState(props: SurfaceProps): JSX.Element;
function LoadingSurface(props: { label?: string; className?: string }): JSX.Element;
```

State categories:

```ts
type UiSurfaceState =
  | 'empty'
  | 'loading'
  | 'error'
  | 'permission_denied'
  | 'blocked'
  | 'validation_failed'
  | 'success'
  | 'streaming';
```

### 3. Contracts

- Empty state means no real Supabase/application data exists; never fill with demo records.
- Blocked state means a real prerequisite is missing: auth/profile/provider/preset/class/MCP/export eligibility.
- Error state is for unexpected failures and must use `role="alert"`.
- Permission state must avoid leaking the protected record content.
- Success state appears only after a real committed action, not after local-only pretend actions.
- Loading state must preserve layout shape using skeletons or a stable loading surface.
- Streaming state must keep user input/history visible and guard duplicate submit.

### 4. Validation & Error Matrix

| Condition | Required state | Assertion |
| --- | --- | --- |
| Real list is empty | `EmptyState` | no mock rows |
| Provider capability missing | `BlockedState` | AI composer/action disabled |
| Profile/role missing | `PermissionState` or setup blocked state | no guessed route |
| Fetch/action error | `ErrorState` | error announced with `role="alert"` |
| Mutation confirmed | `SuccessState` | only after server confirmation path exists |
| Async loading | `LoadingSurface` | `aria-busy="true"` |
| AI streaming | streaming indicator + disabled duplicate submit | no duplicate message submit |

### 5. Good/Base/Bad Cases

- Good: student project list shows `EmptyState` until real project rows exist.
- Good: teacher ask shows `BlockedState` when no published prompt preset/provider exists.
- Good: admin export disables export and shows blocked copy when no approved audit records exist.
- Base: a page uses local booleans while server loaders are not wired, but the visible state is honest and blocked/empty.
- Bad: `const rows = data.length ? data : demoRows`.
- Bad: success toast after client-only validation when nothing was persisted.

### 6. Tests Required

- Component smoke for each shared surface state.
- Page smoke for student ask/projects, teacher ask/audit, admin setup/provider/export empty and blocked states.
- Accessibility smoke: `ErrorState`, `BlockedState`, and `PermissionState` are announced; `LoadingSurface` uses busy/live semantics.

### 7. Wrong vs Correct

#### Wrong

```tsx
const users = fetchedUsers.length ? fetchedUsers : [{ id: 'demo', name: '示例学生' }];
```

#### Correct

```tsx
{users.length === 0 ? (
  <EmptyState
    title="暂无用户"
    description="通过 CSV 批量导入或手动添加真实用户后，角色工作台才可使用。"
  />
) : (
  <UserTable users={users} />
)}
```

---

## Scenario: Local, URL, Server, And AI State Boundaries

### 1. Scope / Trigger

- Trigger: deciding where to store UI state in `frontend-new/**`.

### 2. Signatures

```ts
type LocalUiState = string | boolean | number | null;
type RouteState = URLSearchParams;
type ServerState<T> = T | null;
type AiStreamState = 'idle' | 'submitted' | 'streaming' | 'error';
```

### 3. Contracts

- Local React state is allowed for transient UI only: input text, selected tab, selected preset, open dialog, pending local validation.
- URL state should hold shareable filters: audit status, class, student, candidate type, admin table search when implemented.
- Server state comes from Supabase/server loaders or route handlers; it must not be replaced by mock success.
- AI stream state comes from Vercel AI SDK `useChat` status/error and must not be duplicated into conflicting local state.
- Global state libraries are not required for the MVP UI slice; introduce only with a documented need.

### 4. Validation & Error Matrix

| State need | Correct place |
| --- | --- |
| Chat input value | local state |
| Selected prompt preset | local state or URL when shareable |
| Audit filters | URL/search params when backend wired |
| Auth/profile/role | server/auth boundary |
| Provider readiness | server/admin config boundary |
| AI messages | AI SDK hook/server persistence boundary |

### 5. Good/Base/Bad Cases

- Good: `useChat` owns message and streaming state; component owns composer text.
- Base: local booleans drive blocked state while backend wiring is pending, but copy states it is blocked.
- Bad: global store stores service-role secrets or provider keys.

### 6. Tests Required

- Typecheck page props and local state.
- Interaction smoke for composer disabled/submit behavior.

### 7. Wrong vs Correct

#### Wrong

```tsx
const [status, setStatus] = useState('streaming'); // separate from useChat status
```

#### Correct

```tsx
const busy = status === 'submitted' || status === 'streaming';
```
