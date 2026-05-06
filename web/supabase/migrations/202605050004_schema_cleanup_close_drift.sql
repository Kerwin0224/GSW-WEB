begin;

create table if not exists public.model_tier_bindings (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('flash','advanced')),
  provider_id uuid not null references public.provider_configs(id) on delete restrict,
  model_id text not null check (length(trim(model_id)) > 0),
  is_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tier)
);

alter table public.provider_configs
  add column if not exists api_models jsonb not null default '[]'::jsonb,
  add column if not exists secret_created_at timestamptz,
  add column if not exists secret_last_used_at timestamptz,
  add column if not exists secret_rotated_at timestamptz,
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_health_latency_ms integer;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists model_tier_bindings_touch on public.model_tier_bindings;
create trigger model_tier_bindings_touch
before update on public.model_tier_bindings
for each row execute function public.touch_updated_at();

alter table public.model_tier_bindings enable row level security;

drop policy if exists model_tier_bindings_admin_all on public.model_tier_bindings;
drop policy if exists model_tier_bindings_authenticated_read on public.model_tier_bindings;
create policy model_tier_bindings_admin_all on public.model_tier_bindings
  for all using (public.is_admin()) with check (public.is_admin());
create policy model_tier_bindings_authenticated_read on public.model_tier_bindings
  for select using (public.current_app_user_id() is not null and is_enabled);

drop policy if exists provider_configs_app_model_routing_read on public.provider_configs;
create policy provider_configs_app_model_routing_read on public.provider_configs
  for select using (
    public.current_app_user_id() is not null
    and is_enabled
    and (
      exists (
        select 1 from public.model_tier_bindings mtb
        where mtb.provider_id = provider_configs.id
          and mtb.is_enabled
      )
      or exists (
        select 1 from public.provider_capabilities pc
        where pc.provider_id = provider_configs.id
          and pc.capability = 'embedding'::public.provider_capability
          and pc.is_enabled
      )
    )
  );

with flash_candidate as (
  select pc.provider_id, pc.model_id
  from public.provider_capabilities pc
  join public.provider_configs p on p.id = pc.provider_id
  where pc.is_enabled
    and p.is_enabled
    and nullif(trim(pc.model_id), '') is not null
    and pc.capability in ('student_chat','bloom_classification','project_classification','practice_generation')
  order by
    case pc.capability
      when 'student_chat' then 1
      when 'bloom_classification' then 2
      when 'project_classification' then 3
      when 'practice_generation' then 4
      else 99
    end,
    p.name,
    pc.provider_id,
    pc.model_id
  limit 1
)
insert into public.model_tier_bindings (tier, provider_id, model_id, is_enabled, metadata)
select 'flash', provider_id, model_id, true, jsonb_build_object('seeded_from', 'provider_capabilities')
from flash_candidate
on conflict (tier) do nothing;

with advanced_candidate as (
  select pc.provider_id, pc.model_id
  from public.provider_capabilities pc
  join public.provider_configs p on p.id = pc.provider_id
  where pc.is_enabled
    and p.is_enabled
    and nullif(trim(pc.model_id), '') is not null
    and pc.capability in ('teacher_chat','practice_evaluation','audit_assist')
  order by
    case pc.capability
      when 'teacher_chat' then 1
      when 'practice_evaluation' then 2
      when 'audit_assist' then 3
      else 99
    end,
    p.name,
    pc.provider_id,
    pc.model_id
  limit 1
)
insert into public.model_tier_bindings (tier, provider_id, model_id, is_enabled, metadata)
select 'advanced', provider_id, model_id, true, jsonb_build_object('seeded_from', 'provider_capabilities')
from advanced_candidate
on conflict (tier) do nothing;

insert into public.class_memberships (class_id, profile_id, role, created_at)
select tc.class_id, tc.teacher_id, 'teacher'::public.app_role, tc.created_at
from public.teacher_classes tc
on conflict (class_id, profile_id) do nothing;

insert into public.class_memberships (class_id, profile_id, role, created_at)
select sc.class_id, sc.student_id, 'student'::public.app_role, sc.created_at
from public.student_classes sc
on conflict (class_id, profile_id) do nothing;

drop policy if exists provider_admin on public.provider_configs;
drop policy if exists provider_admin_all on public.provider_configs;
drop policy if exists provider_app_admin_all on public.provider_configs;
drop policy if exists provider_configs_app_enabled_read on public.provider_configs;
create policy provider_app_admin_all on public.provider_configs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists mcp_admin on public.mcp_servers;
drop policy if exists mcp_admin_all on public.mcp_servers;
drop policy if exists mcp_app_admin_all on public.mcp_servers;
create policy mcp_app_admin_all on public.mcp_servers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists presets_all_admin on public.prompt_presets;
drop policy if exists presets_admin_all on public.prompt_presets;
drop policy if exists presets_app_admin_all on public.prompt_presets;
drop policy if exists presets_app_published_read on public.prompt_presets;
drop policy if exists presets_published_read on public.prompt_presets;
drop policy if exists presets_select_all_auth on public.prompt_presets;
create policy presets_app_admin_all on public.prompt_presets
  for all using (public.is_admin()) with check (public.is_admin());
