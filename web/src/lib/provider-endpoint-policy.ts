/**
 * Provider baseUrl 的出站地址闸门，与 MCP 远程地址（./mcp-runtime-policy.ts）同一把锁。
 *
 * 为什么它不是「管理员自己看着办」：base_url 决定**带着 API Key 的出站请求**发到哪里。
 * 写成 http:// 就是把密钥明文摊给能嗅探该网段的人；写成 127.0.0.1 / 10.x /
 * 169.254.169.254 就是一次 SSRF——借这个 Next 进程去够它自己能连到的内网端口与
 * 云元数据。MCP 那边早就这么卡了，Provider 这半边当时漏了，这里补齐。
 *
 * 纯函数、不依赖 server-only，与 mcp-runtime-policy 一样可直接单测。
 */

/** 返回可展示的拒绝理由；null = 放行。 */
function blockedProviderHostReason(hostname: string): string | null {
  // URL 的 hostname 对 IPv6 字面量保留方括号，先剥掉再判。
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return 'Base URL 缺少主机名。';
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'Base URL 不允许指向本机或内网主机名。';
  }
  // 单标签主机名（redis、metadata）只在私有 DNS 里解析得到，一律拒绝。
  if (!host.includes('.') && !host.includes(':')) return 'Base URL 必须使用完整域名，不允许单标签主机名。';

  if (host.includes(':')) {
    if (host === '::1' || host === '::') return 'Base URL 不允许指向环回地址。';
    // fc00::/7 唯一本地、fe80::/10 链路本地；::ffff: 是 IPv4 映射写法。
    if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return 'Base URL 不允许指向私网或链路本地地址。';
    // URL 会把 ::ffff:127.0.0.1 规范成 ::ffff:7f00:1，所以按末 32 位还原再走 IPv4 判定，
    // 否则这条地址就是绕过整个私网/环回名单的现成后门。
    const mapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mapped) {
      const high = Number.parseInt(mapped[1].padStart(4, '0'), 16);
      const low = Number.parseInt(mapped[2].padStart(4, '0'), 16);
      return blockedProviderHostReason(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
    }
    return null;
  }
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  const [a, b] = octets;
  if (a === 0 || a === 127) return 'Base URL 不允许指向环回地址。';
  if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return 'Base URL 不允许指向私网地址。';
  if (a === 169 && b === 254) return 'Base URL 不允许指向链路本地/云元数据地址。';
  return null;
}

/** 校验并归一化 baseUrl（去掉尾斜杠）；不合法时抛错，调用方转成可展示的失败信息。 */
export function assertAllowedProviderBaseUrl(rawBaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new Error('Base URL 不是合法 URL。');
  }
  if (url.protocol !== 'https:') throw new Error('Provider Base URL 只允许 https。');
  const blocked = blockedProviderHostReason(url.hostname);
  if (blocked) throw new Error(blocked);
  return url.toString().replace(/\/+$/, '');
}
