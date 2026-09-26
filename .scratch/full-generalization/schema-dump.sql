select table_name as tbl, string_agg(column_name || ':' || data_type || case when is_nullable='NO' then '!' else '' end, ', ' order by ordinal_position)
from information_schema.columns
where table_schema='public'
  and table_name in ('profiles','schools','organizations','classes','class_memberships','spaces','space_members','space_classes',
                     'projects','conversations','conversation_messages','documents','document_chunks',
                     'practice_records','audit_records','prompt_presets','app_log_events','provider_configs','mcp_servers','data_quality_events')
group by table_name order by table_name;
