select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name in ('app_log_events','provider_configs','scenario_tier_bindings','capability_tier_bindings')
order by table_name, ordinal_position;
