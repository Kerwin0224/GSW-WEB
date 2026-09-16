import type { ToolSet } from 'ai';

export type RuntimeMcpRole = 'teacher' | 'student';
export type RuntimeMcpServer = {
  id: string;
  name: string;
  connection_ref: string | null;
  secret_ref: string | null;
  enabled_tools: unknown;
  health_status: string;
};
export type RuntimeMcpClient = {
  tools(): Promise<ToolSet>;
  close(): Promise<void>;
};
/**
 * 取值面收窄成一个 RPC。
 *
 * 此前是直接 `.from('mcp_servers').select('*')`，而该表只有 `is_admin()` 一条 SELECT 策略
 * ——运行时是教师/学生身份，查询永远返回 0 行，MCP 从未通电且不报错。
 * 改用 security definer 的 `get_role_mcp_servers`：跨行条件（启用中 + 角色匹配）与凭据列
 * 都留在函数体里，不必给学生开放含 secret_ref 的表。
 */
export type RuntimeMcpSupabase = {
  rpc(
    fn: 'get_role_mcp_servers',
    args: { p_role: RuntimeMcpRole },
  ): Promise<{ data: RuntimeMcpServer[] | null; error: { message: string } | null }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function enabledToolNames(value: unknown) {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(value.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
    const record = asRecord(item);
    const name = typeof record?.name === 'string' ? record.name.trim() : '';
    return name ? [name] : [];
  }));
}

export function filterEnabledMcpTools(tools: ToolSet, enabledTools: unknown) {
  const names = enabledToolNames(enabledTools);
  if (names.size === 0) return {} as ToolSet;
  return Object.fromEntries(Object.entries(tools).filter(([name]) => names.has(name))) as ToolSet;
}

export async function closeMcpClients(clients: Array<Pick<RuntimeMcpClient, 'close'>>) {
  await Promise.allSettled(clients.map((client) => client.close()));
}

export async function getRoleMcpToolsFromSupabase(
  supabase: RuntimeMcpSupabase,
  role: RuntimeMcpRole,
  createClientForServer: (server: RuntimeMcpServer) => Promise<RuntimeMcpClient>,
) {
  const { data, error } = await supabase.rpc('get_role_mcp_servers', { p_role: role });
  if (error) throw new Error(`MCP Server 加载失败：${error.message}`);

  const clients: RuntimeMcpClient[] = [];
  const toolSets: ToolSet[] = [];

  try {
    for (const server of data ?? []) {
      if (enabledToolNames(server.enabled_tools).size === 0) continue;
      const client = await createClientForServer(server);
      clients.push(client);
      const tools = filterEnabledMcpTools(await client.tools(), server.enabled_tools);
      if (Object.keys(tools).length > 0) toolSets.push(tools);
    }

    if (toolSets.length === 0) {
      await closeMcpClients(clients);
      return { tools: undefined, close: async () => undefined };
    }

    return {
      tools: Object.assign({}, ...toolSets) as ToolSet,
      close: () => closeMcpClients(clients),
    };
  } catch (error) {
    await closeMcpClients(clients);
    throw error;
  }
}
