export function requireAllowedMcpRemoteUrl(rawUrl: string, allowedOriginsText = process.env.MCP_ALLOWED_ORIGINS ?? '') {
  const allowedOrigins = allowedOriginsText
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0) throw new Error('服务端未配置 MCP_ALLOWED_ORIGINS，远程 MCP 默认禁用。');

  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('远程 MCP 只允许 https。');
  if (!allowedOrigins.includes(url.origin)) throw new Error('MCP origin 未被服务端允许。');
  return url.toString();
}

export function assertStdioMcpDisabled(connectionRef: string) {
  if (connectionRef.startsWith('stdio:')) throw new Error('运行时禁用 stdio MCP；请使用服务端允许列表中的远程 https MCP。');
}
