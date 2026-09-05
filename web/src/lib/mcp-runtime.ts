import { createMCPClient } from '@ai-sdk/mcp';

import { resolveEnvSecret } from '@/lib/data/common';
import type { Database } from '@/lib/supabase/database.types';
import { getRoleMcpToolsFromSupabase, type RuntimeMcpClient, type RuntimeMcpSupabase, type RuntimeMcpRole } from './mcp-runtime-core';
import { assertStdioMcpDisabled, requireAllowedMcpRemoteUrl } from './mcp-runtime-policy';

type McpServerRow = Database['public']['Tables']['mcp_servers']['Row'];

function connectionRefUrl(connectionRef: string, prefix: string) {
  return connectionRef.slice(prefix.length).trim();
}

export function transportForConnectionRef(rawConnectionRef: string, token?: string) {
  const connectionRef = rawConnectionRef.trim();
  if (!connectionRef) throw new Error('MCP connection_ref 不能为空。');

  assertStdioMcpDisabled(connectionRef);

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const redirect = 'error' as const;

  if (connectionRef.startsWith('sse:')) {
    return { type: 'sse' as const, url: requireAllowedMcpRemoteUrl(connectionRefUrl(connectionRef, 'sse:')), headers, redirect };
  }
  if (connectionRef.startsWith('http-mcp:')) {
    return { type: 'http' as const, url: requireAllowedMcpRemoteUrl(connectionRefUrl(connectionRef, 'http-mcp:')), headers, redirect };
  }
  if (connectionRef.startsWith('http:') || connectionRef.startsWith('https:')) {
    const url = requireAllowedMcpRemoteUrl(connectionRef);
    const transportType = url.includes('/sse') ? 'sse' : 'http';
    return { type: transportType, url, headers, redirect } as const;
  }

  throw new Error('MCP connection_ref 不受支持。');
}

function transportForServer(server: McpServerRow) {
  const connectionRef = server.connection_ref?.trim();
  if (!connectionRef) throw new Error(`${server.name} 缺少 MCP connection_ref。`);

  const token = resolveEnvSecret(server.secret_ref);
  return transportForConnectionRef(connectionRef, token ?? undefined);
}

async function defaultCreateMcpClient(server: McpServerRow) {
  return createMCPClient({ transport: transportForServer(server) });
}

export async function getRoleMcpTools(
  supabase: unknown,
  role: RuntimeMcpRole,
  createClientForServer: (server: McpServerRow) => Promise<RuntimeMcpClient> = defaultCreateMcpClient,
) {
  return getRoleMcpToolsFromSupabase(
    supabase as RuntimeMcpSupabase,
    role,
    createClientForServer as Parameters<typeof getRoleMcpToolsFromSupabase>[2],
  );
}
