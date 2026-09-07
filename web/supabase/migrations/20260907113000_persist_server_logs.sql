alter table public.app_log_events
  add constraint app_log_events_pkey primary key (id);

create or replace function public.write_app_log_event(
  p_event_id uuid,
  p_level text,
  p_area text,
  p_event text,
  p_route text,
  p_method text,
  p_status integer,
  p_request_id text,
  p_message text,
  p_digest text,
  p_context jsonb,
  p_server_signature text
)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
begin
  if not coalesce(
    p_server_signature = (
      select encode(
        extensions.hmac(('log:' || p_event_id::text)::bytea, secrets.value::bytea, 'sha256'),
        'hex'
      )
      from private.runtime_secrets as secrets
      where secrets.name = 'cwb_auth_secret'
    ),
    false
  ) then
    raise exception 'server log signature required' using errcode = '42501';
  end if;

  insert into public.app_log_events (
    id,
    level,
    area,
    event,
    route,
    method,
    status,
    request_id,
    message,
    digest,
    context
  ) values (
    p_event_id,
    p_level,
    p_area,
    p_event,
    p_route,
    p_method,
    p_status,
    p_request_id,
    p_message,
    p_digest,
    p_context
  );
end
$$;

revoke all on function public.write_app_log_event(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text) from public, authenticated;
grant execute on function public.write_app_log_event(uuid, text, text, text, text, text, integer, text, text, text, jsonb, text) to anon, service_role;
