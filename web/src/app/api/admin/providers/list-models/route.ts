import { withApiLogging } from '@/lib/observability/with-api-logging';
import { requireAnyRole } from '@/lib/data/common';
import { saveProviderApiModels } from '@/lib/data/admin';
import { providerModelsRequest, toProviderProtocol } from '@/lib/provider-protocol';
import { providerRequestSchema, resolveProviderCredentials } from '@/lib/data/provider-credentials';

export const maxDuration = 30;

/**
 * 拉取并持久化 Provider 的模型列表。providerId 模式会自动写回 api_models；
 * 临时模式只试探，不持久化。
 */
type RawModel = { id: string; created?: number; owned_by?: string };

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'provider_list_models', route: '/api/admin/providers/list-models' }, async () => {
    // 与 getAdminProviders / saveProviderApiModels 同口径：org_admin 管公司级模板。
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

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        return Response.json({
          error: `获取模型列表失败：HTTP ${response.status}`,
          resolution: '该 provider 可能不暴露 /models 端点，可在能力配置时手动输入模型 ID。',
        }, { status: 503 });
      }

      const data = await response.json() as { data?: RawModel[] };
      const models = (data.data ?? []).map((m) => ({ id: m.id, ownedBy: m.owned_by }));

      if (providerId) {
        const saved = await saveProviderApiModels(providerId, models);
        if (!saved.ok) {
          return Response.json({
            models,
            count: models.length,
            persisted: false,
            error: saved.message,
            resolution: '模型已拉取到，但没有写回该 Provider：它可能已被删除，或当前账号无权修改。',
          }, { status: 409 });
        }
      }
      return Response.json({ models, count: models.length, persisted: providerId !== null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Response.json({
        error: `请求失败：${message}`,
        resolution: '检查网络与 baseUrl 可达性，或确认该 provider 暴露了 /models 端点。',
      }, { status: 503 });
    }
  });
}