create policy presets_app_published_read on public.prompt_presets
  for select using (status = 'published'::public.prompt_preset_status or public.is_admin());

drop policy if exists conv_insert_own on public.conversations;
drop policy if exists conv_select_own on public.conversations;
drop policy if exists conv_select_teacher_class on public.conversations;
drop policy if exists conv_update_own on public.conversations;
drop policy if exists conversations_owner_all on public.conversations;
drop policy if exists conversations_teacher_read on public.conversations;
create policy conversations_owner_all on public.conversations
  for all using (owner_id = public.current_app_user_id() or public.is_admin())
  with check (owner_id = public.current_app_user_id() or public.is_admin());
create policy conversations_teacher_read on public.conversations
  for select using (class_id is not null and public.teacher_can_access_class(class_id));

drop policy if exists practice_insert_own on public.practice_records;
drop policy if exists practice_select_own on public.practice_records;
drop policy if exists practice_select_teacher on public.practice_records;
drop policy if exists practice_student_all on public.practice_records;
drop policy if exists practice_teacher_read on public.practice_records;
drop policy if exists practice_app_student_all on public.practice_records;
drop policy if exists practice_app_teacher_read on public.practice_records;
create policy practice_app_student_all on public.practice_records
  for all using (student_id = public.current_app_user_id() or public.is_admin())
  with check (student_id = public.current_app_user_id() or public.is_admin());
create policy practice_app_teacher_read on public.practice_records
  for select using (
    exists (
      select 1
      from public.text_projects p
      where p.id = practice_records.project_id
        and p.class_id is not null
        and public.teacher_can_access_class(p.class_id)
    )
  );

drop policy if exists audit_insert_teacher on public.audit_records;
drop policy if exists audit_select_admin on public.audit_records;
drop policy if exists audit_select_own on public.audit_records;
drop policy if exists audit_teacher_admin_read on public.audit_records;
drop policy if exists audit_teacher_insert on public.audit_records;
drop policy if exists audit_teacher_update on public.audit_records;
drop policy if exists audit_update_own on public.audit_records;
drop policy if exists audit_app_teacher_admin_read on public.audit_records;
drop policy if exists audit_app_teacher_insert on public.audit_records;
drop policy if exists audit_app_teacher_update on public.audit_records;
create policy audit_app_teacher_admin_read on public.audit_records
  for select using (
    public.is_admin()
    or auditor_id = public.current_app_user_id()
    or (class_id is not null and public.teacher_can_access_class(class_id))
  );
create policy audit_app_teacher_insert on public.audit_records
  for insert with check (public.is_admin() or public.current_profile_role() = 'teacher'::public.app_role);
create policy audit_app_teacher_update on public.audit_records
  for update using (public.is_admin() or auditor_id = public.current_app_user_id())
  with check (public.is_admin() or auditor_id = public.current_app_user_id());

update public.provider_configs
set
  secret_ref = coalesce(secret_ref, api_key_encrypted),
  is_enabled = coalesce(is_enabled, enabled, false),
  api_models = case
    when api_models = '[]'::jsonb and coalesce(array_length(models, 1), 0) > 0 then (
      select coalesce(jsonb_agg(jsonb_build_object('id', model_id, 'ownedBy', null)), '[]'::jsonb)
      from unnest(models) as model_id
    )
    else api_models
  end,
  secret_created_at = coalesce(secret_created_at, created_at),
  secret_rotated_at = coalesce(secret_rotated_at, created_at),
  health_status = coalesce(nullif(trim(health_status), ''), 'unchecked')
where
  api_key_encrypted is not null
  or enabled is not null
  or coalesce(array_length(models, 1), 0) > 0
  or secret_created_at is null
  or secret_rotated_at is null
  or nullif(trim(health_status), '') is null;

alter table public.provider_configs
  alter column base_url drop not null,
  alter column created_by drop not null;

alter table public.provider_configs
  drop column if exists api_key_encrypted,
  drop column if exists models,
  drop column if exists enabled,
  drop column if exists default_params;

update public.prompt_presets
set
  scenario = coalesce(nullif(trim(scenario), ''), nullif(trim(teaching_scenario), ''), title),
  user_template = coalesce(user_template, user_prompt_template),
  target_role = coalesce(target_role, 'teacher'::public.app_role),
  status = coalesce(status, case when enabled then 'published'::public.prompt_preset_status else 'draft'::public.prompt_preset_status end),
  created_by = coalesce(created_by, owner_id);

alter table public.prompt_presets
  alter column scenario set not null,
  alter column target_role set default 'teacher'::public.app_role,
  alter column target_role set not null,
  alter column status set default 'draft'::public.prompt_preset_status,
  alter column status set not null;

alter table public.prompt_presets
  drop column if exists teaching_scenario,
  drop column if exists user_prompt_template,
  drop column if exists enabled,
  drop column if exists owner_id;

