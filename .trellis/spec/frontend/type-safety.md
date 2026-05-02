# Type Safety

> Type and validation contracts for the Next.js + Supabase + AI SDK refactor.

---

## Scenario: End-to-End Typed UI Boundaries

### 1. Scope / Trigger

- Trigger: route handlers, Server Components, Client Components, Supabase helpers, AI SDK message rendering, forms, and import/export payloads.

### 2. Signatures

Validation stack:

```ts
import { z } from 'zod';
```

Supabase type pattern:

```ts
import type { Database } from '@/lib/supabase/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
```

AI SDK UI message pattern:

```ts
import type { UIMessage } from 'ai';

type AppMessage = UIMessage<AppMessageMetadata, AppDataParts, AppTools>;
```

### 3. Contracts

- Validate all external inputs with Zod at route/server-action boundaries.
- Keep request/response schemas close to route/service boundary and export inferred types only when reused.
- Use generated Supabase `Database` types for table rows/inserts/updates when available.
- Do not use `any` for domain data, AI messages, Supabase rows, or form payloads.
- Unknown AI SDK message parts must be safely ignored or rendered by an explicit fallback; never assume text-only messages for production AI UIs.
- Role strings, Bloom levels, audit statuses, provider capabilities, and preset statuses must be union types/enums, not free strings.
- Type assertions (`as`) require a nearby validation or boundary reason.

### 4. Validation & Error Matrix

| Condition | Required behavior | Assertion |
| --- | --- | --- |
| Invalid route JSON | `400` with validation-safe issues | model/DB not called |
| Invalid form payload | field errors | no mutation |
| Unknown role | auth/profile setup error | no workspace route guessed |
| Unknown Bloom level | validation error or unclassified state | no invalid color token |
| Unknown AI message part | safe ignore/fallback | no render crash |
| Supabase error | typed error handling | no `data!` unsafe access |

### 5. Good/Base/Bad Cases

- Good: `z.enum(['student', 'teacher', 'admin'])` drives role routing after verified profile load.
- Good: `z.union([z.literal(1), ..., z.literal(6)])` or equivalent validates Bloom level.
- Base: local UI-only type declared next to component.
- Bad: `const role = data.role as any` then route to `/${role}`.
- Bad: route handler parses JSON and calls model before validating `messages`.

### 6. Tests Required

- Unit tests for request schemas on AI routes and admin mutations.
- Typecheck catches role/Bloom/status mismatch.
- Component smoke for AI messages with text and unknown/tool parts.
- Import/export schema tests for SFT/DPO JSONL payloads.

### 7. Wrong vs Correct

#### Wrong

```ts
const body = await req.json();
await streamStudentAnswer(body.messages as any);
```

#### Correct

```ts
const ChatRequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
  projectId: z.string().uuid().optional(),
});

const body = ChatRequestSchema.parse(await req.json());
await streamStudentAnswer(body);
```

---

## Scenario: No-Fallback Type Contracts

### 1. Scope / Trigger

- Trigger: missing environment, provider config, Supabase profile, class assignment, prompt preset, or audit/export record.

### 2. Signatures

```ts
type Result<T, E extends string> =
  | { ok: true; data: T }
  | { ok: false; error: E; message: string };

type BlockReason =
  | 'missing_profile'
  | 'missing_provider'
  | 'missing_supabase_config'
  | 'missing_preset'
  | 'permission_denied'
  | 'not_found';
```

### 3. Contracts

- Missing config/data is a typed blocked/error state, not an empty object fallback.
- Do not use placeholder IDs, placeholder provider names, mock model responses, or fake rows to satisfy types.
- Optional fields are optional only when product behavior accepts absence; otherwise validate as required before mutation/action.

### 4. Validation & Error Matrix

| Missing item | Correct typed state |
| --- | --- |
| profile/role | `missing_profile` |
| provider capability | `missing_provider` |
| Supabase env/client | `missing_supabase_config` |
| teacher preset | `missing_preset` |
| record outside scope | `permission_denied` or `not_found` |

### 5. Good/Base/Bad Cases

- Good: student chat route returns provider setup error before model call.
- Base: UI disables action with blocked reason.
- Bad: model call falls back to canned text.

### 6. Tests Required

- Missing provider test asserts no model call.
- Missing profile test asserts no workspace data fetch.

### 7. Wrong vs Correct

#### Wrong

```ts
const provider = configuredProvider ?? { name: 'demo', model: 'mock' };
```

#### Correct

```ts
if (!configuredProvider) {
  return { ok: false, error: 'missing_provider', message: 'Configure a provider for student_chat.' };
}
```
