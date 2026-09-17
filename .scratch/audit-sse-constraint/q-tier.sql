select tier, school_id::text as school, provider_id::text as provider, model_id, is_enabled, metadata, updated_at
from public.model_tier_bindings order by tier, school nulls first;
