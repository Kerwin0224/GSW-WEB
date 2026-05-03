begin;

create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.runtime_secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.runtime_secrets from public;
revoke all on private.runtime_secrets from anon;
revoke all on private.runtime_secrets from authenticated;
insert into private.runtime_secrets (name, value, updated_at)
values ('cwb_auth_secret', '<configure-server-secret>', now())
on conflict (name) do update set value = excluded.value, updated_at = now();

do $$ begin
  create type public.app_role as enum ('admin', 'teacher', 'student');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.provider_capability as enum ('student_chat','teacher_chat','bloom_classification','project_classification','practice_generation','practice_evaluation','audit_assist','embedding');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.prompt_preset_status as enum ('draft','published','disabled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.interaction_source as enum ('student_chat','teacher_chat','practice');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.audit_kind as enum ('sft','dpo');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.audit_status as enum ('pending','approved','rejected','exported');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.export_status as enum ('queued','ready','failed');
exception when duplicate_object then null; end $$;

alter table public.profiles add column if not exists login_id text;
alter table public.profiles add column if not exists password_hash text;
create unique index if not exists profiles_login_id_key on public.profiles (login_id) where login_id is not null;
alter table public.classes add column if not exists created_by uuid references public.profiles(id);

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, private, extensions
as $$
  with headers as (
    select nullif(current_setting('request.headers', true), '')::jsonb as value
  ), secret as (
    select value from private.runtime_secrets where name = 'cwb_auth_secret'
  )
  select case
    when (select value from headers) ? 'x-cwb-user-id'
      and (select value from headers) ? 'x-cwb-session-signature'
      and (select value from headers) ->> 'x-cwb-session-signature' = encode(hmac(((select value from headers) ->> 'x-cwb-user-id')::bytea, (select value from secret)::bytea, 'sha256'), 'hex')
    then ((select value from headers) ->> 'x-cwb-user-id')::uuid
    else auth.uid()
  end
$$;

create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role::public.app_role from public.profiles where id = public.current_app_user_id() and status = 'active'
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_role() = 'admin'::public.app_role
$$;

create table if not exists public.class_memberships (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null check (role in ('teacher','student')),
  created_at timestamptz not null default now(),
  unique (class_id, profile_id)
);

insert into public.class_memberships (class_id, profile_id, role, created_at)
select class_id, student_id, 'student'::public.app_role, created_at from public.student_classes
on conflict (class_id, profile_id) do update set role = excluded.role;
insert into public.class_memberships (class_id, profile_id, role, created_at)
select class_id, teacher_id, 'teacher'::public.app_role, created_at from public.teacher_classes
on conflict (class_id, profile_id) do update set role = excluded.role;

create or replace function public.teacher_can_access_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_memberships cm
    where cm.class_id = p_class_id and cm.profile_id = public.current_app_user_id() and cm.role = 'teacher'
  )
$$;

alter table public.provider_configs add column if not exists provider_type text;
alter table public.provider_configs add column if not exists base_url text;
alter table public.provider_configs add column if not exists secret_ref text;
alter table public.provider_configs add column if not exists secret_last_four text;
alter table public.provider_configs add column if not exists is_enabled boolean;
alter table public.provider_configs add column if not exists health_status text;
alter table public.provider_configs add column if not exists created_by uuid references public.profiles(id);
update public.provider_configs set provider_type = coalesce(provider_type, 'openai-compatible'), is_enabled = coalesce(is_enabled, false), health_status = coalesce(health_status, 'blocked');
alter table public.provider_configs alter column provider_type set default 'openai-compatible';
alter table public.provider_configs alter column provider_type set not null;
alter table public.provider_configs alter column is_enabled set default false;
alter table public.provider_configs alter column is_enabled set not null;
alter table public.provider_configs alter column health_status set default 'unchecked';
alter table public.provider_configs alter column health_status set not null;

create table if not exists public.provider_capabilities (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_configs(id) on delete cascade,
  capability public.provider_capability not null,
  model_id text not null,
  is_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  unique (provider_id, capability, model_id)
);

