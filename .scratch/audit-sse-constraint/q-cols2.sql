select table_name, column_name from information_schema.columns
where table_schema='public' and table_name in ('scenario_tier_bindings','model_tier_bindings')
order by table_name, ordinal_position;
