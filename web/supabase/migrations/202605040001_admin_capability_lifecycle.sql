begin;

alter table public.provider_configs
  add column if not exists secret_created_at timestamptz,
  add column if not exists secret_last_used_at timestamptz,
  add column if not exists secret_rotated_at timestamptz;

update public.provider_configs
set
  secret_created_at = coalesce(secret_created_at, created_at),
  secret_rotated_at = coalesce(secret_rotated_at, created_at)
where secret_ref is not null;

alter table public.profiles
  add column if not exists last_login_at timestamptz,
  add column if not exists last_activity_at timestamptz;

commit;
