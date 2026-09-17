select 'capabilities' as src, capability as k, school_id::text as school, provider_id::text as provider, model_id as model, is_enabled
from public.provider_capabilities
union all
select 'scenario_tier_bindings', scenario, school_id::text, provider_id::text, model_id, is_enabled
from public.scenario_tier_bindings
union all
select 'model_tier_bindings', tier, school_id::text, provider_id::text, model_id, is_enabled
from public.model_tier_bindings
order by src, k, school nulls first;
