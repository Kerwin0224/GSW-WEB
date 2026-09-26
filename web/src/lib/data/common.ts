import 'server-only';

import { type LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { toProviderProtocol, normalizeAnthropicBaseURL } from '@/lib/provider-protocol';
import { createClient } from '@/lib/supabase/server';
import type { AppRole, Database, ModelTier, ProviderCapability } from '@/lib/supabase/database.types';
import { getProfile, type Profile } from '@/lib/auth';
import { instrumentLanguageModel } from '@/lib/ai-usage';
import { decryptSecret } from '@/lib/crypto/secret-cipher';

export type DataResult<T> = { ok: true; data: T } | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'missing_profile' | 'blocked' | 'password_change_required' | 'error'; message: string };
/**
 * Server Action 的通用返回形状，配合 useActionState 使用。
 *
 * 仓库此前有 7 个逐字段同构的形状各写各的（AdminActionState / AuditSubmissionState /
 * ProviderActionResult / CreateStudentProjectResult / McpServerTestResult …）。
 * 新代码一律用这个，旧的在各自被改动时顺带收敛过来，不做一次性大改。
 */
export type ActionState = { ok: boolean; message: string; errors?: Record<string, string> };
export type CapabilityStatus = { capability: ProviderCapability; ready: boolean; modelId?: string; providerName?: string; providerType?: string; baseUrl?: string | null; secretRef?: string | null; blockedReason?: string };
export type ModelTierStatus = { tier: ModelTier; ready: boolean; modelId?: string; providerId?: string; providerName?: string; providerType?: string; baseUrl?: string | null; secretRef?: string | null; healthStatus?: string; blockedReason?: string };

export type { ModelTier } from '@/lib/supabase/database.types';

/**
 * 代码侧不再保存「场景 → 路由层」的默认映射。
 *
 * 真源是 teaching_scenarios + scenario_tier_bindings（见 lib/teaching-scenarios.ts）：
 * 加一种教学形态只需要往 teaching_scenarios 插一行，不必改四处代码。
 * 这个常量保留为空对象只为不打断 admin.ts 的两处同步兜底 import；
 * 未命中时那里自己的 `?? 'flash'` 就是租户默认档位。
 * 接线清单：admin.ts 的 getScenarioTierBindingsFromDb / saveScenarioTierBindings
 * 换成 await resolveScenarioTier(scenario) 之后，本常量可删。
 */
export const scenarioModelTiers: Partial<Record<ProviderCapability, ModelTier>> = {};

/**
 * 根据 CapabilityStatus 解析出可用的 LanguageModel 实例。
 * 所有 AI 功能的 Provider 路由逻辑集中在此处；新增协议只需修改这一处（ADR-0001）。
 * 返回 null 表示 secret 未就绪，调用方应向客户端返回 503。
 *
 * 计量也包在这一层：全部 AI 路径都从这里拿模型，这是唯一能保证「不漏计」的出口。
 * 计量失败不会影响这里返回的模型（见 lib/ai-usage.ts）。
 */
export function resolveLanguageModel(capability: CapabilityStatus): LanguageModel | null {
  const model = createProviderModel(capability);
  if (!model) return null;
  return instrumentLanguageModel(model, { scenario: capability.capability, modelId: capability.modelId ?? null });
}

export function ok<T>(data: T): DataResult<T> { return { ok: true, data }; }
export function fail<T = never>(reason: DataResult<T> extends infer R ? R extends { ok: false; reason: infer S } ? S : never : never, message: string): DataResult<T> { return { ok: false, reason, message } as DataResult<T>; }

/**
 * 真正的协议分派：同一份 CapabilityStatus 按 providerType 落到 Anthropic
 * Messages / OpenAI Responses / OpenAI 兼容三种报文之一。
 */
function createProviderModel(capability: CapabilityStatus): LanguageModel | null {
  if (!capability.modelId) return null;
  const apiKey = resolveEnvSecret(capability.secretRef);
  if (!apiKey) return null;
  switch (toProviderProtocol(capability.providerType)) {
    case 'anthropic':
      return createAnthropic({
        apiKey,
        baseURL: capability.baseUrl ? normalizeAnthropicBaseURL(capability.baseUrl) : undefined,
      })(capability.modelId);
    case 'openai-responses':
      return createOpenAI({ apiKey, baseURL: capability.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined }).responses(capability.modelId);
    default:
      return createOpenAI({ apiKey, baseURL: capability.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined }).chat(capability.modelId);
  }
}

