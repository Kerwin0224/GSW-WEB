-- ═══════════════════════════════════════════════════════════════════════════
-- 紧急修复：空间建不出来 + 登录返回列不足 + 建号 revoke 签名错
-- ═══════════════════════════════════════════════════════════════════════════
-- 本迁移不引入新能力，只修三处会让线上功能直接不可用的问题。

-- ── 1. 空间建不出来（P0）──────────────────────────────────────────────
-- 20260926150000 建了 space_collaborators 并 `enable row level security`，
-- 但**一条 policy 都没有**。RLS 开启 + 零策略 = 默认全拒。
-- 而同一批重写的 create_space_v3 末尾无条件
--   insert into public.space_collaborators (...) values (空间, 当前用户, 'owner', ...)
-- 于是每个教师建空间都在这一步被拒：**建空间功能线上全挂**。
-- 同一批的 spaces_select 里 collaborator 分支也查这张表，恒空。
drop policy if exists "space_collaborators_read" on public.space_collaborators;
create policy "space_collaborators_read" on public.space_collaborators for select
  using (
    profile_id = public.current_app_user_id()
    or public.teacher_can_access_space(space_id)
    or public.can_manage_space(space_id)
    or public.can_admin_school_scope(
         (select sc.school_id from public.spaces sc where sc.id = space_collaborators.space_id))
  );

-- 写：空间 owner / 协作者 / 校管理员 / 公司管理员。
-- owner 行由 create_space_v3 自己插入，插入者是当前用户且自己是 owner，
-- `can_manage_space(space_id)` 这一支在插入前为空（空间刚建出来还没有协作者行），
-- 所以额外放行「插入行就是我自己」——否则又变成建不出空间。
drop policy if exists "space_collaborators_write" on public.space_collaborators;
create policy "space_collaborators_write" on public.space_collaborators for insert
  with check (
    profile_id = public.current_app_user_id()
    or public.teacher_can_access_space(space_id)
    or public.can_manage_space(space_id)
    or public.is_admin()
  );

drop policy if exists "space_collaborators_update" on public.space_collaborators;
create policy "space_collaborators_update" on public.space_collaborators for update
  using (public.can_manage_space(space_id) or public.teacher_can_access_space(space_id) or public.is_admin())
  with check (public.can_manage_space(space_id) or public.teacher_can_access_space(space_id) or public.is_admin());

drop policy if exists "space_collaborators_delete" on public.space_collaborators;
create policy "space_collaborators_delete" on public.space_collaborators for delete
  using (public.can_manage_space(space_id) or public.is_admin());

-- ── 2. 建号 RPC 的 revoke 写错了签名类型 ──────────────────────────────
-- provision_school_account 的第三个参数在库里是 text（20260912130000:383、
-- 20260926102000:85 两版都是 p_role text）。create or replace 不能改参数类型，
-- 所以 (text, text, app_role, uuid, text) 这个签名**在库里不存在**，
-- 对它 revoke 会报 42883，整条迁移失败。用真实签名重来。
revoke execute on function public.provision_school_account(text, text, text, uuid, text) from anon, service_role;

-- ── 3. 登录 RPC 的返回列必须与前端的 zod 形状一致 ─────────────────────
-- authenticate_school_account_v4 只返回 5 列，而 loginRpcProfileSchema 要求 11 列
-- （id/login_id/role/display_name/avatar_key/session_version/must_change_password
--   /school_id/school_name/organization_id/organization_name）。
-- 列不够时 PostgREST 不报错，只是少返回——zod 直接把每次登录判成 500。
-- 这里按 v3 的完整形状重定义，返回列一只不加不减。
create or replace function public.authenticate_school_account_v4(
  p_login_id text,
  p_password text,
  p_server_signature text,
  p_school_id uuid
)
returns table (
  id uuid,
  login_id text,
  role public.app_role,
  display_name text,
  avatar_key text,
  session_version integer,
  must_change_password boolean,
  school_id uuid,
  school_name text,
  organization_id uuid,
  organization_name text
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  select p.id, p.login_id, p.role, p.display_name, p.avatar_key,
         p.session_version, p.must_change_password,
         p.school_id, s.name, p.organization_id, o.name
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

do $$
begin
  -- 建空间这条路径是本迁移要救的主线：函数存在 + 插入策略存在，两者缺一不可。
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'space_collaborators'
       and policyname = 'space_collaborators_write'
  ) then
    raise exception 'space_collaborators insert policy missing: create_space_v3 will fail for every teacher';
  end if;
  raise notice '空间协作策略、建号 revoke 签名、登录返回列已修正';
end $$;
