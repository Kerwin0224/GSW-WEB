-- MCP 运行时取值：让教师/学生真的能拿到自己角色的 MCP Server。
--
-- 现状是**功能从未通电**：mcp_servers 只有一条 `mcp_app_admin_all using (is_admin())` 策略，
-- 而运行时走的是用户身份客户端（anon key + x-cwb-user-id 头）。教师和学生不是 admin，
-- 查询永远返回 0 行，`getRoleMcpTools` 永远返回 undefined——后台配了 MCP 也不会被调用，
-- 且不会报任何错。这是个静默失效：界面上一切正常，工具从来没跑过。
--
-- 两条修法里选 RPC 而不是放开 RLS SELECT：
--   1. mcp_servers 带 secret_ref（MCP 的 Bearer Token 密文）。放开 SELECT 等于把公司凭据
--      密文暴露给每一个学生和教师。
--   2. 「启用中 + 角色匹配」这种跨行条件用 RLS using 表达不出来（要把 allowed_roles 数组
--      和 is_enabled 一起判），写成策略只会更难读。
-- 与 get_provider_capability_provider / get_model_tier_provider 同构：security definer +
-- 会话签名门禁，租户/角色边界写在函数体里。
--
-- 本迁移会让一个从未在生产跑过的功能开始工作：此前所有 MCP Server 都是死的，
-- 通电后每一个「已启用且角色命中」的 Server 会立刻对全校生效，产生真实外部请求。
--
-- 这种「一次性人工审计」不该靠自觉 —— 把它变成数据状态：
-- **先把现有 Server 全部置为未启用**，谁审过谁手动打开。
-- 因为它们在通电前本来就是死的，这一步零行为变化，只是让「生效」必须由人显式决定。
-- 原子性无虞：置位与 RPC 创建在同一事务里，中间不存在「能用了但没审」的窗口。

do $$
declare
  v_disabled integer;
  v_names text;
begin
  select count(*), string_agg(name, '、' order by name)
    into v_disabled, v_names
    from public.mcp_servers
   where is_enabled;

  update public.mcp_servers set is_enabled = false where is_enabled;

  if v_disabled > 0 then
    raise notice 'MCP 通电前已关闭 % 个原本「已启用」的 Server：%。'
                 '它们此前因 RLS 从未被调用过；请在 /admin/mcp 逐行审计 connection_ref、'
                 'allowed_roles 与 enabled_tools 后手动启用。', v_disabled, v_names;
  else
    raise notice 'MCP 通电前无需关闭任何 Server（没有已启用的行）';
  end if;
end $$;

create or replace function public.get_role_mcp_servers(p_role public.app_role)
returns table(
  id uuid,
  name text,
  connection_ref text,
  secret_ref text,
  enabled_tools jsonb,
  health_status text
)
    language plpgsql stable security definer
    set search_path to 'public'
    as $$
begin
  -- 与另两个解析 RPC 同一道门：只认带服务端会话签名的调用，裸 anon 拿不到凭据。
  if not public.has_valid_app_session_signature() then
    raise exception 'server session signature required' using errcode = '42501';
  end if;

  return query
  select s.id, s.name, s.connection_ref, s.secret_ref, s.enabled_tools, s.health_status
  from public.mcp_servers s
  where s.is_enabled
    and p_role = any (s.allowed_roles)
  order by s.created_at;
end $$;

comment on function public.get_role_mcp_servers(public.app_role) is
  '按角色取启用中的 MCP Server（含连接凭据）。SECURITY DEFINER：mcp_servers 的 RLS 只放行 admin，'
  '运行时是教师/学生身份，不走这张表的策略。';

-- 自检：函数就位，且仍然只有 admin 能直接读表（确认没有顺手放开 RLS）。
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_role_mcp_servers'
  ) then
    raise exception 'get_role_mcp_servers missing after migration';
  end if;
  if exists (
    select 1 from pg_policies
    where tablename = 'mcp_servers' and cmd = 'SELECT' and policyname <> 'mcp_app_admin_all'
  ) then
    raise exception 'mcp_servers gained a non-admin SELECT policy; credentials would leak';
  end if;
  raise notice 'get_role_mcp_servers ready; mcp_servers 仍仅 admin 可直读';
end $$;
