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


---

## Scenario: Fullstack Refactor Supabase Data Contracts

### 1. Scope / Trigger

- Trigger: `frontend-new` data integration for auth/profile roles, role workspaces, provider capabilities, prompt presets, conversations, audit records, exports, and pgvector RAG.
- Applies to `frontend-new/supabase/migrations/**`, `frontend-new/src/lib/supabase/database.types.ts`, and server-only data helpers under `frontend-new/src/lib/data/**`.

### 2. Signatures

Migration file:

```text
frontend-new/supabase/migrations/202605020001_fullstack_refactor.sql
```

Core tables:

```sql
public.profiles(id, login_id, display_name, email, role, status)
public.classes(id, name, grade, status)
public.class_memberships(class_id, profile_id, role)
public.provider_configs(id, name, provider_type, base_url, secret_ref, secret_last_four, is_enabled, health_status)
public.provider_capabilities(provider_id, capability, model_id, is_enabled, metadata)
public.prompt_presets(id, title, scenario, system_instruction, target_role, status, version)
public.text_projects(id, owner_id, class_id, title, author, classification_state, highest_bloom_level)
public.conversations(id, owner_id, class_id, project_id, source, prompt_preset_id, title)
public.conversation_messages(id, conversation_id, role, content, parts, bloom_level, bloom_state, model_id)
public.practice_records(id, student_id, project_id, target_bloom_level, answer, feedback, evaluation_state)
public.audit_records(id, source_message_id, auditor_id, kind, status, prompt, original_answer, corrected_answer, chosen_answer, rejected_answer, rationale)
public.export_batches(id, kind, status, record_count, jsonl_payload)
public.documents(id, owner_id, class_id, project_id, title, source_uri, metadata)
public.document_chunks(id, document_id, owner_id, class_id, project_id, chunk_index, content, metadata, embedding)
```

RAG helper:

```ts
retrieveDocumentChunks({ query, matchCount, matchThreshold, projectId })
  -> Promise<DataResult<DocumentChunkMatch[]>>
```

Audit actions:

```ts
submitSftAudit(sourceMessageId, previousState, formData) -> Promise<AuditSubmissionState>
submitDpoAudit(sourceMessageId, previousState, formData) -> Promise<AuditSubmissionState>
```

### 3. Contracts

- Every protected data helper must require a verified Supabase profile/role before returning private data.
- `profiles.role` is the authority for workspace routing; do not infer role from login input or URL.
- School login IDs must resolve through the `find_login_email(p_login_id)` security-definer RPC before `signInWithPassword`; direct pre-auth `profiles` selects are blocked by RLS and must not be used as a fallback.
- Provider secrets are not stored/displayed as raw client-visible values. Store `secret_ref` + `secret_last_four`; server runtime keys (`OPENAI_API_KEY` or `AI_GATEWAY_API_KEY`) perform model calls.
- Provider readiness is capability-specific: `student_chat`, `teacher_chat`, `bloom_classification`, `project_classification`, `practice_generation`, `practice_evaluation`, `audit_assist`, `embedding`.
- Teacher audit inserts only after source assistant message is accessible and SFT/DPO required fields validate.
- Export batches are admin-only and must be generated only from approved audit records.
- RAG retrieval must generate a real embedding before calling `match_document_chunks`; missing embedding provider/key is a blocked state, not a fallback.
- `document_chunks.embedding` dimension is `1536`; changing embedding model/dimension requires migration + re-index.
- Migration application requires live/local Supabase execution (`supabase db push` or `supabase db reset`) before production use.

### 4. Validation & Error Matrix

| Condition | Required behavior | Assertion |
| --- | --- | --- |
| Missing profile | `missing_profile` DataResult | no workspace data returned |
| Wrong role | `forbidden` DataResult | no cross-role data leakage |
| Login by school ID before auth | `find_login_email` RPC | no direct RLS-blocked `profiles` query |
| Missing provider capability | blocked state | no model call |
| Missing server model key | blocked state | no canned AI output |
| Missing embedding key | blocked state | no RAG fallback |
| Invalid SFT fields | action returns field errors | no audit row inserted |
| Invalid DPO fields | action returns field errors | no audit row inserted |
| No approved audit records | export disabled/blocked | no empty fake export |
| User queries other user's chunks | zero rows | RLS/RPC scope enforced |
| Teacher queries unassigned class chunks | zero rows | teacher scope enforced |

### 5. Good/Base/Bad Cases

- Good: student chat verifies profile, checks `student_chat`, persists user/assistant messages, and returns AI SDK UI message stream.
- Good: teacher audit reads eligible assistant messages, resolves the latest source user prompt, and inserts SFT/DPO rows through server actions.
- Good: `retrieveDocumentChunks()` calls `embed()` with a real configured embedding model before RPC.
- Base: Supabase migration is authored and typechecked locally but still needs live DB application.
- Bad: `catch { return [] }` for private data loaders.
- Bad: `secret_ref` treated as a usable API key in client code.

### 6. Tests Required

- Local code: `cd frontend-new && npm run lint`.
- Local code: `cd frontend-new && npm run build`.
- Local code: `cd frontend-new && ./node_modules/.bin/tsc --noEmit --pretty false`.
- Static grep: no legacy/scaffold/fallback patterns in `frontend-new/src` and `frontend-new/supabase`.
- SQL static inspection: extension, RLS, policies, HNSW index, `match_document_chunks` RPC.
- Auth static inspection: `login_id` login path calls `find_login_email`, then verifies `profiles.role` only after Supabase Auth succeeds.
- External DB smoke (required before deploy): run migration against local/live Supabase, generate types, verify RLS + RPC with at least student, teacher, admin fixtures.

### 7. Wrong vs Correct

#### Wrong

```ts
const provider = configuredProvider ?? { model: 'mock', apiKey: 'demo' };
const chunks = await supabase.rpc('match_document_chunks', { query_embedding: [] });
```

#### Correct

```ts
const capability = await getCapability('embedding');
if (!capability.ok || !capability.data.ready) {
  return fail('blocked', '缺少 embedding 真实模型能力配置。');
}

const { embedding } = await embed({
  model: resolveEmbeddingModel(capability.data.modelId, capability.data.providerType, capability.data.baseUrl),
  value: query,
});

return matchDocumentChunks({ queryEmbedding: embedding, matchCount, matchThreshold, projectId });
```
