import type { ToolSet } from 'ai';

export type RuntimeMcpRole = 'teacher' | 'student';
export type RuntimeMcpServer = {
  name: string;
  enabled_tools: unknown;
};
export type RuntimeMcpClient = {
  tools(): Promise<ToolSet>;
  close(): Promise<void>;
};
export type RuntimeMcpSupabase = {
  from(table: 'mcp_servers'): {
    select(columns: string): {
      eq(column: string, value: boolean): {
        contains(column: string, value: RuntimeMcpRole[]): Promise<{ data: RuntimeMcpServer[] | null; error: { message: string } | null }>;
      };
    };
  };
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
  const { data, error } = await supabase
    .from('mcp_servers')
    .select('*')
    .eq('is_enabled', true)
    .contains('allowed_roles', [role]);
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
