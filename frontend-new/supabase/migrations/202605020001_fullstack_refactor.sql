
create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create type public.app_role as enum ('admin', 'teacher', 'student');
create type public.provider_capability as enum ('student_chat','teacher_chat','bloom_classification','project_classification','practice_generation','practice_evaluation','audit_assist','embedding');
create type public.prompt_preset_status as enum ('draft','published','disabled');
create type public.interaction_source as enum ('student_chat','teacher_chat','practice');
create type public.audit_kind as enum ('sft','dpo');
create type public.audit_status as enum ('pending','approved','rejected','exported');
create type public.export_status as enum ('queued','ready','failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  login_id text unique,
  display_name text not null,
  email text,
  role public.app_role not null,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  grade text,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_memberships (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null check (role in ('teacher','student')),
  created_at timestamptz not null default now(),
  unique (class_id, profile_id)
);

create table public.provider_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider_type text not null,
  base_url text,
  secret_ref text,
  secret_last_four text,
  is_enabled boolean not null default false,
  health_status text not null default 'unchecked' check (health_status in ('unchecked','healthy','failed','blocked')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_capabilities (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_configs(id) on delete cascade,
  capability public.provider_capability not null,
  model_id text not null,
  is_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  unique (provider_id, capability, model_id)
);

create table public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  endpoint text not null,
  health_status text not null default 'unchecked',
  enabled_tools jsonb not null default '[]'::jsonb,
  allowed_roles public.app_role[] not null default '{}'::public.app_role[],
  is_enabled boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prompt_presets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  scenario text not null,
  system_instruction text not null,
  user_template text,
  variables jsonb not null default '[]'::jsonb,
  target_role public.app_role not null default 'teacher',
  status public.prompt_preset_status not null default 'draft',
  version integer not null default 1,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.text_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id),
  title text not null,
  author text,
  text_type text not null default 'poem',
  classification_state text not null default 'pending' check (classification_state in ('pending','classified','failed','manual')),
  highest_bloom_level integer check (highest_bloom_level between 1 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, title, author)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id),
  project_id uuid references public.text_projects(id) on delete set null,
  source public.interaction_source not null,
  prompt_preset_id uuid references public.prompt_presets(id),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  parts jsonb,
  bloom_level integer check (bloom_level between 1 and 6),
  bloom_state text not null default 'pending' check (bloom_state in ('pending','classified','failed','unclassified')),
  model_id text,
  created_at timestamptz not null default now()
);


-- RAG corpus contract: 1536 dimensions aligns with CWB_EMBEDDING_DIMENSIONS=1536 / text-embedding-3-small.
-- Changing the embedding model or dimensions requires a re-index migration.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  project_id uuid references public.text_projects(id) on delete set null,
  title text not null,
  source_uri text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  project_id uuid references public.text_projects(id) on delete set null,
  chunk_index integer not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table public.practice_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.text_projects(id) on delete set null,
  target_bloom_level integer not null check (target_bloom_level between 1 and 6),
  prompt text,
  answer text,
  feedback text,
  achieved boolean,
  evaluation_state text not null default 'pending' check (evaluation_state in ('pending','evaluated','failed','blocked')),
  created_at timestamptz not null default now()
);