update public.mcp_servers
set
  connection_ref = coalesce(
    nullif(trim(connection_ref), ''),
    case
      when transport = 'stdio' and nullif(trim(command_or_url), '') is not null then 'stdio:' || trim(command_or_url)
      else nullif(trim(command_or_url), '')
    end
  ),
  health_status = coalesce(nullif(trim(health_status), ''), 'unchecked'),
  enabled_tools = coalesce(enabled_tools, '[]'::jsonb),
  allowed_roles = coalesce(
    allowed_roles,
    (
      select coalesce(array_agg(role_value::public.app_role), '{}'::public.app_role[])
      from unnest(coalesce(visible_to, array[]::text[])) as role_value
      where role_value in ('admin', 'teacher', 'student')
    )
  ),
  metadata = coalesce(metadata, '{}'::jsonb)
    || case
      when coalesce(env_vars, '{}'::jsonb) = '{}'::jsonb then '{}'::jsonb
      else jsonb_build_object('legacy_env_vars', env_vars)
    end,
  is_enabled = coalesce(is_enabled, enabled, false);

alter table public.mcp_servers
  alter column created_by drop not null,
  alter column health_status set default 'unchecked',
  alter column health_status set not null,
  alter column enabled_tools set default '[]'::jsonb,
  alter column enabled_tools set not null,
  alter column allowed_roles set default '{}'::public.app_role[],
  alter column allowed_roles set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column is_enabled set default false,
  alter column is_enabled set not null;

alter table public.mcp_servers
  drop column if exists transport,
  drop column if exists command_or_url,
  drop column if exists env_vars,
  drop column if exists enabled,
  drop column if exists visible_to;

alter table public.conversations
  alter column title drop not null;

drop table if exists public.bloom_annotations;
drop table if exists public.messages;

drop policy if exists classes_select_teacher on public.classes;
drop policy if exists sc_select_teacher on public.student_classes;
drop policy if exists projects_insert_own on public.learning_projects;
drop policy if exists projects_select_own on public.learning_projects;
drop policy if exists projects_select_teacher_class on public.learning_projects;
drop policy if exists projects_update_own on public.learning_projects;

alter table public.conversations
  drop constraint if exists conversations_workspace_type_check;

alter table public.conversations
  drop column if exists workspace_type;

update public.practice_records
set
  prompt = coalesce(prompt, question),
  answer = coalesce(answer, student_answer),
  feedback = coalesce(feedback, evaluation);

alter table public.practice_records
  drop constraint if exists practice_records_project_id_fkey;

alter table public.practice_records
  add constraint practice_records_project_id_fkey
  foreign key (project_id) references public.text_projects(id) on delete set null;

alter table public.practice_records
  alter column project_id drop not null,
  alter column achieved drop not null;

alter table public.practice_records
  drop column if exists question,
  drop column if exists student_answer,
  drop column if exists evaluation,
  drop column if exists model_metadata;

update public.audit_records
set
  kind = coalesce(kind, dataset_type::public.audit_kind),
  prompt = coalesce(prompt, original_prompt),
  rationale = coalesce(rationale, preference_rationale),
  metadata = coalesce(metadata, source_metadata, '{}'::jsonb),
  quality = coalesce(
    quality,
    case
      when quality_score >= 4 then 'accurate'
      when quality_score = 3 then 'medium'
      when quality_score is not null then 'needs_correction'
      else null
    end
  );

delete from public.audit_records
where
  source_message_id is null
  or source_conversation_id is null
  or kind is null
  or coalesce(btrim(prompt), '') = '';

alter table public.audit_records
  alter column auditor_id drop not null,
  alter column original_answer drop not null,
  alter column kind set not null,
  alter column prompt set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

alter table public.audit_records
  drop constraint if exists audit_records_status_check,
  drop constraint if exists audit_records_dataset_type_check,
  drop constraint if exists audit_records_source_type_check,
  drop constraint if exists audit_records_quality_score_check;

alter table public.audit_records
  alter column status drop default,
  alter column status type public.audit_status using status::public.audit_status,
  alter column status set default 'pending'::public.audit_status,
  alter column status set not null;

drop index if exists public.idx_audit_dataset_type;
create index if not exists idx_audit_kind on public.audit_records (kind);
create index if not exists idx_audit_source_message_id on public.audit_records (source_message_id);
create index if not exists idx_audit_source_conversation_id on public.audit_records (source_conversation_id);

alter table public.audit_records
  drop column if exists source_type,
  drop column if exists source_id,
  drop column if exists dataset_type,
  drop column if exists original_prompt,
  drop column if exists preference_rationale,
  drop column if exists quality_score,
  drop column if exists source_metadata;


alter table public.classes
  drop column if exists class_code;

alter table public.profiles
  drop column if exists external_code;

drop table if exists public.dataset_export_items;
drop table if exists public.dataset_exports;
drop table if exists public.user_import_rows;
drop table if exists public.user_import_batches;
drop table if exists public.messages;
drop table if exists public.bloom_annotations;
drop table if exists public.model_routes;
drop table if exists public.student_classes;
drop table if exists public.teacher_classes;
drop table if exists public.learning_projects;

notify pgrst, 'reload schema';
commit;
