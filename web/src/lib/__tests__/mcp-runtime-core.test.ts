import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';

import { filterEnabledMcpTools, getRoleMcpToolsFromSupabase } from '../mcp-runtime-core.ts';

function makeTool(name: string) {
  return { description: name, inputSchema: z.object({}), execute: async () => name };
}

function makeSupabase(rows: Array<{ name: string; enabled_tools: unknown }>) {
  const calls: unknown[] = [];
  return {
    calls,
    from(table: 'mcp_servers') {
      calls.push(['from', table]);
      return {
        select(columns: string) {
          calls.push(['select', columns]);
          return {
            eq(column: string, value: boolean) {
              calls.push(['eq', column, value]);
              return {
                async contains(column: string, value: string[]) {
                  calls.push(['contains', column, value]);
                  return { data: rows, error: null };
                },
              };
            },
          };
        },
      };
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
  assert.deepEqual(supabase.calls, [
    ['from', 'mcp_servers'],
    ['select', '*'],
    ['eq', 'is_enabled', true],
    ['contains', 'allowed_roles', ['teacher']],
  ]);
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
  assert.deepEqual(supabase.calls.at(-1), ['contains', 'allowed_roles', ['student']]);
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
