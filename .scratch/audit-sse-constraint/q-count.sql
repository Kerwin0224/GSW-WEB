select min(created_at) as first_ts, max(created_at) as last_ts, count(*) as total from public.app_log_events;
