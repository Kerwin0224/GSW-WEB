import { withApiLogging } from '@/lib/observability/with-api-logging';
import { requireRole } from '@/lib/data/common';
import { saveProviderHealthCheck } from '@/lib/data/admin';
import { providerModelsRequest, toProviderProtocol } from '@/lib/provider-protocol';
import { providerRequestSchema, resolveProviderCredentials } from '@/lib/data/provider-credentials';

export const maxDuration = 30;

/**
 * 测速 / 健康检查。providerId 模式会自动把结果写回
 * provider_configs.health_status / last_health_check_at / last_health_latency_ms。
 */
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
    const parsed = providerRequestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    const resolved = await resolveProviderCredentials(parsed.data);
    if (!resolved.ok) return Response.json({ error: resolved.message }, { status: resolved.status });
    const { providerId, baseUrl, apiKey, providerType } = resolved.credentials;

    const { url, headers } = providerModelsRequest(baseUrl, apiKey, toProviderProtocol(providerType));
    const startedAt = Date.now();

    let healthy = false;
    let message: string;
    let status = 0;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(15000),
      });
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
