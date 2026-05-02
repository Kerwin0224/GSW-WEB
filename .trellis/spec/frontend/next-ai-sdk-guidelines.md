# Next.js App Router + Vercel AI SDK Guidelines

> Executable contracts for the planned Next.js/Vercel AI SDK refactor.

---

## Scenario: AI SDK Streaming Route Handlers

### 1. Scope / Trigger

- Trigger: any new or migrated AI endpoint that streams chat/completion output from a Next.js App Router route.
- Applies to files under `web/src/app/api/**/route.ts` and server-only helpers under `web/src/lib/ai/**`.
- Use this pattern when replacing FastAPI AI endpoints or adding RAG/chat flows.

### 2. Signatures

- Route file: `web/src/app/api/<feature>/route.ts`
- HTTP signature: `POST(request: Request) -> Response`
- Required route segment exports for AI streams:

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
```

- AI SDK server imports:

```ts
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
```

### 3. Contracts

Request body:

```ts
type ChatRequest = {
  messages: UIMessage[];
  projectId?: string;
};
```

Response:

- Success: AI SDK UI message stream from `result.toUIMessageStreamResponse()`.
- Auth failure: JSON `{ "error": "Unauthorized" }` with status `401`.
- Validation failure: JSON `{ "error": "Invalid request", "issues": [...] }` with status `400`.

Environment keys:

- `AI_GATEWAY_API_KEY` or provider-specific server-only model keys.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` for Supabase clients.
- Never expose service-role or provider secret keys through `NEXT_PUBLIC_*`.

Route requirements:

- Convert UI messages with `convertToModelMessages(messages)` before passing to `streamText`.
- Pass `abortSignal: request.signal` for long-running streams.
- Use `stopWhen: stepCountIs(n)` for multi-step tool loops.
- Tool definitions are plain objects with `description`, `parameters` (Zod schema), and `execute` — no `tool()` wrapper in AI SDK v6.
- Tool outputs must be serializable and safe to show to the current user.

### 4. Validation & Error Matrix

| Condition | Response | Assertion |
| --- | --- | --- |
| Missing/invalid JSON body | `400 Invalid request` | Route does not call model provider |
| `messages` missing or malformed | `400 Invalid request` | Zod/parser error is reported without stack trace |
| No authenticated Supabase user for protected route | `401 Unauthorized` | No retrieval/model call with private context |
| Tool input invalid | AI SDK tool validation failure or controlled `400` | Invalid tool args cannot reach DB query |
| Retrieval returns no accessible chunks | Stream says no relevant context or asks user to ingest data | No cross-user data leakage |
| Model/provider timeout or abort | Stream finishes/aborts with cleanup | Abort is logged without leaking secrets |

### 5. Good/Base/Bad Cases

- Good: authenticated user sends `UIMessage[]`; route retrieves only that user's chunks, streams answer, and cites retrieved source metadata.
- Base: authenticated user asks a question with no matching chunks; route streams a safe no-context answer.
- Bad: unauthenticated request attempts retrieval; route returns `401` before model/tool execution.

### 6. Tests Required

- Unit: request parser rejects missing or malformed `messages`.
- Unit: retrieval tool validates `query` with Zod.
- Route/integration: unauthorized request returns `401`.
- Route/integration: successful request returns a stream response content type compatible with AI SDK UI clients.
- Route/integration: abort signal is passed to `streamText` or the route-specific model wrapper.
- Security: route never uses `NEXT_PUBLIC_*` for provider secrets and never returns service-role-derived data to the client.

### 7. Wrong vs Correct

#### Wrong

```ts
export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: process.env.OPENAI_API_KEY!,
    messages,
  });
  return result.toTextStreamResponse();
}
```

Why wrong:

- Treats a secret as a model.
- Passes UI messages directly instead of `convertToModelMessages`.
- Has no auth, validation, runtime, max duration, or cancellation contract.
- Returns text stream when the UI expects AI SDK UI message stream.

