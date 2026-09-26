-- ═══════════════════════════════════════════════════════════════════════════
-- 登录标识按租户可配，初始口令不再等于账号本身
-- ═══════════════════════════════════════════════════════════════════════════
-- 上一批只给 schools 加了 login_id_pattern 这一列，但没有把它接进任何函数：
--   provision_school_account      `p_login_id !~ '^\d{8}$'`
--   authenticate_school_account_v3 `p.login_id ~ '^\d{8}$'`
--   两处初始口令都是 crypt(p_login_id)，即「初始密码 = 账号本身」
-- 于是只改应用层的结果是：教培工牌号、企业培训邮箱、高校 10 位学号、国际用户
-- learner@example.com 在 DB 侧直接被判 invalid login id；随机一次性口令也没有
-- 落库通道。租户配置写得再对也不生效。
--
-- 两件事必须一起做：放宽账号格式而不改初始口令，等于开一个可枚举的弱口令面
-- ——8 位数字账号全空间可枚举，攻击者拿到一个学号就能试着登进任意一个。
-- must_change_password 门禁继续保留：它只拦「改密前不能访问别的功能」，
-- 拦不住「用别人的学号登进自己的账号」。

-- ── 1. 建号：按租户口令规则校验，初始口令由调用方显式给定 ──────────────
create or replace function public.provision_school_account_v2(
  p_login_id text,
  p_display_name text,
  p_role public.app_role,
  p_school_id uuid,
  p_initial_password text,
  p_server_signature text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_id uuid;
  v_existing_role public.app_role;
  v_org_id uuid;
  v_pattern text;
begin
  if p_server_signature <> (
    select encode(extensions.hmac('provision_school_account'::bytea, value::bytea, 'sha256'), 'hex')
    from private.runtime_secrets where name = 'cwb_auth_secret'
  ) then
    raise exception 'invalid server signature' using errcode = '42501';
  end if;

  select coalesce(s.login_id_pattern, '^\d{8}$') into v_pattern
    from public.schools s where s.id = p_school_id;
  -- 学校不存在时 v_pattern 为 NULL，下面统一按默认规则走；
  -- 归属校验那一段会先把它挡掉。
  v_pattern := coalesce(v_pattern, '^\d{8}$');

  if p_login_id !~ v_pattern then
    raise exception 'invalid login id' using errcode = '22023';
  end if;

  if p_role not in ('admin', 'teacher', 'student') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  -- 初始口令：显式给定才用，没给就退回到「账号 + 随机后缀」而不是账号本身。
  -- p_initial_password 走 definer 函数，登录端拿不到它；一次性展示由应用层负责。
  if p_initial_password is null or length(p_initial_password) < 6 then
    p_initial_password := p_login_id || '-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 8);
  end if;

  if not exists (
    select 1 from public.schools s
    join public.profiles me on me.id = public.current_app_user_id() and me.status = 'active'
    where s.id = p_school_id and (
      (me.role = 'admin' and me.school_id = s.id)
      or (me.role = 'org_admin' and s.org_id = me.organization_id)
    )
  ) then
    raise exception 'school not in caller scope' using errcode = '42501';
  end if;

  select o.id into v_org_id from public.schools s join public.organizations o on o.id = s.org_id where s.id = p_school_id;

  select id, role into v_id, v_existing_role
    from public.profiles
   where school_id = p_school_id and login_id = p_login_id;
  if v_id is not null then
    -- 重导入路径。**不覆盖已有密码**：CSV 重跑不该把人踢下线并换掉口令。
    if v_existing_role is distinct from p_role then
      raise exception 'login id % already exists as %; a role change must be made explicitly', p_login_id, v_existing_role
        using errcode = '42501';
    end if;
    update public.profiles set display_name = p_display_name where id = v_id;
    return v_id;
  end if;

  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (gen_random_uuid(), p_login_id || '@accounts.internal', 'provisioned', now(), now(), now())
  returning id into v_id;

  insert into public.profiles (id, login_id, display_name, role, status, school_id, organization_id, must_change_password)
  values (v_id, p_login_id, p_display_name, p_role, 'active', p_school_id, v_org_id, true);

  update public.profiles
  set password_hash = extensions.crypt(p_initial_password, extensions.gen_salt('bf')),
      must_change_password = true
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.provision_school_account_v2(text, text, public.app_role, uuid, text, text) from public, authenticated;
grant execute on function public.provision_school_account_v2(text, text, public.app_role, uuid, text, text) to anon, service_role;

-- ── 2. 重置初始口令：由调用方给定，不再等于账号本身 ────────────────────
create or replace function public.set_initial_password_by_profile_v2(
  p_profile_id uuid,
  p_password text,
  p_server_signature text
)
returns void
language sql
security definer
set search_path to 'public', 'extensions'
as $$
  update public.profiles p
  set password_hash = extensions.crypt(
        coalesce(
          nullif(p_password, ''),
          (select t.login_id from public.profiles t where t.id = p_profile_id)
            || '-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 8)
        ),
        extensions.gen_salt('bf')
      ),
      must_change_password = true,
      -- 换口令必须让旧会话立刻失效，否则改密前已泄露的会话还能继续用。
      session_version = session_version + 1
  where p.id = p_profile_id
    and p_server_signature = (
      select encode(extensions.hmac(('pw:' || p_profile_id)::bytea, value::bytea, 'sha256'), 'hex')
      from private.runtime_secrets where name = 'cwb_auth_secret'
    )
    and public.can_admin_profile(p_profile_id)
$$;

revoke all on function public.set_initial_password_by_profile_v2(uuid, text, text) from public, authenticated;
grant execute on function public.set_initial_password_by_profile_v2(uuid, text, text) to anon, service_role;

-- ── 3. 登录：去掉写死的 8 位正则 ─────────────────────────────────────
-- 账号格式由建号时按租户规则把关，登录端再判一次等于把租户配置又钉回默认。
-- 这里保留「必须 active、必须有口令、必须匹配、可选校过滤」四项，其余不动。
create or replace function public.authenticate_school_account_v4(
  p_login_id text,
  p_password text,
  p_server_signature text,
  p_school_id uuid
)
returns table (id uuid, display_name text, role public.app_role, school_id uuid, organization_id uuid)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  select p.id, p.display_name, p.role, p.school_id, p.organization_id
  from public.profiles p
  left join public.schools s on s.id = p.school_id
  left join public.organizations o on o.id = p.organization_id
  where p_server_signature = (
      select encode(extensions.hmac(('login:' || p_login_id)::bytea, value::bytea, 'sha256'), 'hex')
      from private.runtime_secrets where name = 'cwb_auth_secret'
    )
    and p.login_id = p_login_id
    and p.status = 'active'
    and p.password_hash is not null
    and p.password_hash = extensions.crypt(p_password, p.password_hash)
    and (p_school_id is null or p.school_id = p_school_id)
$$;

revoke all on function public.authenticate_school_account_v4(text, text, text, uuid) from public, authenticated;
grant execute on function public.authenticate_school_account_v4(text, text, text, uuid) to anon, service_role;

-- ── 4. 机构自助开通：一次性 token → 组织 + 首个公司管理员 ─────────────
-- 新客户落地目前需要平台运营手工插库（建 organization → 建校 → 建 admin），
-- 租户开通本身是通用 SaaS 的第一道门，门不存在就谈不上多租户。
create table if not exists public.tenant_invites (
  token_hash text primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  school_name text,
  school_kind text not null default 'school',
  login_id_pattern text,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tenant_invites_active_idx
  on public.tenant_invites (expires_at) where consumed_at is null;

alter table public.tenant_invites enable row level security;
-- 令牌本身是凭证，客户端不需要读这张表；读取一律走下面的 definer 函数。

create or replace function public.create_tenant_invite(
  p_school_name text,
  p_school_kind text,
  p_login_id_pattern text,
  p_expires_at timestamptz,
  p_server_signature text
)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_token text;
begin
  if not public.is_org_admin() then
    raise exception 'org admin role required' using errcode = '42501';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'invite must expire in the future' using errcode = '22023';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.tenant_invites (
    token_hash, school_name, school_kind, login_id_pattern,
    created_by, expires_at
  ) values (
    extensions.digest(v_token, 'sha256'), p_school_name,
    coalesce(nullif(p_school_kind, ''), 'school'),
    nullif(p_login_id_pattern, ''), public.current_app_user_id(), p_expires_at
  );

  -- 明文只在此刻存在一次，之后库里只有摘要。
  return v_token;
end;
$$;

revoke all on function public.create_tenant_invite(text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.create_tenant_invite(text, text, text, timestamptz, text) to service_role;

-- 兑换：一次性令牌 → 组织 + 首个 org_admin。返回明文初始口令。
-- 返回明文是刻意的：它是一次性展示给新管理员的，之后库里没有任何地方存明文。
create or replace function public.redeem_tenant_invite(
  p_token text,
  p_org_name text,
  p_login_id text,
  p_display_name text,
  p_initial_password text
)
returns table (organization_id uuid, school_id uuid, profile_id uuid, initial_password text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_invite public.tenant_invites%rowtype;
  v_org uuid;
  v_school uuid;
  v_user uuid;
  v_password text;
begin
  select * into v_invite
    from public.tenant_invites t
   where t.token_hash = extensions.digest(p_token, 'sha256')
     and t.consumed_at is null
     and t.expires_at > now()
   for update;
  if not found then
    raise exception 'invite is invalid or expired' using errcode = '22023';
  end if;

  v_password := coalesce(
    nullif(p_initial_password, ''),
    p_login_id || '-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 8)
  );

  insert into public.organizations (name)
  values (coalesce(nullif(p_org_name, ''), v_invite.school_name))
  returning id into v_org;

  insert into public.schools (org_id, name, kind, login_id_pattern)
  values (v_org, coalesce(v_invite.school_name, p_org_name), v_invite.school_kind,
          coalesce(v_invite.login_id_pattern, '^\d{8}$'))
  returning id into v_school;

  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (gen_random_uuid(), p_login_id || '@accounts.internal', 'provisioned', now(), now(), now())
  returning id into v_user;

  insert into public.profiles (id, login_id, display_name, role, status, organization_id, must_change_password)
  values (v_user, p_login_id, p_display_name, 'org_admin', 'active', v_org, true);

  update public.profiles
  set password_hash = extensions.crypt(v_password, extensions.gen_salt('bf'))
  where id = v_user;

  update public.tenant_invites
  set consumed_at = now(), consumed_by = v_user
  where token_hash = v_invite.token_hash;

  return query select v_org, v_school, v_user, v_password;
end;
$$;

revoke all on function public.redeem_tenant_invite(text, text, text, text, text) from public, authenticated;
grant execute on function public.redeem_tenant_invite(text, text, text, text, text) to anon, service_role;

-- 旧入口收回：它们还锁着 8 位正则与「初始密码 = 账号」。
-- 调用方已全部迁到 v2/v4；留着只会有人继续走旧路径。
-- 注意：旧函数的第三个参数在库里是 text（两版建号函数都是 p_role text），
-- 不是 app_role。create or replace 不能改参数类型，所以只有 (text,text,text,uuid,text)
-- 这个签名真实存在；写成 app_role 会报 42883 并让整条迁移失败。
revoke execute on function public.provision_school_account(text, text, text, uuid, text) from anon, service_role;
revoke execute on function public.set_initial_password_by_profile(uuid, text) from anon, service_role;
revoke execute on function public.authenticate_school_account_v3(text, text, text, uuid) from anon, service_role;

do $$
begin
  if not exists (select 1 from information_schema.routines
     where routine_schema = 'public' and routine_name = 'provision_school_account_v2') then
    raise exception 'provision_school_account_v2 missing';
  end if;
  if (select count(*) from public.schools where login_id_pattern is null or login_id_pattern = '') > 0 then
    raise exception 'every school must carry a login_id_pattern';
  end if;
  raise notice '登录标识按租户可配；初始口令不再等于账号本身；机构自助开通已就位';
end $$;
