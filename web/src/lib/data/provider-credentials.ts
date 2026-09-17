import 'server-only';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { resolveEnvSecret } from './common';

/**
 * 测速（health-check）与拉模型列表（list-models）两条路由共用的请求体：
 *   1. providerId 模式：复用数据库中已保存的 baseUrl + 解密后的 API Key（推荐）
 *   2. 临时模式：直接传 baseUrl + apiKey（用于"添加 Provider"前预先验证）
 */
export const providerRequestSchema = z.union([
  z.object({ providerId: z.string().uuid() }),
  z.object({ baseUrl: z.string().url(), apiKey: z.string().min(1), providerType: z.string().optional() }),
]);

export type ProviderRequest = z.infer<typeof providerRequestSchema>;

export type ProviderCredentials = {
  providerId: string | null;
  baseUrl: string;
  apiKey: string;
  providerType: string | undefined;
};

export type ProviderCredentialsResult =
  | { ok: true; credentials: ProviderCredentials }
  | { ok: false; status: number; message: string };

/**
 * .from("provider_configs") 的读/写只在这一处。
 * providerId 模式会顺带刷新 secret_last_used_at——两条路由都要的行为，
 * 放在解析里就不会出现"某条路由忘了记"的分叉。
 */
export async function resolveProviderCredentials(parsed: ProviderRequest): Promise<ProviderCredentialsResult> {
  if (!('providerId' in parsed)) {
    return { ok: true, credentials: { providerId: null, baseUrl: parsed.baseUrl, apiKey: parsed.apiKey, providerType: parsed.providerType } };
  }

  const supabase = await createClient();
  const { data: cfg, error } = await supabase
    .from('provider_configs')
    .select('provider_type, base_url, secret_ref')
    .eq('id', parsed.providerId)
    .maybeSingle();
  if (error || !cfg) return { ok: false, status: 404, message: 'Provider 不存在' };
  if (!cfg.base_url) return { ok: false, status: 400, message: 'Provider 未配置 baseUrl' };
  const apiKey = resolveEnvSecret(cfg.secret_ref);
  if (!apiKey) return { ok: false, status: 400, message: 'Provider API Key 解密失败' };

  await supabase.from('provider_configs').update({ secret_last_used_at: new Date().toISOString() }).eq('id', parsed.providerId);

  return { ok: true, credentials: { providerId: parsed.providerId, baseUrl: cfg.base_url, apiKey, providerType: cfg.provider_type } };
}
