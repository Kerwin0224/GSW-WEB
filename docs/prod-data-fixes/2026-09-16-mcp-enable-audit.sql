-- MCP 通电后的启用审计（2026-09-16）
--
-- 背景：迁移 20260916132800 让 MCP 运行时真正生效。此前 mcp_servers 只有 admin-only 的
-- SELECT 策略，而运行时是教师/学生身份 —— 查询永远返回 0 行，工具从未被调用过。
-- 那个迁移同时把**所有已启用的 Server 置为未启用**，所以现在没有任何 Server 会生效，
-- 直到有人显式打开。
--
-- 这份 SQL 是打开前的审计台账。在 Supabase Studio 的 SQL Editor 里跑，逐行确认后再启用。

-- ── 1. 待审清单 ─────────────────────────────────────────────────────────────
-- 重点看三列：
--   connection_ref：出站目标。必须是可信域名的 https（运行时另有 MCP_ALLOWED_ORIGINS 白名单兜底）。
--   allowed_roles ：一旦启用，该角色全体（跨班级、跨学校）立刻可用。
--   enabled_tools ：留空 = 这个 Server 不提供任何工具（运行时按空集过滤，等于白配）。
select
  id,
  name,
  is_enabled,
  allowed_roles,
  connection_ref,
  secret_ref is not null as has_secret,
  health_status,
  jsonb_array_length(coalesce(enabled_tools, '[]'::jsonb)) as enabled_tool_count,
  created_at
from public.mcp_servers
order by is_enabled desc, created_at;

-- ── 2. 逐个启用（示例，一次一个）────────────────────────────────────────────
-- update public.mcp_servers set is_enabled = true where id = '<uuid>';

-- ── 3. 启用后自查 ───────────────────────────────────────────────────────────
-- 启用后应能在学生端看到工具调用气泡。若看不到，按顺序查：
--   a. 该 Server 的 allowed_roles 是否含 'student'；
--   b. enabled_tools 是否非空（空 = 该 Server 的工具全被过滤掉）；
--   c. app_log_events 里有无 mcp 相关错误；
--   d. 出站域名是否在 MCP_ALLOWED_ORIGINS 白名单内（不在的话运行时直接拒绝）。
