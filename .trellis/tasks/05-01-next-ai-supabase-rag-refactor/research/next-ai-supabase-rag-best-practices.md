# Next.js + Vercel AI SDK + Supabase pgvector RAG Best Practices

Date: 2026-05-01
Sources: Tavily search + Context7 docs queries for `/vercel/ai`, `/vercel/next.js/v16.2.2`, `/supabase/supabase`, `/supabase/ssr`, `/supabase/cli`, `/websites/langchain_oss_javascript`, `/run-llama/llamaindexts`.

## Executive Recommendation

Refactor toward a single Next.js App Router application deployed on Vercel, with Supabase as the system of record (Auth + Postgres + Storage + Realtime) and pgvector for RAG. Keep AI streaming endpoints in `frontend/app/api/**/route.ts` using the Vercel AI SDK. Use LangChain.js or LlamaIndex.TS only behind a narrow internal orchestration boundary, not directly in React components.

Recommended MVP architecture:

- Next.js App Router owns UI, route handlers, server actions, auth-aware data loading, and streaming chat APIs.
- Supabase Postgres replaces SQLite; pgvector replaces Chroma for durable retrieval.
- Supabase Auth + RLS protects all tenant/user-owned records.
- AI SDK owns provider abstraction, `streamText`, `generateText`, `embed`/`embedMany`, typed tools, and UI streaming.
- LangChain.js or LlamaIndex.TS is optional orchestration under `lib/ai/orchestration/*` for workflows that exceed AI SDK primitives.
- Prefer one orchestration framework for the MVP. Use LangChain.js if you need agents/tools/workflows; use LlamaIndex.TS if you need ingestion/query-engine abstractions over document corpora.

## Current Repo Constraints

Repo inspection shows:

- Frontend: `frontend/` Next.js 16.1.6, React 19.2, SWR, Zod, Tailwind, npm.
- Backend: `backend/` FastAPI, Pydantic, LangGraph, SQLite, ChromaDB, model-provider routing, Grok fallback, Langfuse.
- Frontend API client: `frontend/lib/api.ts` targets FastAPI through `NEXT_PUBLIC_API_BASE_URL`.
- RAG/data today: `CWB_DB_PATH` SQLite and `CWB_CHROMA_DIR` Chroma.
- Likely refactor impact: `backend/app/main.py`, `backend/app/db.py`, `backend/app/schemas.py`, `backend/app/graph/*`, `frontend/lib/api.ts`, `frontend/lib/types.ts`, `frontend/lib/validators.ts`, `frontend/app/**`, `.env.example`, docs/specs.

## Next.js App Router / Vercel Runtime

Best-practice shape:

- Use App Router route handlers for APIs: `app/api/<name>/route.ts` exports `GET`, `POST`, etc.
- For streaming AI routes, export `maxDuration` and usually `runtime = 'nodejs'` when using DB drivers, Supabase server clients, LangChain, or LlamaIndex.
- Use route segment exports for runtime/caching behavior:
  - `export const runtime = 'nodejs' | 'edge'`
  - `export const maxDuration = 30 | 60 | ...`
  - `export const dynamic = 'force-dynamic'` for auth/user-specific APIs.
- Server components should load auth-scoped data directly from Supabase server clients where feasible.
- Client components should own interactivity only; do not pass service-role keys or privileged database logic to the browser.
- Private environment variables are server-only. Only `NEXT_PUBLIC_*` values may be exposed to the browser.

## Vercel AI SDK

Key patterns from official docs:

- Chat route:
  - Parse typed `UIMessage[]` from request JSON.
  - Convert UI messages with `convertToModelMessages(messages)`.
  - Call `streamText({ model, system, messages, tools, stopWhen })`.
  - Return `result.toUIMessageStreamResponse()` for AI SDK UI clients.
- Tool calls:
  - Define tools with `tool({ description, inputSchema: z.object(...), execute })`.
  - Use `stopWhen: isStepCount(n)` for multi-step tool calling.
  - Type tools with `ToolSet`, `InferUITools`, and `UIMessage<..., ..., Tools>` when the UI renders tool parts.
- Embeddings:
  - Use `embed({ model, value })` for query embeddings.
  - Use `embedMany({ model, values })` for batch document chunks.
  - Keep embedding model and dimensions stable; changing them requires re-indexing.
- Stream cancellation:
  - Pass `abortSignal: req.signal` to long-running `streamText` calls.
  - Use `toUIMessageStreamResponse({ onFinish, consumeSseStream: consumeStream })` when robust abort cleanup matters.

Recommended route skeleton:

```ts
import {
  convertToModelMessages,
  isStepCount,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: 'openai/gpt-4o',
    system: 'Answer using retrieved project context; cite sources when available.',
    messages: await convertToModelMessages(messages),
    stopWhen: isStepCount(5),
    tools: {
      retrieveContext: tool({
        description: 'Retrieve relevant passages from the user-visible knowledge base.',
        inputSchema: z.object({ query: z.string().min(1) }),
        execute: async ({ query }) => retrieveContextForCurrentUser(query),
      }),
    },
    abortSignal: req.signal,
  });

  return result.toUIMessageStreamResponse();
}
```

## Supabase Auth / SSR / RLS

Recommended client split:

