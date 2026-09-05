import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertStdioMcpDisabled, requireAllowedMcpRemoteUrl } from '../mcp-runtime-policy.ts';

test('remote MCP requires an explicit allowed origin list', () => {
  assert.throws(() => requireAllowedMcpRemoteUrl('https://mcp.example.com/sse', ''), /MCP_ALLOWED_ORIGINS/);
});

test('remote MCP rejects non-https URLs', () => {
  assert.throws(() => requireAllowedMcpRemoteUrl('http://mcp.example.com/sse', 'http://mcp.example.com'), /https/);
});

test('remote MCP rejects origins outside the server allowlist', () => {
  assert.throws(() => requireAllowedMcpRemoteUrl('https://evil.example.com/sse', 'https://mcp.example.com'), /origin/);
});

test('remote MCP accepts https URLs from the server allowlist', () => {
  assert.equal(
    requireAllowedMcpRemoteUrl('https://mcp.example.com/sse', 'https://mcp.example.com'),
    'https://mcp.example.com/sse',
  );
});

test('stdio MCP is disabled at runtime', () => {
  assert.throws(() => assertStdioMcpDisabled('stdio:npx my-mcp-server'), /禁用 stdio MCP/);
});
