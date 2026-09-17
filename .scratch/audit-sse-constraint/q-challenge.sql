select created_at, level, area, event, route, status,
       left(coalesce(message,''),400) as msg,
       left(coalesce(context::text,''),900) as ctx
from public.app_log_events
where event ilike '%challenge%' or event ilike '%practice%' or event ilike '%generat%'
order by created_at;
