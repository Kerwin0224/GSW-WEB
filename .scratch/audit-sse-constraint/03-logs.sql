-- 1) 全表时间范围
select min(created_at) as first_ts, max(created_at) as last_ts, count(*) as total
from public.app_log_events;

-- 2) 与 classification 相关的一切事件（不限时间）
select created_at, level, area, event, route, status, left(coalesce(message,''),300) as msg,
       left(coalesce(context::text,''),600) as ctx
from public.app_log_events
where event ilike '%classif%'
   or message ilike '%classif%'
   or area ilike '%classif%'
order by created_at;

-- 3) 2026-09-10 ~ 2026-09-13 所有 error/warn
select created_at, level, area, event, route, status, left(coalesce(message,''),400) as msg,
       left(coalesce(context::text,''),800) as ctx
from public.app_log_events
where created_at >= '2026-09-10' and created_at < '2026-09-14'
  and level in ('error','warn')
order by created_at;
