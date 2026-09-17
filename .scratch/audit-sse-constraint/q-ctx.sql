select created_at, level, area, event, route, method, status, request_id,
       message, digest, context
from public.app_log_events
where route in ('/api/challenge/generate','/api/challenge/evaluate','/api/student/chat')
order by created_at;