- `lib/supabase/browser.ts`: `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or ANON_KEY)` for browser-only UI.
- `lib/supabase/server.ts`: `createServerClient(...)` using `cookies()` for Server Components, Server Actions, and Route Handlers.
- `middleware.ts` or `proxy.ts`: refresh auth session with `supabase.auth.getUser()` immediately after `createServerClient`; preserve returned cookies/response.
- Authorization must rely on `auth.getUser()` on the server, not cookie-only `getSession()`.

RLS rules:

- Enable RLS on every user/tenant-owned table.
- Use `auth.uid()` in `using` and `with check` policies.
- Service-role key is server-only and only for admin/maintenance paths. Never expose it to client bundles.
- Storage policies must be explicit per bucket/path.

## Supabase pgvector

Recommended schema and query pattern:

- Enable vector extension: `create extension if not exists vector with schema extensions;`
- Store documents/resources separately from chunks/embeddings.
- Include tenant/user ownership columns and metadata for source/citation filtering.
- Use vector columns with a fixed dimension matching the embedding model.
- Create HNSW index for production vector similarity.
- Because Supabase PostgREST does not expose pgvector operators directly, wrap similarity search in Postgres functions and call with `supabase.rpc(...)`.

Illustrative SQL:

```sql
create extension if not exists vector with schema extensions;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_uri text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "documents_select_own" on public.documents
  for select using ((select auth.uid()) = owner_id);

create policy "documents_insert_own" on public.documents
  for insert with check ((select auth.uid()) = owner_id);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  unique(document_id, chunk_index)
);

alter table public.document_chunks enable row level security;

create policy "chunks_select_own" on public.document_chunks
  for select using ((select auth.uid()) = owner_id);

create index document_chunks_embedding_hnsw
  on public.document_chunks using hnsw (embedding vector_cosine_ops);
```

RPC pattern:

```sql
create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1536),
  match_count int default 8,
  match_threshold float default 0.25
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  where c.owner_id = (select auth.uid())
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```

Application call:

```ts
const { data, error } = await supabase.rpc('match_document_chunks', {
  query_embedding: embedding,
  match_count: 8,
  match_threshold: 0.25,
});
```

## Supabase CLI / Migrations / Types

- Initialize local Supabase with `supabase init`.
- Create migrations with `supabase migration new <name>`.
- Generate diffs with `supabase db diff -f <name>` only after reviewing local changes.
- Push migrations with `supabase db push`; use `--dry-run` before remote changes.
- Generate TypeScript database types with `supabase gen types --local > frontend/lib/supabase/database.types.ts` or `supabase gen types --linked > ...`.
- Keep migrations, seed data, generated DB types, and `.env.example` in sync.

## LangChain.js vs LlamaIndex.TS

LangChain.js is better when:

- You need explicit agent/tool workflows.
- You need graph-like or stateful orchestration in JS.
- You want retrieval tools as part of an agent loop.

Relevant patterns:

- `vectorStore.asRetriever({ k })`
- `tool(async ({ query }) => ..., { name, description, schema, responseFormat: 'content_and_artifact' })`
- `createAgent({ model, tools })`
- stream agent values with `agent.stream(...)`

LlamaIndex.TS is better when:

- The core problem is document ingestion, indexing, and query engines.
- You want `VectorStoreIndex.fromDocuments(...)`, `VectorStoreIndex.fromVectorStore(...)`, `index.asQueryEngine()`, source nodes, and ingestion pipelines.

Relevant patterns:

- `new Document({ text, id_ })`
- `VectorStoreIndex.fromDocuments([document])`
- `VectorStoreIndex.fromVectorStore(vectorStore)`
- `index.asQueryEngine()`
- `queryEngine.query({ query })`
- `IngestionPipeline({ transformations: [SentenceSplitter, ..., Embedding], vectorStore })`

MVP recommendation: Do not use both LangChain.js and LlamaIndex.TS in the first refactor slice unless the PRD explicitly requires both. Build a narrow `Retriever` interface around Supabase pgvector so either framework can be swapped later.

## Testing / Observability

Minimum checks for this refactor:

- Unit tests for chunking, embedding metadata, and Zod request validation.
- SQL migration verification for pgvector extension, tables, RLS, indexes, and RPC function.
- Integration tests for Supabase client factories and auth-scoped queries.
- Route handler tests for `/api/chat` streaming contract and unauthorized behavior.
- E2E smoke: sign in, ingest a small document, query it, verify answer includes retrieved citation/source.
- Observability: log request id, user id (hashed or UUID only), retrieval result counts/scores, model id, token usage where available, latency, and abort/completion state. Never log raw secrets or full private documents by default.

## Key Source URLs

- AI SDK RAG guide: https://ai-sdk.dev/cookbook/guides/rag-chatbot
- AI SDK route/tool/stream patterns: https://github.com/vercel/ai/tree/main/content
- Next.js route handler docs: https://github.com/vercel/next.js/tree/v16.2.2/docs/01-app
- Supabase Next.js auth example / SSR guidance: https://github.com/supabase/supabase/tree/master/examples/user-management/nextjs-user-management
- Supabase vector columns: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/ai/vector-columns.mdx
- Supabase semantic search example: https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/functions/examples/semantic-search.mdx
- Supabase CLI docs via Context7 `/supabase/cli`
- LangChain JS RAG docs: https://docs.langchain.com/oss/javascript/langchain/rag
- LlamaIndex.TS docs: https://github.com/run-llama/llamaindexts
