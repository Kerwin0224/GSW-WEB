-- A) 所有 project_classification 相关事件，全年
select created_at, level, event, route,
       left(coalesce(context::text,''),400) as ctx
from public.app_log_events
where event ilike '%classif%' or context::text ilike '%classif%'
order by created_at;

-- B) 全表搜 "Invalid JSON response" / SSE / stream 相关
select created_at, level, area, event, route, status,
       left(coalesce(message,''),300) as msg, left(coalesce(context::text,''),500) as ctx
from public.app_log_events
where message ilike '%Invalid JSON%' or context::text ilike '%Invalid JSON%'
order by created_at;

-- C) 所有 event 名称 + 次数（看看有哪些埋点）
select area, event, level, count(*) as n, min(created_at) as first, max(created_at) as last
from public.app_log_events
group by area, event, level
order by area, event, level;