/**
 * "拿到一个能用的模型，或拿到一句能对用户说明白的话"——所有 AI 路由的统一入口。
 *
 * 之前 student/teacher/challenge 四条路由各自抄了 4 行 same-shape 的
 * `ready → resolveLanguageModel → null → 503` 守卫，导致同一个故障在不同路由给出
 * 不同文案、不同状态码，排查时无法判断是"模型没配"还是"密钥没注入"。
 * 收口在这里：失败原因带 capability 名，文案一次写成，所有路由一致。
 *
 * 返回 ok:false 时调用方应直接把它转成 HTTP 响应（status 已给出），不要再自造文案。
 */
export function resolveReadyModel(capability: CapabilityStatus): { ok: true; model: LanguageModel; modelId: string } | { ok: false; status: number; error: string; resolution: string } {
  if (!capability.ready) {
    return {
      ok: false,
      status: 503,
      error: '该功能所需的模型未配置',
      resolution: '请到「模型供应商」页补齐该功能的模型 ID，保存后重新进入本页。',
    };
  }
  const model = resolveLanguageModel(capability);
  if (!model || !capability.modelId) {
    return {
      ok: false,
      status: 503,
      error: `${capability.capability} 模型密钥未解析`,
      resolution: '服务端没有取到该 Provider 的密钥，请到「模型供应商」页重新保存该 Provider。',
    };
  }
  return { ok: true, model, modelId: capability.modelId };
}

/**
 * API 路由/server action 侧的鉴权入口：失败返回 DataResult（403/401 语义由调用方映射）。
 * RSC/页面侧请用 lib/auth.ts 的 requireProfile（redirect 语义）；
 * 两者都基于 getProfile()（每次调用重新读库，停用账号即时失效），分工不同勿混用。
 */
export async function requireRole(role: AppRole): Promise<DataResult<Profile>> {
  return requireAnyRole([role]);
}

/**
 * 多角色版本：某些资源对公司级（org_admin）与校内（admin）都开放，
 * 例如项目归属目录——公司可下发模板，学校可维护自有目录。
 * 语义与 requireRole 完全一致，只是允许集合而非单值。
 */
export async function requireAnyRole(roles: readonly AppRole[]): Promise<DataResult<Profile>> {
  try {
    const profile = await getProfile();
    if (!profile) return fail('missing_profile', '当前账号缺少 Supabase profile，无法猜测角色。');
    if (profile.status !== 'active') return fail('forbidden', '当前账号已停用。');
    // 强制首登改密：除改密接口（不走 requireRole）外，所有 API 一律拒绝。
    if (profile.must_change_password) return fail('password_change_required', '请先在账号设置中修改初始密码。');
    if (!roles.includes(profile.role)) return fail('forbidden', '当前账号没有该页面的管理权限，请联系公司管理员分配角色。');
    return ok(profile);
  } catch (error) {
    return fail('error', error instanceof Error ? error.message : '读取角色资料失败');
  }
}

function tierBlockedMessage(tier: ModelTier) {
  return tier === 'flash'
    ? '缺少基础模型配置；学生会话回答、学生问题布鲁姆认知路径判断与挑战生成不会降级到默认模型。'
    : '缺少高阶模型配置；教师问答、挑战评阅与 AI 预审不会降级到默认模型。';
}

function providerHealthBlockedReason(providerName: string, healthStatus: string) {
  if (healthStatus === 'healthy' || healthStatus === 'unchecked') return null;
  return `${providerName} 最近一次连接检查为${healthStatus === 'failed' ? '失败' : '被阻塞'}，请到「模型供应商」页重新检查连接。`;
}

export async function getModelTier(tier: ModelTier): Promise<DataResult<ModelTierStatus>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_model_tier_provider', { p_tier: tier });
    if (error) return fail('error', `读取模型层配置失败：${error.message}`);
    const row = data?.[0];

    if (!row || !row.binding_enabled || !row.provider_enabled) return ok({ tier, ready: false, blockedReason: tierBlockedMessage(tier) });
    const baseStatus = {
      tier,
      modelId: row.model_id,
      providerId: row.provider_id,
      providerName: row.provider_name,
      providerType: row.provider_type,
      baseUrl: row.base_url,
      secretRef: row.secret_ref,
      healthStatus: row.health_status,
    };
    const healthBlockedReason = providerHealthBlockedReason(row.provider_name, row.health_status);
    if (healthBlockedReason) return ok({ ...baseStatus, ready: false, blockedReason: healthBlockedReason });
    if (!row.secret_ref) return ok({ ...baseStatus, secretRef: undefined, ready: false, blockedReason: `${row.provider_name} 缺少服务端 secret_ref。` });
    if (!resolveEnvSecret(row.secret_ref)) return ok({ ...baseStatus, ready: false, blockedReason: `${row.provider_name} 的 secret_ref 未在服务端环境中解析成功。` });
    return ok({ ...baseStatus, ready: true });
  } catch (error) {
    return fail('error', error instanceof Error ? error.message : '读取模型层配置失败');
  }
}