alter table public.mcp_servers add column if not exists description text;
alter table public.mcp_servers add column if not exists connection_ref text;
alter table public.mcp_servers add column if not exists secret_ref text;
alter table public.mcp_servers add column if not exists secret_last_four text;
alter table public.mcp_servers add column if not exists health_status text;
alter table public.mcp_servers add column if not exists enabled_tools jsonb;
alter table public.mcp_servers add column if not exists allowed_roles public.app_role[];
alter table public.mcp_servers add column if not exists metadata jsonb;
alter table public.mcp_servers add column if not exists is_enabled boolean;
alter table public.mcp_servers add column if not exists created_by uuid references public.profiles(id);
update public.mcp_servers set health_status = coalesce(health_status, 'blocked'), enabled_tools = coalesce(enabled_tools, '[]'::jsonb), allowed_roles = coalesce(allowed_roles, '{}'::public.app_role[]), metadata = coalesce(metadata, '{}'::jsonb), is_enabled = coalesce(is_enabled, false);
alter table public.mcp_servers alter column health_status set default 'unchecked';
alter table public.mcp_servers alter column enabled_tools set default '[]'::jsonb;
alter table public.mcp_servers alter column allowed_roles set default '{}'::public.app_role[];
alter table public.mcp_servers alter column metadata set default '{}'::jsonb;
alter table public.mcp_servers alter column is_enabled set default false;

alter table public.prompt_presets add column if not exists scenario text;
alter table public.prompt_presets add column if not exists system_instruction text;
alter table public.prompt_presets add column if not exists user_template text;
alter table public.prompt_presets add column if not exists variables jsonb;
alter table public.prompt_presets add column if not exists target_role public.app_role;
alter table public.prompt_presets add column if not exists status public.prompt_preset_status;
alter table public.prompt_presets add column if not exists version integer;
alter table public.prompt_presets add column if not exists created_by uuid references public.profiles(id);
alter table public.prompt_presets alter column owner_id drop not null;
update public.prompt_presets set scenario = coalesce(scenario, '课堂教学'), system_instruction = coalesce(system_instruction, ''), variables = coalesce(variables, '[]'::jsonb), target_role = coalesce(target_role, 'teacher'::public.app_role), status = coalesce(status, 'draft'::public.prompt_preset_status), version = coalesce(version, 1);
alter table public.prompt_presets alter column scenario set default '课堂教学';
alter table public.prompt_presets alter column system_instruction set default '';
alter table public.prompt_presets alter column variables set default '[]'::jsonb;
alter table public.prompt_presets alter column target_role set default 'teacher';
alter table public.prompt_presets alter column status set default 'draft';
alter table public.prompt_presets alter column version set default 1;

