# Supabase + pgvector Guidelines

> Executable database, auth, and retrieval contracts for the planned Supabase refactor.

---

## Scenario: Supabase Auth, RLS, and pgvector Retrieval

### 1. Scope / Trigger

- Trigger: replacing SQLite/Chroma/FastAPI persistence or adding Supabase-backed document/RAG storage.
- Applies to Supabase migrations under `supabase/migrations/**`, generated DB types under `frontend/lib/supabase/**`, and server-only data helpers under `frontend/lib/**`.
- This is infra and cross-layer work; code-spec depth is mandatory.

### 2. Signatures

Required migration signatures:

```sql
create extension if not exists vector with schema extensions;

create table public.documents (...);
create table public.document_chunks (... embedding extensions.vector(<dimension>) not null ...);

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

create index <table>_<column>_hnsw
  on public.<table> using hnsw (<column> vector_cosine_ops);

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(<dimension>),
  match_count int default 8,
  match_threshold float default 0.25
) returns table (...);
```

Required application signatures:

```ts
const { data, error } = await supabase.rpc('match_document_chunks', {
  query_embedding: embedding,
  match_count: 8,
  match_threshold: 0.25,
});
```

Supabase client factories:

```ts
// browser client: anon/publishable only
createBrowserClient(url, publishableKey);

// server client: cookie-aware, request scoped
createServerClient(url, publishableKey, { cookies: { getAll, setAll } });
```

### 3. Contracts

Environment keys:

| Key | Scope | Required | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser/server | yes | Public project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser/server | yes | RLS-protected public key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | admin tasks only | Never import into client bundles |
| `AI_GATEWAY_API_KEY` or provider key | server only | AI routes | Never expose as `NEXT_PUBLIC_*` |
| `CWB_EMBEDDING_MODEL` | server only | RAG | Changing requires re-index |
| `CWB_EMBEDDING_DIMENSIONS` | server only | RAG | Must match vector column dimension |

Ownership contract:

- Every user-owned table must include `owner_id uuid not null references auth.users(id) on delete cascade` or a documented tenant ownership equivalent.
- RLS must be enabled before data is considered production-safe.
- Select/update/delete policies must constrain rows with `(select auth.uid()) = owner_id` unless the table is intentionally public.
- Insert policies must use `with check ((select auth.uid()) = owner_id)`.

Vector contract:

- Store source documents/resources separately from chunks/embeddings.
- `document_chunks.embedding` dimension must equal the selected embedding model output dimension.
- Vector search must be wrapped in SQL RPC because Supabase client/PostgREST does not expose pgvector similarity operators directly.
- RPC must filter by current user/tenant before returning chunks.

### 4. Validation & Error Matrix

| Condition | Error/Behavior | Assertion |
| --- | --- | --- |
| Migration lacks `vector` extension | migration fails fast | No vector table without extension |
| Embedding dimension mismatches column | insert/RPC fails | Test fixture catches mismatch |
| User A queries User B chunks | zero rows | RLS/RPC owner filter enforced |
| Unauthenticated RPC call | zero rows or auth error | No private chunks returned |
| Service role used in request path | forbidden unless documented admin path | Code review blocks browser exposure |
| Embedding model changes | re-index required | Migration/config notes updated |
| Threshold too high/no matches | empty retrieval result | AI route returns no-context response |

### 5. Good/Base/Bad Cases

- Good: authenticated user inserts document, chunks are embedded with matching dimensions, RPC returns top owned chunks above threshold with source metadata.
- Base: authenticated user has no documents; RPC returns empty array and chat route streams a safe no-context answer.
- Bad: browser code calls Supabase with service-role key or RPC returns chunks from another user.

### 6. Tests Required

- Migration smoke: `vector` extension exists, tables exist, RLS enabled, HNSW index exists, RPC exists.
- RLS tests: user can CRUD own document/chunks and cannot read another user's rows.
- RPC tests: `match_document_chunks` filters by auth user and respects `match_count`/`match_threshold`.
- Type generation check: generated Supabase `Database` type is imported by client factories/data helpers.
- Route integration: document ingestion creates chunks and query route retrieves them.
- Security: grep/static check that `SUPABASE_SERVICE_ROLE_KEY` is imported only from server-only admin modules.

