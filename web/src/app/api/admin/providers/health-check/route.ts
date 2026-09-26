import { withApiLogging } from '@/lib/observability/with-api-logging';
import { requireAnyRole } from '@/lib/data/common';
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
    // 与 getAdminProviders / saveProviderHealthCheck 同口径：公司级模板归 org_admin，
    // 各校自带归校 admin。此前这里只放行 'admin'，org_admin 在自己的 Provider 列表里
    // 点测速拿到的是 403。
    const role = await requireAnyRole(['admin', 'org_admin']);
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
      // 写回失败要当失败报出去：否则列表里永远停在 unchecked，管理员以为没点过。
      const saved = await saveProviderHealthCheck(providerId, { healthy, latencyMs, message });
      if (!saved.ok) return Response.json({ healthy, status, latencyMs, message, error: saved.message }, { status: 409 });
    }

    return Response.json({ healthy, status, latencyMs, message });
  });
}
