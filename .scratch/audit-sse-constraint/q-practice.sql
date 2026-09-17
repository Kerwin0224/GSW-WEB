select count(*) as total,
       min(created_at) as first, max(created_at) as last,
       count(*) filter (where created_at > '2026-09-11') as after_incident
from public.practice_records;
