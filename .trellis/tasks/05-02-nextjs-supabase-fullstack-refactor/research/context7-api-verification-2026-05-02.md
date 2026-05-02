# Context7 API Verification — 2026-05-02

Critical API differences from 05-01 research/specs. Source: Context7 queries against `/websites/ai-sdk_dev`, `/llmstxt/ui_shadcn_llms_txt`, `/vercel/next.js`, `/supabase/ssr`, `/supabase/supabase`.

## Vercel AI SDK v6 — Breaking API Changes

### Tool Definition (CHANGED)

Old (v5, used in current specs):
```ts
import { tool } from 'ai';
tools: {
  retrieveContext: tool({
    description: '...',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => { ... },
  }),
}
```

New (v6, from Context7):
```ts
tools: {
  displayWeather: {
    description: 'Display the weather for a location',
    parameters: z.object({ latitude: z.number(), longitude: z.number() }),
    execute: async function ({ latitude, longitude }) { ... },
  },
}
```

**No `tool()` wrapper!** Plain object with `parameters` instead of `inputSchema`.

### Step Count (CHANGED)

Old: `isStepCount(n)` → New: `stepCountIs(n)`

### Client Hook (CHANGED)

Old (v5):
```ts
import { useChat } from 'ai/react';
const { messages, input, handleInputChange, handleSubmit } = useChat();
```

New (v6):
```ts
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';

const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
});
// sendMessage({ parts: [{ type: 'text', text: input }] });
```

### Message Structure (CHANGED)

- Messages now use `.parts[]` array instead of `.content`
- Part types: `text`, `tool-${toolName}` (not generic `tool-invocation`)
- Tool parts have state: `input-available`, `output-available`, `partial-call`, `call`, `result`
- `UIMessage` typed with generics: `UIMessage<never, never, ChatTools>`

### Stream Response

Still: `result.toUIMessageStreamResponse()` ✓
Optional: `result.toUIMessageStreamResponse({ originalMessages, consumeSseStream })`

## shadcn/ui — Installation

```bash
npx shadcn@latest init        # Basic init
npx shadcn@latest init -t next  # Next.js template
npx shadcn@latest add button    # Add components
```

Theming via CSS variables in `globals.css`. Custom theme config as JSON:
```json
{
  "theme": { "font-heading": "Poppins, sans-serif" },
  "light": { "brand": "20 14.3% 4.1%", "radius": "0.5rem" },
  "dark": { "brand": "20 14.3% 4.1%" }
}
```

## Next.js — Scaffold

```bash
npx create-next-app@latest --yes  # Skip prompts, use defaults
npx create-next-app@latest        # Interactive mode
```

Defaults: TypeScript, Tailwind CSS, ESLint, App Router, Turbopack, `@/*` alias, `AGENTS.md`.

## Supabase SSR — Auth Patterns

### Middleware (session refresh):
```ts
const supabase = createServerClient(url, key, {
  cookies: {
    getAll: () => request.cookies.getAll().map(c => ({ name: c.name, value: c.value })),
    setAll: (cookies) => cookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    }),
  },
});
await supabase.auth.getUser(); // triggers token refresh
```

### Server Components (read-only cookies):
```ts
const cookieStore = await cookies();
const supabase = createServerClient(url, key, {
  cookies: { getAll: () => cookieStore.getAll() }, // setAll omitted
});
```

### Route Handlers (can set cookies):
```ts
const cookieStore = await cookies();
const supabase = createServerClient(url, key, {
  cookies: {
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) => {
      cookieStore.set(name, value, options);
    }),
  },
});
```

### Auth Verification:
- `getUser()` → contacts Auth server, VERIFIED (use for authorization)
- `getSession()` → reads cookies only, UNVERIFIED (don't use for auth decisions)

## pgvector RPC

```sql
create or replace function match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
) returns table (id bigint, content text, similarity float)
language sql stable as $$
  select id, content,
    1 - (embedding <=> query_embedding) as similarity
  from documents
  where 1 - (embedding <=> query_embedding) >= match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

```ts
const { data } = await supabase.rpc('match_documents', {
  query_embedding: embedding,
  match_threshold: 0.78,
  match_count: 10,
});
```

## Impact on Existing Specs

The following spec files need updates before implementation:

1. `.trellis/spec/frontend/next-ai-sdk-guidelines.md`:
   - `tool({...})` → plain object `{...}`
   - `inputSchema` → `parameters`
   - `isStepCount` → `stepCountIs`
   - Add `DefaultChatTransport` pattern
   - `.content` → `.parts[]`

2. `.trellis/spec/backend/supabase-pgvector-guidelines.md`:
   - Cookie handling patterns per environment (middleware vs server component vs route handler)
   - `getUser()` vs `getSession()` distinction
