import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { requireRole, resolveEnvSecret } from '@/lib/data/common';
import { saveProviderApiModels } from '@/lib/data/admin';
import { providerModelsRequest, toProviderProtocol } from '@/lib/provider-protocol';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * 拉取并持久化 Provider 的模型列表。
 *   1. providerId 模式：复用 baseUrl + 解密后的 API Key，自动写回 api_models（推荐）
 *   2. 临时模式：传 baseUrl + apiKey（可附 providerType）试探，但不持久化
 */
const bodySchema = z.union([
  z.object({ providerId: z.string().uuid() }),
  z.object({ baseUrl: z.string().url(), apiKey: z.string().min(1), providerType: z.string().optional() }),
]);

type RawModel = { id: string; created?: number; owned_by?: string };

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'provider_list_models', route: '/api/admin/providers/list-models' }, async () => {
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

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return Response.json({
          error: `获取模型列表失败：HTTP ${response.status}`,
          resolution: '该 provider 可能不暴露 /models 端点，可在能力配置时手动输入模型 ID。',
        }, { status: 503 });
      }

      const data = await response.json() as { data?: RawModel[] };
      const models = (data.data ?? []).map((m) => ({ id: m.id, ownedBy: m.owned_by }));

      if (providerId) {
        await saveProviderApiModels(providerId, models);
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
