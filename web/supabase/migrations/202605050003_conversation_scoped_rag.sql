begin;

drop index if exists public.document_chunks_embedding_hnsw;

alter table public.documents
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;

alter table public.document_chunks
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;

alter table public.document_chunks
  alter column embedding type extensions.vector(768) using embedding::extensions.vector(768);

update public.document_chunks dc
set conversation_id = d.conversation_id
from public.documents d
where d.id = dc.document_id
  and dc.conversation_id is null;

create index if not exists documents_owner_conversation_idx
  on public.documents (owner_id, conversation_id)
  where conversation_id is not null;

create index if not exists document_chunks_conversation_id_idx
  on public.document_chunks (conversation_id)
  where conversation_id is not null;

create index document_chunks_embedding_hnsw
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

drop function if exists public.match_conversation_document_chunks(extensions.vector, uuid, integer, double precision);
create or replace function public.match_conversation_document_chunks(
  query_embedding extensions.vector(768),
  conversation_id uuid,
  match_count int default 6,
  match_threshold float default 0.25
)
returns table (id uuid, document_id uuid, owner_id uuid, class_id uuid, project_id uuid, conversation_id uuid, chunk_index integer, content text, metadata jsonb, document_title text, source_uri text, similarity float)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select dc.id, dc.document_id, dc.owner_id, dc.class_id, dc.project_id, dc.conversation_id, dc.chunk_index, dc.content, dc.metadata, d.title, d.source_uri, 1 - (dc.embedding <=> query_embedding)
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  join public.conversations c on c.id = dc.conversation_id
  where public.current_app_user_id() is not null
    and dc.conversation_id = $2
    and c.id = $2
    and c.owner_id = public.current_app_user_id()
    and dc.owner_id = public.current_app_user_id()
    and d.owner_id = public.current_app_user_id()
    and d.conversation_id = $2
    and 1 - (dc.embedding <=> query_embedding) >= match_threshold
  order by dc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 12)
$$;

notify pgrst, 'reload schema';
commit;