create table public.audit_records (
  id uuid primary key default gen_random_uuid(),
  source_message_id uuid references public.conversation_messages(id) on delete set null,
  source_conversation_id uuid references public.conversations(id) on delete set null,
  auditor_id uuid references public.profiles(id),
  class_id uuid references public.classes(id),
  kind public.audit_kind not null,
  status public.audit_status not null default 'pending',
  quality text,
  prompt text not null,
  original_answer text,
  corrected_answer text,
  chosen_answer text,
  rejected_answer text,
  rationale text,
  metadata jsonb not null default '{}'::jsonb,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.export_batches (
  id uuid primary key default gen_random_uuid(),
  export_type public.audit_kind not null,
  status public.export_status not null default 'ready',
  record_count integer not null default 0,
  jsonl text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger classes_touch before update on public.classes for each row execute function public.touch_updated_at();
create trigger provider_configs_touch before update on public.provider_configs for each row execute function public.touch_updated_at();
create trigger prompt_presets_touch before update on public.prompt_presets for each row execute function public.touch_updated_at();
create trigger text_projects_touch before update on public.text_projects for each row execute function public.touch_updated_at();
create trigger conversations_touch before update on public.conversations for each row execute function public.touch_updated_at();
create trigger documents_touch before update on public.documents for each row execute function public.touch_updated_at();
create trigger audit_records_touch before update on public.audit_records for each row execute function public.touch_updated_at();

create or replace function public.current_profile_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_profile_role() = 'admin'::public.app_role
$$;

create or replace function public.teacher_can_access_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_memberships cm
    where cm.class_id = p_class_id and cm.profile_id = auth.uid() and cm.role = 'teacher'
  )
$$;

create or replace function public.get_profile(p_user_id uuid)
returns setof public.profiles language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = p_user_id and (id = auth.uid() or public.is_admin())
$$;

create or replace function public.find_login_email(p_login_id text)
returns table(email text) language sql stable security definer set search_path = public as $$
  select p.email from public.profiles p where p.login_id = p_login_id and p.status = 'active' limit 1
$$;

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_memberships enable row level security;
alter table public.provider_configs enable row level security;
alter table public.provider_capabilities enable row level security;
alter table public.mcp_servers enable row level security;
alter table public.prompt_presets enable row level security;
alter table public.text_projects enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.practice_records enable row level security;
alter table public.audit_records enable row level security;
alter table public.export_batches enable row level security;

create policy profiles_self_or_admin_select on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin_all on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy classes_admin_all on public.classes for all using (public.is_admin()) with check (public.is_admin());
create policy classes_member_select on public.classes for select using (public.is_admin() or exists (select 1 from public.class_memberships cm where cm.class_id = id and cm.profile_id = auth.uid()));

create policy memberships_admin_all on public.class_memberships for all using (public.is_admin()) with check (public.is_admin());
create policy memberships_member_select on public.class_memberships for select using (public.is_admin() or profile_id = auth.uid() or public.teacher_can_access_class(class_id));

create policy provider_admin_all on public.provider_configs for all using (public.is_admin()) with check (public.is_admin());
create policy provider_caps_admin_all on public.provider_capabilities for all using (public.is_admin()) with check (public.is_admin());
create policy provider_caps_authenticated_read on public.provider_capabilities for select using (auth.uid() is not null and is_enabled);
create policy mcp_admin_all on public.mcp_servers for all using (public.is_admin()) with check (public.is_admin());

create policy presets_admin_all on public.prompt_presets for all using (public.is_admin()) with check (public.is_admin());
create policy presets_published_read on public.prompt_presets for select using (status = 'published' or public.is_admin());

create policy projects_owner_all on public.text_projects for all using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy projects_teacher_read on public.text_projects for select using (class_id is not null and public.teacher_can_access_class(class_id));

create policy conversations_owner_all on public.conversations for all using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy conversations_teacher_read on public.conversations for select using (class_id is not null and public.teacher_can_access_class(class_id));

create policy messages_conversation_scope on public.conversation_messages for select using (exists (select 1 from public.conversations c where c.id = conversation_id and (c.owner_id = auth.uid() or public.is_admin() or (c.class_id is not null and public.teacher_can_access_class(c.class_id)))));
create policy messages_owner_insert on public.conversation_messages for insert with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.owner_id = auth.uid()));


create policy documents_owner_all on public.documents for all
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy documents_teacher_read on public.documents for select
  using (class_id is not null and public.teacher_can_access_class(class_id));

create policy chunks_owner_all on public.document_chunks for all
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy chunks_teacher_read on public.document_chunks for select
  using (class_id is not null and public.teacher_can_access_class(class_id));

create index document_chunks_embedding_hnsw
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index document_chunks_document_id_idx on public.document_chunks (document_id);
create index document_chunks_project_id_idx on public.document_chunks (project_id) where project_id is not null;
create index documents_owner_project_idx on public.documents (owner_id, project_id) where project_id is not null;

create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1536),
  match_count int default 8,
  match_threshold float default 0.25,
  project_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  owner_id uuid,
  class_id uuid,
  project_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  document_title text,
  source_uri text,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    dc.id,
    dc.document_id,
    dc.owner_id,
    dc.class_id,
    dc.project_id,
    dc.chunk_index,
    dc.content,
    dc.metadata,
    d.title as document_title,
    d.source_uri,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where auth.uid() is not null
    and ($4 is null or dc.project_id = $4)
    and (
      dc.owner_id = auth.uid()
      or public.is_admin()
      or (dc.class_id is not null and public.teacher_can_access_class(dc.class_id))
    )
    and 1 - (dc.embedding <=> query_embedding) >= match_threshold
  order by dc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50)
$$;

create policy practice_student_all on public.practice_records for all using (student_id = auth.uid() or public.is_admin()) with check (student_id = auth.uid() or public.is_admin());
create policy practice_teacher_read on public.practice_records for select using (exists (select 1 from public.text_projects p where p.id = project_id and p.class_id is not null and public.teacher_can_access_class(p.class_id)));

create policy audit_teacher_admin_read on public.audit_records for select using (public.is_admin() or auditor_id = auth.uid() or (class_id is not null and public.teacher_can_access_class(class_id)));
create policy audit_teacher_insert on public.audit_records for insert with check (public.is_admin() or public.current_profile_role() = 'teacher'::public.app_role);
create policy audit_teacher_update on public.audit_records for update using (public.is_admin() or auditor_id = auth.uid()) with check (public.is_admin() or auditor_id = auth.uid());

create policy exports_admin_all on public.export_batches for all using (public.is_admin()) with check (public.is_admin());