create table if not exists public.text_projects (
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
insert into public.text_projects (id, owner_id, title, author, text_type, created_at, updated_at)
select id, student_id, title, author, 'poem', created_at, updated_at from public.learning_projects
on conflict (id) do nothing;

alter table public.conversations add column if not exists class_id uuid references public.classes(id);
alter table public.conversations add column if not exists source public.interaction_source;
alter table public.conversations add column if not exists prompt_preset_id uuid references public.prompt_presets(id);
update public.conversations set source = coalesce(source, 'student_chat'::public.interaction_source);
alter table public.conversations drop constraint if exists conversations_project_id_fkey;
alter table public.conversations add constraint conversations_project_id_fkey foreign key (project_id) references public.text_projects(id) on delete set null;
alter table public.conversations alter column source set not null;

create table if not exists public.conversation_messages (
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
insert into public.conversation_messages (id, conversation_id, role, content, model_id, created_at)
select id, conversation_id, role, content, model_id, created_at from public.messages
on conflict (id) do nothing;

alter table public.documents add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.documents add column if not exists project_id uuid references public.text_projects(id) on delete set null;
alter table public.document_chunks add column if not exists owner_id uuid references public.profiles(id) on delete cascade;
alter table public.document_chunks add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.document_chunks add column if not exists project_id uuid references public.text_projects(id) on delete set null;
update public.document_chunks dc set owner_id = d.owner_id, class_id = d.class_id, project_id = d.project_id from public.documents d where d.id = dc.document_id and dc.owner_id is null;

alter table public.practice_records add column if not exists student_id uuid references public.profiles(id) on delete cascade;
alter table public.practice_records add column if not exists project_id uuid references public.text_projects(id) on delete set null;
alter table public.practice_records add column if not exists target_bloom_level integer;
alter table public.practice_records add column if not exists prompt text;
alter table public.practice_records add column if not exists answer text;
alter table public.practice_records add column if not exists feedback text;
alter table public.practice_records add column if not exists achieved boolean;
alter table public.practice_records add column if not exists evaluation_state text not null default 'pending';

alter table public.audit_records add column if not exists source_message_id uuid references public.conversation_messages(id) on delete set null;
alter table public.audit_records add column if not exists source_conversation_id uuid references public.conversations(id) on delete set null;
alter table public.audit_records add column if not exists class_id uuid references public.classes(id);
alter table public.audit_records add column if not exists kind public.audit_kind;
alter table public.audit_records add column if not exists quality text;
alter table public.audit_records add column if not exists prompt text;
alter table public.audit_records add column if not exists original_answer text;
alter table public.audit_records add column if not exists corrected_answer text;
alter table public.audit_records add column if not exists chosen_answer text;
alter table public.audit_records add column if not exists rejected_answer text;
alter table public.audit_records add column if not exists rationale text;
alter table public.audit_records add column if not exists metadata jsonb;
alter table public.audit_records add column if not exists exported_at timestamptz;
update public.audit_records set metadata = coalesce(metadata, '{}'::jsonb), prompt = coalesce(prompt, '') where true;

create table if not exists public.export_batches (
  id uuid primary key default gen_random_uuid(),
  export_type public.audit_kind not null,
  status public.export_status not null default 'ready',
  record_count integer not null default 0,
  jsonl text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

drop function if exists public.get_profile(uuid);
create or replace function public.get_profile(p_user_id uuid)
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = p_user_id and (id = public.current_app_user_id() or public.is_admin())
$$;

create or replace function public.authenticate_school_account(p_login_id text, p_password text)
returns table (id uuid, login_id text, role public.app_role, display_name text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.id, p.login_id, p.role::public.app_role, p.display_name
  from public.profiles p
  where p.login_id = p_login_id
    and p.status = 'active'
    and p.login_id ~ '^\d{8}$'
    and p.password_hash is not null
    and p.password_hash = crypt(p_password, p.password_hash)
$$;

drop function if exists public.match_document_chunks(extensions.vector, integer, double precision);
create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1536),
  match_count int default 8,
  match_threshold float default 0.25,
  project_id uuid default null
)
returns table (id uuid, document_id uuid, owner_id uuid, class_id uuid, project_id uuid, chunk_index integer, content text, metadata jsonb, document_title text, source_uri text, similarity float)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select dc.id, dc.document_id, dc.owner_id, dc.class_id, dc.project_id, dc.chunk_index, dc.content, dc.metadata, d.title, d.source_uri, 1 - (dc.embedding <=> query_embedding)
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where public.current_app_user_id() is not null
    and ($4 is null or dc.project_id = $4)
    and (dc.owner_id = public.current_app_user_id() or public.is_admin() or (dc.class_id is not null and public.teacher_can_access_class(dc.class_id)))
    and 1 - (dc.embedding <=> query_embedding) >= match_threshold
  order by dc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50)
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

drop policy if exists profiles_app_select on public.profiles;
drop policy if exists profiles_app_admin_all on public.profiles;
create policy profiles_app_select on public.profiles for select using (id = public.current_app_user_id() or public.is_admin());
create policy profiles_app_admin_all on public.profiles for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists classes_app_admin_all on public.classes;
drop policy if exists classes_app_member_select on public.classes;
create policy classes_app_admin_all on public.classes for all using (public.is_admin()) with check (public.is_admin());
create policy classes_app_member_select on public.classes for select using (public.is_admin() or exists (select 1 from public.class_memberships cm where cm.class_id = classes.id and cm.profile_id = public.current_app_user_id()));

drop policy if exists memberships_admin_all on public.class_memberships;
drop policy if exists memberships_member_select on public.class_memberships;
create policy memberships_admin_all on public.class_memberships for all using (public.is_admin()) with check (public.is_admin());
create policy memberships_member_select on public.class_memberships for select using (public.is_admin() or profile_id = public.current_app_user_id() or public.teacher_can_access_class(class_id));

drop policy if exists provider_app_admin_all on public.provider_configs;
create policy provider_app_admin_all on public.provider_configs for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists provider_caps_admin_all on public.provider_capabilities;
drop policy if exists provider_caps_authenticated_read on public.provider_capabilities;
create policy provider_caps_admin_all on public.provider_capabilities for all using (public.is_admin()) with check (public.is_admin());
create policy provider_caps_authenticated_read on public.provider_capabilities for select using (public.current_app_user_id() is not null and is_enabled);

drop policy if exists mcp_app_admin_all on public.mcp_servers;
create policy mcp_app_admin_all on public.mcp_servers for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists presets_app_admin_all on public.prompt_presets;
drop policy if exists presets_app_published_read on public.prompt_presets;
create policy presets_app_admin_all on public.prompt_presets for all using (public.is_admin()) with check (public.is_admin());
create policy presets_app_published_read on public.prompt_presets for select using (status = 'published' or public.is_admin());

drop policy if exists projects_owner_all on public.text_projects;
drop policy if exists projects_teacher_read on public.text_projects;
create policy projects_owner_all on public.text_projects for all using (owner_id = public.current_app_user_id() or public.is_admin()) with check (owner_id = public.current_app_user_id() or public.is_admin());
create policy projects_teacher_read on public.text_projects for select using (class_id is not null and public.teacher_can_access_class(class_id));

drop policy if exists conversations_owner_all on public.conversations;
drop policy if exists conversations_teacher_read on public.conversations;
create policy conversations_owner_all on public.conversations for all using (owner_id = public.current_app_user_id() or public.is_admin()) with check (owner_id = public.current_app_user_id() or public.is_admin());
create policy conversations_teacher_read on public.conversations for select using (class_id is not null and public.teacher_can_access_class(class_id));

drop policy if exists messages_conversation_scope on public.conversation_messages;
drop policy if exists messages_owner_insert on public.conversation_messages;
create policy messages_conversation_scope on public.conversation_messages for select using (exists (select 1 from public.conversations c where c.id = conversation_id and (c.owner_id = public.current_app_user_id() or public.is_admin() or (c.class_id is not null and public.teacher_can_access_class(c.class_id)))));
create policy messages_owner_insert on public.conversation_messages for insert with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.owner_id = public.current_app_user_id()));

