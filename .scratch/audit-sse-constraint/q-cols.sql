select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='provider_configs' order by ordinal_position;
