select id, name, provider_type, base_url, is_enabled, created_at, updated_at
from public.provider_configs order by created_at;

select * from public.scenario_tier_bindings order by 1;

select * from public.model_tier_bindings order by 1;

select * from public.provider_capabilities order by 1;
