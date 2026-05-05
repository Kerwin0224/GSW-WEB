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

alter table public.provider_configs add column if not exists api_models jsonb not null default '[]'::jsonb;
alter table public.provider_configs add column if not exists last_health_check_at timestamptz;
alter table public.provider_configs add column if not exists last_health_latency_ms integer;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists model_tier_bindings_touch on public.model_tier_bindings;
create trigger model_tier_bindings_touch before update on public.model_tier_bindings for each row execute function public.touch_updated_at();

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

notify pgrst, 'reload schema';
