-- 初始密码 = 学号/工号 + 强制首登改密（用户裁定方案，见 ADR 讨论 2026-09-12）。
-- 约束：管理员导入/建号时以 login_id 为初始密码（8 位，导入通道特例，
-- 不放松 change_own_password 的 ≥10 位自助改密规则）；首登强制改密后解除。

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- 登录 RPC 带出强制改密标记（会话 claim 据此全站拦截）。
-- 返回类型变更 Postgres 不允许 CREATE OR REPLACE，先 DROP 重建（随后的 grant 语句恢复授权）。
drop function if exists public.authenticate_school_account_v2(text, text, text);
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
  session_version integer,
  must_change_password boolean
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
    p.session_version,
    p.must_change_password
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

-- 改密成功即解除强制标记（会话版本 +1 使其他会话失效，行为不变）。
drop function if exists public.change_own_password(text, text);
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
  session_version integer,
  must_change_password boolean
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
      session_version = p.session_version + 1,
      must_change_password = false
  where p.id = v_user_id
  returning
    p.id,
    p.login_id,
    p.role::public.app_role,
    p.display_name,
    p.avatar_key,
    p.session_version,
    p.must_change_password;
end
$$;

-- 管理员把指定账号的密码重置为学号/工号并打上强制改密标记。
-- 身份校验：server_signature 与 current_app_user_id() 的 admin 角色双重确认；
-- 签名主题与登录一致（login:<login_id>），由服务端 createDatabaseSessionSignature 生成。
create or replace function public.set_initial_password_by_login(
  p_login_id text,
  p_server_signature text
)
returns void
language sql
security definer
set search_path to 'public', 'extensions'
as $$
  update public.profiles p
  set password_hash = extensions.crypt(p_login_id, extensions.gen_salt('bf')),
      must_change_password = true
  where p_server_signature = (
      select encode(extensions.hmac(('login:' || p_login_id)::bytea, value::bytea, 'sha256'), 'hex')
      from private.runtime_secrets where name = 'cwb_auth_secret'
    )
    and p.login_id = p_login_id
    and p.login_id ~ '^\d{8}$'
    and exists (
      select 1 from public.profiles me
      where me.id = public.current_app_user_id() and me.role = 'admin'
    )
    and exists (
      select 1 from public.profiles target
      where target.login_id = p_login_id and target.role <> 'admin'
    );
$$;

revoke all on function public.authenticate_school_account_v2(text, text, text) from public, authenticated;
grant execute on function public.authenticate_school_account_v2(text, text, text) to anon, service_role;
revoke all on function public.change_own_password(text, text) from public, authenticated;
grant execute on function public.change_own_password(text, text) to anon, service_role;
-- 服务端客户端以 anon 角色携带用户身份头调用；函数内部做 admin 角色校验。
revoke all on function public.set_initial_password_by_login(text, text) from public, authenticated;
grant execute on function public.set_initial_password_by_login(text, text) to anon, service_role;
