create schema if not exists private;
alter schema private owner to postgres;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.runtime_secrets (
  name text primary key,
  value text not null
);

alter table private.runtime_secrets owner to postgres;
revoke all on table private.runtime_secrets from public, anon, authenticated;

alter table public.profiles
  add column if not exists avatar_key text not null default 'ink',
  add column if not exists session_version integer not null default 0;

alter table public.profiles
  drop constraint if exists profiles_avatar_key_check,
  add constraint profiles_avatar_key_check check (
    avatar_key in ('ink', 'pine', 'cinnabar', 'moon', 'bamboo', 'plum')
  ),
  drop constraint if exists profiles_session_version_check,
  add constraint profiles_session_version_check check (session_version >= 0);

create table if not exists private.account_password_attempts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  failed_count smallint not null default 0 check (failed_count >= 0),
  window_started_at timestamptz not null default clock_timestamp()
);

alter table private.account_password_attempts owner to postgres;
revoke all on table private.account_password_attempts from public, anon, authenticated;

create or replace function public.has_valid_app_session_signature()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'extensions'
as $$
  with request_context as (
    select nullif(current_setting('request.headers', true), '')::jsonb as headers
  ), secret as (
    select value
    from private.runtime_secrets
    where name = 'cwb_auth_secret'
  ), signed_profile as (
    select p.id, p.session_version, request_context.headers, secret.value as auth_secret
    from request_context
    cross join secret
    join public.profiles p
      on p.id::text = request_context.headers ->> 'x-cwb-user-id'
    where p.status = 'active'
  )
  select coalesce(bool_or(
    headers ? 'x-cwb-user-id'
    and headers ? 'x-cwb-session-signature'
    and headers ->> 'x-cwb-session-signature' = encode(
      hmac(
        (
          case
            when session_version = 0 then id::text
            else id::text || ':' || session_version::text
          end
        )::bytea,
        auth_secret::bytea,
        'sha256'
      ),
      'hex'
    )
  ), false)
  from signed_profile
$$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (
      select p.id
      from public.profiles p
      where public.has_valid_app_session_signature()
        and p.id::text = nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-cwb-user-id'
      limit 1
    ),
    auth.uid()
  )
$$;

create or replace function public.authenticate_school_account_v2(
  p_login_id text,
  p_password text,
  p_server_signature text
)
returns table(
  id uuid,
  login_id text,
  role public.app_role,
  display_name text,
  avatar_key text,
  session_version integer
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  select
    p.id,
    p.login_id,
    p.role::public.app_role,
    p.display_name,
    p.avatar_key,
    p.session_version
  from public.profiles p
  where p_server_signature = (
      select encode(extensions.hmac(('login:' || p_login_id)::bytea, value::bytea, 'sha256'), 'hex')
      from private.runtime_secrets where name = 'cwb_auth_secret'
    )
    and p.login_id = p_login_id
    and p.status = 'active'
    and p.login_id ~ '^\d{8}$'
    and p.password_hash is not null
    and p.password_hash = extensions.crypt(p_password, p.password_hash)
$$;

create or replace function public.update_own_avatar(p_avatar_key text)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_avatar_key text;
begin
  if v_user_id is null then
    raise exception 'valid school account session required' using errcode = '42501';
  end if;

  if p_avatar_key is null
    or p_avatar_key not in ('ink', 'pine', 'cinnabar', 'moon', 'bamboo', 'plum')
  then
    raise exception 'invalid avatar key' using errcode = '22023';
  end if;

  update public.profiles as p
  set avatar_key = p_avatar_key
  where p.id = v_user_id
    and p.status = 'active'
  returning p.avatar_key into v_avatar_key;

  return v_avatar_key;
end
$$;

create or replace function public.change_own_password(
  p_current_password text,
  p_new_password text
)
returns table(
  id uuid,
  login_id text,
  role public.app_role,
  display_name text,
  avatar_key text,
  session_version integer
)
language plpgsql
volatile
security definer
set search_path to 'public', 'private', 'extensions'
as $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_password_hash text;
  v_failed_count smallint;
  v_window_started_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'valid school account session required' using errcode = '42501';
  end if;

  if p_current_password is null
    or p_new_password is null
    or char_length(p_new_password) < 10
    or char_length(p_new_password) > 128
    or octet_length(convert_to(p_new_password, 'UTF8')) > 72
    or p_new_password = p_current_password
  then
    raise exception 'invalid new password' using errcode = '22023';
  end if;

  select p.password_hash
  into v_password_hash
  from public.profiles p
  where p.id = v_user_id
    and p.status = 'active'
  for update;

  select attempts.failed_count, attempts.window_started_at
  into v_failed_count, v_window_started_at
  from private.account_password_attempts attempts
  where attempts.user_id = v_user_id;

  if v_window_started_at > clock_timestamp() - interval '15 minutes'
    and v_failed_count >= 5
  then
    raise exception 'password_rate_limited' using errcode = 'P0001';
  end if;

  if v_password_hash is null
    or v_password_hash <> extensions.crypt(p_current_password, v_password_hash)
  then
    insert into private.account_password_attempts as attempts (
      user_id,
      failed_count,
      window_started_at
    ) values (
      v_user_id,
      1,
      clock_timestamp()
    )
    on conflict (user_id) do update
    set failed_count = case
          when attempts.window_started_at <= clock_timestamp() - interval '15 minutes' then 1
          else attempts.failed_count + 1
        end,
        window_started_at = case
          when attempts.window_started_at <= clock_timestamp() - interval '15 minutes' then clock_timestamp()
          else attempts.window_started_at
        end;

    return;
  end if;

  delete from private.account_password_attempts attempts
  where attempts.user_id = v_user_id;

  return query
  update public.profiles as p
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12)),
      session_version = p.session_version + 1
  where p.id = v_user_id
  returning
    p.id,
    p.login_id,
    p.role::public.app_role,
    p.display_name,
    p.avatar_key,
    p.session_version;
end
$$;

revoke all on function public.authenticate_school_account_v2(text, text, text) from public, authenticated;
grant execute on function public.authenticate_school_account_v2(text, text, text) to anon, service_role;

revoke all on function public.update_own_avatar(text) from public, authenticated;
grant execute on function public.update_own_avatar(text) to anon, service_role;

revoke all on function public.change_own_password(text, text) from public, authenticated;
grant execute on function public.change_own_password(text, text) to anon, service_role;