export async function getModelTiers(tiers: ModelTier[]): Promise<Record<ModelTier, ModelTierStatus>> {
  const entries = await Promise.all(tiers.map(async (tier) => {
    const result = await getModelTier(tier);
    return [tier, result.ok ? result.data : { tier, ready: false, blockedReason: result.message }] as const;
  }));
  return Object.fromEntries(entries) as Record<ModelTier, ModelTierStatus>;
}

type ProviderCapabilityRow = {
  capability: ProviderCapability;
  model_id: string;
  provider_name: string;
  provider_type: string;
  base_url: string | null;
  secret_ref: string | null;
  health_status: string;
};

export async function getCapability(capability: ProviderCapability): Promise<DataResult<CapabilityStatus>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_provider_capability_provider', { p_capability: capability });
    if (error) return fail('error', `读取 ${capability} Provider 能力失败：${error.message}`);

    let blockedStatus: CapabilityStatus | null = null;
    for (const row of (data ?? []) as unknown as ProviderCapabilityRow[]) {
      const baseStatus = {
        capability,
        ready: false,
        modelId: row.model_id,
        providerName: row.provider_name,
        providerType: row.provider_type,
        baseUrl: row.base_url,
        secretRef: row.secret_ref,
      } satisfies CapabilityStatus;

      if (!row.model_id.trim()) {
        blockedStatus ??= { ...baseStatus, blockedReason: `${row.provider_name} 的 ${capability} model_id 为空。` };
        continue;
      }
      const healthBlockedReason = providerHealthBlockedReason(row.provider_name, row.health_status);
      if (healthBlockedReason) {
        blockedStatus ??= { ...baseStatus, blockedReason: healthBlockedReason };
        continue;
      }
      if (!row.secret_ref) {
        blockedStatus ??= { ...baseStatus, secretRef: undefined, blockedReason: `${row.provider_name} 缺少服务端 secret_ref。` };
        continue;
      }
      if (!resolveEnvSecret(row.secret_ref)) {
        blockedStatus ??= { ...baseStatus, blockedReason: `${row.provider_name} 的 secret_ref 未在服务端环境中解析成功。` };
        continue;
      }
      return ok({ ...baseStatus, ready: true, modelId: row.model_id.trim() });
    }

    return ok(blockedStatus ?? { capability, ready: false, blockedReason: `缺少 ${capability} 真实模型能力配置。` });
  } catch (error) {
    return fail('error', error instanceof Error ? error.message : `读取 ${capability} Provider 能力失败`);
  }
}

export function resolveEnvSecret(secretRef?: string | null) {
  if (!secretRef) return null;

  // 优先尝试解密：管理员粘贴 API Key 时使用 AES-256-GCM 存储。
  // 非 v1 格式（含旧 env: 引用）decryptSecret 直接返回 null，无需另做格式判断。
  const decrypted = decryptSecret(secretRef);
  if (decrypted) return decrypted;

  // 兼容旧的 env:VAR_NAME 引用
  if (!secretRef.startsWith('env:')) return null;
  const envName = secretRef.slice(4);
  if (!/^[A-Z][A-Z0-9_]*$/.test(envName)) return null;
  const value = process.env[envName];
  return value?.trim() ? value : null;
}

export async function getCapabilities(capabilities: ProviderCapability[]): Promise<Record<ProviderCapability, CapabilityStatus>> {
  const entries = await Promise.all(capabilities.map(async (capability) => {
    const result = await getCapability(capability);
    return [capability, result.ok ? result.data : { capability, ready: false, blockedReason: result.message }] as const;
  }));
  return Object.fromEntries(entries) as Record<ProviderCapability, CapabilityStatus>;
}

export function extractTextFromParts(messages: Array<{ parts?: Array<{ type?: string; text?: string }> }>) {
  const last = [...messages].reverse().find((message) => message.parts?.some((part) => part.type === 'text' && part.text));
  return last?.parts?.find((part) => part.type === 'text')?.text?.trim() ?? '';
}


export function jsonForDatabase(value: unknown): Database['public']['Tables']['conversation_messages']['Insert']['parts'] {
  return JSON.parse(JSON.stringify(value)) as Database['public']['Tables']['conversation_messages']['Insert']['parts'];
}