### 7. Wrong vs Correct

#### Wrong

```sql
create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(1536) not null
);
```

Why wrong:

- No `extensions.vector` schema qualification.
- No owner/tenant column.
- No RLS.
- No source document relationship.
- No vector index.
- No RPC boundary.

#### Correct

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

---

## Scenario: Supabase CLI, Migrations, and Generated Types

### 1. Scope / Trigger

- Trigger: any schema, RLS, RPC, storage bucket, or seed-data change.

### 2. Signatures

```bash
supabase init
supabase migration new <name>
supabase db diff -f <name>
supabase db push --dry-run
supabase gen types --local > frontend/lib/supabase/database.types.ts
```

### 3. Contracts

- All schema changes must be represented as SQL migrations in `supabase/migrations/`.
- Generated TypeScript types must be refreshed after schema/RPC changes.
- Remote pushes must be dry-run reviewed first.
- Seed/demo data must not require service-role credentials in client code.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Migration changes DB shape | regenerate DB types |
| RPC signature changes | update TS wrapper types/tests |
| Remote push requested | run `supabase db push --dry-run` first |
| Local generated diff is noisy | manually review before committing |

### 5. Good/Base/Bad Cases

- Good: migration + generated types + tests change together.
- Base: SQL-only draft migration includes TODO comments and is not started until reviewed.
- Bad: app code assumes columns/RPC fields that do not exist in generated `Database` types.

### 6. Tests Required

- Typecheck after DB type generation.
- Migration smoke locally before remote deployment when Supabase CLI is available.
- Review generated SQL for destructive operations before applying.

### 7. Wrong vs Correct

#### Wrong

```ts
const { data } = await supabase.from('document_chunks').select('*');
```

#### Correct

```ts
const { data, error } = await supabase.rpc('match_document_chunks', {
  query_embedding: embedding,
  match_count: 8,
  match_threshold: 0.25,
});
if (error) throw error;
```

---

## Implementation Notes Learned From MVP Scaffold

### pgvector Retrieval Must Use Real Query Embeddings

The retrieval path must not fall back to `query_embedding: null`, nullable vector columns, or text-search placeholders when claiming pgvector support.

**Rule**:

- `document_chunks.embedding` is required.
- `match_document_chunks.query_embedding` is required.
- Application code must call the configured embedding model before `supabase.rpc('match_document_chunks', ...)`.
- If no embedding provider is configured, the route should fail clearly instead of pretending vector retrieval ran.

```ts
const { embedding } = await embed({
  model: aiProvider.getEmbeddingModel(),
  value: query,
});

const { data, error } = await supabase.rpc('match_document_chunks', {
  query_embedding: JSON.stringify(embedding),
  match_count: limit,
  match_threshold: threshold,
});
```

### Generated Types Must Match Migration Reality

If Supabase CLI is unavailable, a hand-written `Database` type scaffold is acceptable only as a temporary implementation scaffold. Before production or remote deployment:

- Apply migrations locally or to a linked Supabase project.
- Regenerate types with `supabase gen types --local` or `supabase gen types --linked`.
- Replace/verify `frontend/lib/supabase/database.types.ts` against generated output.

### Service/Admin Authorization Is A Route Contract

RLS protects database rows, but privileged App Router endpoints still need explicit role checks before running side effects such as CSV import preview, user creation, provider config, MCP config, prompt preset publishing, or dataset export.

**Required behavior**:

- Unauthenticated -> `401 Unauthorized`.
- Authenticated non-admin -> `403 Forbidden`.
- Admin -> continue to route validation and side effects.

### No SQLite/Chroma/FastAPI Retrieval Fallback

The MVP retrieval and persistence path is Supabase Postgres + pgvector only.

**Rules**:

- Do not fall back to SQLite, Chroma, text-search placeholders, or FastAPI retrieval when Supabase/pgvector configuration is missing.
- Retrieval helpers must require a real query embedding from the configured AI SDK embedding model.
- Missing Supabase URL/key, RPC, embedding provider, or embedding model configuration must fail clearly and be visible to the caller.
- Returning an empty context is valid only when Supabase and embedding generation succeeded and the authorized RPC found no matching rows.

