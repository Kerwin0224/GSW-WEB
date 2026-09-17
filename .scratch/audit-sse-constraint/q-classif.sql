select created_at, level, event, route,
       left(coalesce(message,''),400) as msg,
       left(coalesce(context::text,''),600) as ctx
from public.app_log_events
where event ilike '%classif%' or context::text ilike '%classif%'
order by created_at;
