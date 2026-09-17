select table_name
from information_schema.tables
where table_schema='public'
  and (table_name ilike '%bind%' or table_name ilike '%provider%' or table_name ilike '%capab%' or table_name ilike '%tier%' or table_name ilike '%model%')
order by table_name;
