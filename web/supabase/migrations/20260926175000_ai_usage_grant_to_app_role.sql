-- ═══════════════════════════════════════════════════════════════════════════
-- ai_usage 的读权限授错了运行角色
-- ═══════════════════════════════════════════════════════════════════════════
-- 本仓的运行角色是 **anon**：server.ts 用 publishable key 作 Bearer，
-- 身份走 x-cwb-user-id 头，不是 auth.uid()，所以 Supabase Auth 的
-- authenticated 角色在这套链路里根本不参与。
--
-- 上一批建 ai_usage 时只 `grant select ... to authenticated`，
-- 结果是 /admin/usage 在生产直接 permission denied for table ai_usage。
-- 这是"迁移全绿、功能不可用"的又一种：DDL 成功不等于授权给对了角色。

-- 加固：运行角色按既有约定就是 anon，两边都授，避免以后再改认证方案时又断一次。
grant select on public.ai_usage to anon, authenticated;

-- 写入仍然只经由 definer 的 record_ai_usage，用量行不能由调用方自己编。
revoke insert, update, delete on public.ai_usage from anon, authenticated;

do $$
begin
  if not has_table_privilege('anon', 'public.ai_usage', 'select') then
    raise exception 'anon must be able to SELECT ai_usage (it is the app runtime role)';
  end if;
  if has_table_privilege('anon', 'public.ai_usage', 'insert')
     or has_table_privilege('anon', 'public.ai_usage', 'update')
     or has_table_privilege('anon', 'public.ai_usage', 'delete') then
    raise exception 'usage rows must only be written through record_ai_usage';
  end if;
  raise notice 'ai_usage 授权已修正为运行角色 anon';
end $$;
