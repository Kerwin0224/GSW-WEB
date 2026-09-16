import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';

import { filterEnabledMcpTools, getRoleMcpToolsFromSupabase } from '../mcp-runtime-core.ts';

function makeTool(name: string) {
  return { description: name, inputSchema: z.object({}), execute: async () => name };
}

function server(name: string, enabledTools: unknown) {
  return { id: `id-${name}`, name, connection_ref: `http-mcp:https://example.test/${name}`, secret_ref: null, enabled_tools: enabledTools, health_status: 'healthy' };
}

function makeSupabase(rows: Array<{ name: string; enabled_tools: unknown }>) {
  const calls: unknown[] = [];
  return {
    calls,
    async rpc(fn: string, args: { p_role: string }) {
      calls.push(['rpc', fn, args]);
      return { data: rows.map((row) => server(row.name, row.enabled_tools)), error: null };
    },
  };
}

test('MCP tools default to disabled when enabled_tools is empty', () => {
  const tools = filterEnabledMcpTools({ search: makeTool('search'), fetch: makeTool('fetch') }, []);

  assert.deepEqual(Object.keys(tools), []);
});

test('MCP tools are limited to explicitly enabled tool names', () => {
  const tools = filterEnabledMcpTools({ search: makeTool('search'), fetch: makeTool('fetch') }, ['search']);

  assert.deepEqual(Object.keys(tools), ['search']);
});

test('role MCP lookup queries enabled servers for the selected runtime role', async () => {
  const supabase = makeSupabase([]);

  const mcp = await getRoleMcpToolsFromSupabase(supabase, 'teacher', async () => {
    throw new Error('no MCP client should be created without server rows');
  });

  assert.equal(mcp.tools, undefined);
  // 必须是 RPC：直接查表会被 mcp_servers 的 admin-only RLS 挡成 0 行（功能从未通电的根因）。
  assert.deepEqual(supabase.calls, [['rpc', 'get_role_mcp_servers', { p_role: 'teacher' }]]);
});

test('role MCP lookup returns explicitly enabled tools and closes clients', async () => {
  let closed = 0;
  const supabase = makeSupabase([
    { name: 'poetry', enabled_tools: ['search'] },
  ]);

  const mcp = await getRoleMcpToolsFromSupabase(supabase, 'student', async () => ({
    tools: async () => ({ search: makeTool('search'), fetch: makeTool('fetch') }),
    close: async () => { closed += 1; },
  }));

  assert.deepEqual(Object.keys(mcp.tools ?? {}), ['search']);
  assert.deepEqual(supabase.calls.at(-1), ['rpc', 'get_role_mcp_servers', { p_role: 'student' }]);
  await mcp.close();
  assert.equal(closed, 1);
});

test('role MCP lookup skips client creation when enabled_tools is empty', async () => {
  const supabase = makeSupabase([
    { name: 'poetry', enabled_tools: [] },
  ]);

  const mcp = await getRoleMcpToolsFromSupabase(supabase, 'student', async () => {
    throw new Error('empty enabled_tools should skip MCP client creation');
  });

  assert.equal(mcp.tools, undefined);
});