#### Correct

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = ChatRequestSchema.parse(await req.json());
  const user = await requireUser();

  const result = streamText({
    model: 'openai/gpt-4o',
    system: 'Answer using retrieved context and cite sources.',
    messages: await convertToModelMessages(body.messages),
    stopWhen: stepCountIs(5),
    tools: {
      retrieveContext: {
        description: 'Retrieve user-owned context chunks.',
        parameters: z.object({ query: z.string().min(1) }),
        execute: ({ query }) => retrieveContext({ userId: user.id, query }),
      },
    },
    abortSignal: req.signal,
  });

  return result.toUIMessageStreamResponse();
}
```

---

## Scenario: Frontend AI Data Boundaries

### 1. Scope / Trigger

- Trigger: any React component or hook that calls an AI route, reads Supabase data, or renders AI SDK `UIMessage` parts.

### 2. Signatures

- Client component marker: `'use client'` only when browser interactivity is required.
- Server component data loading: async component or server helper using a server Supabase client.
- UI message rendering type: `UIMessage<Metadata, DataParts, Tools>` when tool parts are rendered.

### 3. Contracts

- Client components may call public route handlers and use browser Supabase client with anon/publishable key only.
- Server components/server actions may use server Supabase clients and private env vars.
- Tool parts in AI SDK 5+ are typed as `tool-${toolName}`; do not rely on the old generic `tool-invocation` part type.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Browser needs auth state | Use browser Supabase client or server-provided session-safe props |
| Component needs private data at render | Fetch in server component/server action, not client effect with secrets |
| Message part has unknown type | Render fallback or ignore safely |
| Tool result includes private metadata | Filter on server before stream/UI serialization |

### 5. Good/Base/Bad Cases

- Good: client renders typed `message.parts` with a switch over `text` and known `tool-*` parts.
- Base: unknown part type is ignored with no crash.
- Bad: client imports a server-only Supabase admin client or reads service-role env vars.

### 6. Tests Required

- Typecheck must fail for unhandled known tool-part shape changes where possible.
- Component tests or story smoke tests for text-only and tool-progress messages.
- Security review for imports crossing `server-only` boundaries.

### 7. Wrong vs Correct

#### Wrong

```tsx
'use client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
```

#### Correct

```tsx
'use client';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);
```

---

## Implementation Notes Learned From MVP Scaffold

### Do Not Add `@ai-sdk/react` Until React Peer Compatibility Is Verified

The current frontend uses React `19.2.0`. During the MVP scaffold, server-side AI SDK packages (`ai`, `@ai-sdk/openai`) installed and passed build/typecheck, but `@ai-sdk/react` was intentionally not added because its latest peer range rejected the current React version.

**Rule**:

- Use server-side AI SDK primitives directly in App Router route handlers for the MVP.
- Do not add `@ai-sdk/react` unless `npm install` confirms a compatible peer range for the repo's React version.
- If client chat hooks are needed before compatibility is clear, wrap fetch/stream behavior in project-owned UI helpers instead of forcing incompatible peer dependencies.

### Admin Routes Need Explicit Role Authorization

UI hiding and RLS are not enough for admin-only Next route handlers.

**Required pattern**:

- Admin route handlers must verify the authenticated Supabase user.
- Admin route handlers must read the user's `profiles.role` server-side.
- Non-admin users must receive `403 Forbidden` before any privileged action.

```ts
const { supabase, user } = await requireServerUser();
await requireAdminProfile(supabase, user.id);
```

### Protected Client Fetches Must Carry The Supabase Access Token

When browser code calls protected App Router APIs, it must include the current Supabase session access token. Cookie-only assumptions are not enough for all API calls and deployment modes.

```ts
await fetch('/api/admin/import/preview', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${session.access_token}`,
  },
  body: formData,
});
```

### UI Stream Responses Must Preserve Original Messages And Abort Cleanup

For AI SDK UI message streams, route handlers should pass original UI messages and stream consumption cleanup where available.

```ts
return result.toUIMessageStreamResponse({
  originalMessages: messages,
  consumeSseStream: consumeStream,
});
```

### No Scaffold/Mock Model Or Legacy API Fallback

The MVP Next.js surfaces must run on App Router route handlers, Supabase, and Vercel AI SDK only.

**Rules**:

- Frontend MVP clients must call same-origin `/api/**` routes or Supabase clients, not `NEXT_PUBLIC_API_BASE_URL` or old FastAPI paths.
- AI route handlers must use configured Vercel AI SDK provider models. They must not import mock/scaffold models or return canned model responses.
- Missing `AI_GATEWAY_API_KEY`/`OPENAI_API_KEY` or required model IDs must produce a clear `503`/configuration error before generation starts.
- Missing Supabase public URL/key must produce a clear configuration error for protected routes; do not silently treat auth as absent or return empty data.
- Demo login/session fallbacks are forbidden on MVP workspace surfaces.

**Forbidden examples**:

```ts
process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000'
new ScaffoldLanguageModel('mvp-scaffold-model')
if (!apiKey) return cannedAnswer
```


---

## Scenario: Role AI Routes With Persistence

### 1. Scope / Trigger

- Trigger: `web/src/app/api/student/chat/route.ts` and `web/src/app/api/teacher/chat/route.ts`.

### 2. Signatures

```ts
const ChatRequestSchema = z.object({
  messages: z.array(z.unknown()),
  conversationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  projectTitle: z.string().trim().min(1).optional(),
  presetId: z.string().uuid().optional(),
});
```

AI SDK response:

```ts
return result.toUIMessageStreamResponse({
  originalMessages,
  consumeSseStream: consumeStream,
});
```

### 3. Contracts

- Validate malformed JSON and UI messages before auth/model/provider work.
- Require verified role profile before model calls.
- Require capability-specific provider readiness before model calls.
- Student chat may create/select a real project only from provided real project title or configured classifier output; never fake classification.
- Teacher chat must require a published teacher prompt preset; no generic default system prompt fallback.
- Persist user message parts and assistant output where feasible; do not persist private tool metadata to client-visible fields.
- Use server-only model keys; never derive provider secrets from `NEXT_PUBLIC_*`.
- Login route must parse malformed JSON explicitly, reject any login input containing `@`, derive the internal Supabase Auth phone identifier from the school login ID, and verify `profiles.role` only after Auth returns a user. Email login is not a product feature.

### 4. Validation & Error Matrix

| Condition | Response |
| --- | --- |
| Malformed JSON | `400 Invalid request` |
| Invalid UI messages | `400 Invalid request` |
| Missing profile/wrong role | `401/403` safe JSON error |
| Login input contains `@` | `400` with school-account guidance |
| Missing provider capability/key | `503` blocked/config error |
| Missing teacher preset | `400/404` preset error |
| Stream abort | consume/cleanup stream without secret leakage |

### 5. Good/Base/Bad Cases

- Good: student route persists user message, streams assistant reply, and keeps Bloom/project classification pending when classifier is unavailable.
- Good: teacher route loads the selected published preset and creates audit candidates from assistant interactions.
- Bad: route silently uses a hardcoded generic prompt if `presetId` is missing.

### 6. Tests Required

- Route parser rejects bad body before model call.
- Missing provider/key returns config error before model call.
- Lint/build pass.
- Static grep finds no `message.content` or legacy `tool-invocation` rendering.

### 7. Wrong vs Correct

#### Wrong

```ts
const system = preset?.system_instruction ?? 'You are a helpful teacher.';
```

#### Correct

```ts
if (!preset) {
  return Response.json({ error: 'Published teacher preset required' }, { status: 400 });
}
```