drop policy if exists documents_app_owner_all on public.documents;
drop policy if exists documents_app_teacher_read on public.documents;
create policy documents_app_owner_all on public.documents for all using (owner_id = public.current_app_user_id() or public.is_admin()) with check (owner_id = public.current_app_user_id() or public.is_admin());
create policy documents_app_teacher_read on public.documents for select using (class_id is not null and public.teacher_can_access_class(class_id));

drop policy if exists chunks_app_owner_all on public.document_chunks;
drop policy if exists chunks_app_teacher_read on public.document_chunks;
create policy chunks_app_owner_all on public.document_chunks for all using (owner_id = public.current_app_user_id() or public.is_admin()) with check (owner_id = public.current_app_user_id() or public.is_admin());
create policy chunks_app_teacher_read on public.document_chunks for select using (class_id is not null and public.teacher_can_access_class(class_id));

drop policy if exists practice_app_student_all on public.practice_records;
drop policy if exists practice_app_teacher_read on public.practice_records;
create policy practice_app_student_all on public.practice_records for all using (student_id = public.current_app_user_id() or public.is_admin()) with check (student_id = public.current_app_user_id() or public.is_admin());
create policy practice_app_teacher_read on public.practice_records for select using (exists (select 1 from public.text_projects p where p.id = project_id and p.class_id is not null and public.teacher_can_access_class(p.class_id)));

