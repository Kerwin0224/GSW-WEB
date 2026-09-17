select name, provider_type, base_url, is_enabled, health_status,
       last_health_check_at, last_health_latency_ms, secret_last_four,
       (api_models is null) as models_null, jsonb_array_length(coalesce(api_models,'[]'::jsonb)) as n_models,
       updated_at
from public.provider_configs order by created_at;
