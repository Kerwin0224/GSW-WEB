# Hook Guidelines

> Hook contracts for the Next.js + AI SDK + shadcn/ui frontend.

---

## Scenario: Client Hooks Only At Interactive Boundaries

### 1. Scope / Trigger

- Trigger: creating or using hooks in `frontend-new/src/hooks/**`, Client Components, AI chat surfaces, responsive UI, dialogs, forms, or browser-only behavior.

### 2. Signatures

Existing hook signature:

```ts
function useIsMobile(): boolean;
```

AI SDK hook pattern:

```ts
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage, status, error } = useChat({
  transport: new DefaultChatTransport({ api: '/api/student/chat' }),
});
```

### 3. Contracts

- Hooks require a Client Component boundary (`'use client'`). Do not call hooks in Server Components.
- Prefer server loaders/server helpers for protected data; hooks are for browser interactivity, not privileged fetching.
- `useChat` owns AI message and streaming state. Do not reimplement message arrays unless there is a persistence adapter.
- `useIsMobile` must use `useSyncExternalStore` or equivalent SSR-safe behavior; direct `window` access during render is forbidden.
- Hook names use `use*` and return stable, minimal values.
- Custom hooks must not hide missing provider/auth fallback behavior; return typed blocked/error states instead.

### 4. Validation & Error Matrix

| Condition | Required behavior | Assertion |
| --- | --- | --- |
| Hook needs `window` | guard SSR or use sync external store | no hydration crash |
| Protected data required | use server component/helper first | no client secret import |
| AI stream needed | use `useChat` + `DefaultChatTransport` | message parts compatible |
| Missing provider | hook/page returns blocked state | no canned response |
| Duplicate submit | derive busy from `useChat.status` | no double send |

### 5. Good/Base/Bad Cases

- Good: `ChatComposer` receives `disabled={busy}` derived from AI SDK status.
- Good: `useIsMobile` uses `useSyncExternalStore` with server fallback.
- Base: local UI hook for non-sensitive UI toggles.
- Bad: hook imports service-role Supabase client or provider secret.
- Bad: hook catches model error and returns fake assistant text.

### 6. Tests Required

- Lint/build catches Server/Client boundary violations.
- Component smoke for AI submitted/streaming/error states.
- Responsive smoke for mobile sidebar behavior when hook is used.

### 7. Wrong vs Correct

#### Wrong

```tsx
export function useSecretProvider() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}
```

#### Correct

```tsx
const { messages, sendMessage, status, error } = useChat({
  transport: new DefaultChatTransport({ api: '/api/teacher/chat' }),
});
```

---

## Scenario: Data Fetching Hook Boundary

### 1. Scope / Trigger

- Trigger: future data hooks for project lists, audit queues, provider status, or admin tables.

### 2. Signatures

```ts
type HookResult<T> =
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  | { state: 'empty' }
  | { state: 'blocked'; reason: string }
  | { state: 'error'; message: string };
```

### 3. Contracts

- Do not add generic client fetching for data that can be loaded securely on the server.
- When hooks are used for client refresh/search, they must expose explicit empty/blocked/error states.
- Hooks must not silently normalize failures into empty arrays when the user needs to see an error or blocked setup state.

### 4. Validation & Error Matrix

| Backend result | Hook result |
| --- | --- |
| no rows | `empty` |
| missing provider/profile | `blocked` |
| permission denied | `blocked` or `error` with safe message |
| network/server failure | `error` |
| rows returned | `ready` |

### 5. Good/Base/Bad Cases

- Good: `blocked` state flows to `BlockedState`.
- Base: static local empty state while backend integration is intentionally pending.
- Bad: `catch { return [] }`.

### 6. Tests Required

- Hook unit tests when data hooks are introduced.

### 7. Wrong vs Correct

#### Wrong

```ts
catch {
  return [];
}
```

#### Correct

```ts
catch (error) {
  return { state: 'error', message: toSafeMessage(error) } as const;
}
```