drop policy if exists audit_app_teacher_admin_read on public.audit_records;
drop policy if exists audit_app_teacher_insert on public.audit_records;
drop policy if exists audit_app_teacher_update on public.audit_records;
create policy audit_app_teacher_admin_read on public.audit_records for select using (public.is_admin() or auditor_id = public.current_app_user_id() or (class_id is not null and public.teacher_can_access_class(class_id)));
create policy audit_app_teacher_insert on public.audit_records for insert with check (public.is_admin() or public.current_profile_role() = 'teacher'::public.app_role);
create policy audit_app_teacher_update on public.audit_records for update using (public.is_admin() or auditor_id = public.current_app_user_id()) with check (public.is_admin() or auditor_id = public.current_app_user_id());

drop policy if exists exports_app_admin_all on public.export_batches;
create policy exports_app_admin_all on public.export_batches for all using (public.is_admin()) with check (public.is_admin());

update public.profiles set login_id = null where login_id in ('20240001','20240002','20260101') and id not in ('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000011');

insert into public.profiles (id, login_id, display_name, role, status, password_hash)
select id, login_id, display_name, role, 'active', crypt(login_id, gen_salt('bf'))
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid,'20240001','教务管理员','admin'),
  ('a0000000-0000-0000-0000-000000000002'::uuid,'20240002','李老师','teacher'),
  ('a0000000-0000-0000-0000-000000000011'::uuid,'20260101','王同学','student')
) as seed(id, login_id, display_name, role)
where exists (select 1 from auth.users u where u.id = seed.id)
on conflict (id) do update set login_id = excluded.login_id, display_name = excluded.display_name, role = excluded.role, status = excluded.status, password_hash = excluded.password_hash, updated_at = now();

insert into public.classes (id, name, grade, status, created_by)
values ('b0000000-0000-0000-0000-000000000101','高一(1)班','高一','active','a0000000-0000-0000-0000-000000000001')
on conflict (id) do update set name = excluded.name, grade = excluded.grade, status = excluded.status, created_by = excluded.created_by, updated_at = now();

insert into public.class_memberships (class_id, profile_id, role)
values
  ('b0000000-0000-0000-0000-000000000101','a0000000-0000-0000-0000-000000000002','teacher'),
  ('b0000000-0000-0000-0000-000000000101','a0000000-0000-0000-0000-000000000011','student')
on conflict (class_id, profile_id) do update set role = excluded.role;

insert into public.text_projects (id, owner_id, class_id, title, author, text_type, classification_state, highest_bloom_level)
values ('c0000000-0000-0000-0000-000000000101','a0000000-0000-0000-0000-000000000011','b0000000-0000-0000-0000-000000000101','静夜思','李白','poem','manual',3)
on conflict (id) do update set owner_id = excluded.owner_id, class_id = excluded.class_id, title = excluded.title, author = excluded.author, text_type = excluded.text_type, classification_state = excluded.classification_state, highest_bloom_level = excluded.highest_bloom_level, updated_at = now();

insert into public.prompt_presets (id, title, scenario, system_instruction, user_template, variables, target_role, status, version, created_by, owner_id, teaching_scenario, user_prompt_template, enabled)
values ('d0000000-0000-0000-0000-000000000101','古诗文课堂追问','课堂追问','你是古诗文教学助手。只围绕文本、背景、字词、意象、情感和表达设计可审阅的课堂追问。','围绕《{{title}}》为{{grade}}学生设计三层追问。','["title","grade"]'::jsonb,'teacher','published',1,'a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','课堂追问','围绕《{{title}}》为{{grade}}学生设计三层追问。',true)
on conflict (id) do update set title = excluded.title, scenario = excluded.scenario, system_instruction = excluded.system_instruction, user_template = excluded.user_template, variables = excluded.variables, target_role = excluded.target_role, status = excluded.status, version = excluded.version, created_by = excluded.created_by, owner_id = excluded.owner_id, teaching_scenario = excluded.teaching_scenario, user_prompt_template = excluded.user_prompt_template, enabled = excluded.enabled, updated_at = now();

notify pgrst, 'reload schema';
commit;
