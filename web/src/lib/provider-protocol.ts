/**
 * Provider 对话协议的唯一枚举（ADR-0001）。
 * 区分维度只有报文协议；端点位置由 Provider 的 base_url 表达，不是协议的一部分。
 * 云/本地/中转等部署位置与厂商标签统一归入 openai-compatible。
 */
export const PROVIDER_PROTOCOLS = ['anthropic', 'openai-responses', 'openai-compatible'] as const;

export type ProviderProtocol = (typeof PROVIDER_PROTOCOLS)[number];

export const PROVIDER_PROTOCOL_LABELS: Record<ProviderProtocol, string> = {
  anthropic: 'Anthropic（Messages API）',
  'openai-responses': 'OpenAI（Responses API）',
  'openai-compatible': 'OpenAI Compatible（Chat Completions）',
};

export function isProviderProtocol(value: string): value is ProviderProtocol {
  return (PROVIDER_PROTOCOLS as readonly string[]).includes(value);
}

/** 历史数据或手工输入的未知值兜底到 openai-compatible（曾覆盖所有非 gateway 类型）。 */
export function toProviderProtocol(value: string | null | undefined): ProviderProtocol {
  return value && isProviderProtocol(value) ? value : 'openai-compatible';
}

export const DEFAULT_BASE_URLS: Record<ProviderProtocol, string> = {
  anthropic: 'https://api.anthropic.com',
  'openai-responses': 'https://api.openai.com/v1',
  'openai-compatible': 'https://api.openai.com/v1',
};

export const BASE_URL_PLACEHOLDERS: Record<ProviderProtocol, string> = {
  anthropic: 'https://api.anthropic.com',
  'openai-responses': 'https://api.openai.com/v1',
  'openai-compatible': 'https://api.openai.com/v1 / 中转站地址 / http://localhost:11434/v1',
};

/**
 * 模型列表端点与鉴权头按协议分叉：
 * - anthropic：`/v1/models` + x-api-key + anthropic-version
 * - openai 系（responses / compatible）：`/models` + Bearer
 * 创建/编辑 Provider 时 anthropic 允许填根域名，此处补 /v1。
 */
export function providerModelsRequest(baseUrl: string, apiKey: string, protocol: ProviderProtocol): { url: string; headers: Record<string, string> } {
  const root = baseUrl.replace(/\/+$/, '');
  if (protocol === 'anthropic') {
    const url = `${root.endsWith('/v1') ? root : `${root}/v1`}/models`;
    return { url, headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } };
  }
  return { url: `${root}/models`, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } };
}

/** anthropic SDK 的 baseURL 需含 /v1；对管理员填根域名或 /v1 结尾两种写法都兼容。 */
export function normalizeAnthropicBaseURL(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, '');
  return root.endsWith('/v1') ? root : `${root}/v1`;
}
