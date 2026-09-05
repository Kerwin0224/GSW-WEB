import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { requireRole, resolveEnvSecret } from '@/lib/data/common';
import { saveProviderHealthCheck } from '@/lib/data/admin';
import { providerModelsRequest, toProviderProtocol } from '@/lib/provider-protocol';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * 测速 / 健康检查。两种用法：
 *   1. providerId 模式：复用数据库中已保存的 baseUrl + 解密后的 API Key（推荐）
 *   2. 临时模式：直接传 baseUrl + apiKey（用于"添加 Provider"前预先验证）
 *
 * providerId 模式会自动把结果写回 provider_configs.health_status / last_health_check_at / last_health_latency_ms。
 */
const bodySchema = z.union([
  z.object({ providerId: z.string().uuid() }),
  z.object({ baseUrl: z.string().url(), apiKey: z.string().min(1), providerType: z.string().optional() }),
]);

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'provider_health_check', route: '/api/admin/providers/health-check' }, async () => {
    const role = await requireRole('admin');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    let baseUrl: string;
    let apiKey: string;
    let providerType: string | undefined;
    let providerId: string | null = null;

    if ('providerId' in parsed.data) {
      providerId = parsed.data.providerId;
      const supabase = await createClient();
      const { data: cfg, error } = await supabase
        .from('provider_configs')
        .select('provider_type, base_url, secret_ref')
        .eq('id', providerId)
        .maybeSingle();
      if (error || !cfg) return Response.json({ error: 'Provider 不存在' }, { status: 404 });
      if (!cfg.base_url) return Response.json({ error: 'Provider 未配置 baseUrl' }, { status: 400 });
      const secret = resolveEnvSecret(cfg.secret_ref);
      if (!secret) return Response.json({ error: 'Provider API Key 解密失败' }, { status: 400 });
      providerType = cfg.provider_type;
      baseUrl = cfg.base_url;
      apiKey = secret;
      await supabase.from('provider_configs').update({ secret_last_used_at: new Date().toISOString() }).eq('id', providerId);
    } else {
      baseUrl = parsed.data.baseUrl;
      apiKey = parsed.data.apiKey;
      providerType = parsed.data.providerType;
    }

    const { url, headers } = providerModelsRequest(baseUrl, apiKey, toProviderProtocol(providerType));
    const startedAt = Date.now();

    let healthy = false;
    let message = 'OK';
    let status = 0;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      status = response.status;
      healthy = response.ok;
      message = response.ok ? 'OK' : `HTTP ${response.status} ${response.statusText}`;
    } catch (error) {
      message = error instanceof Error ? error.message : '请求失败';
    }

    const latencyMs = Date.now() - startedAt;

    if (providerId) {
      await saveProviderHealthCheck(providerId, { healthy, latencyMs, message });
    }

    return Response.json({ healthy, status, latencyMs, message });
  });
}
