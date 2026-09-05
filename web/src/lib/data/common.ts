import 'server-only';

import { type LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { toProviderProtocol, normalizeAnthropicBaseURL } from '@/lib/provider-protocol';
import { createClient } from '@/lib/supabase/server';
import type { AppRole, Database, ModelTier, ProviderCapability } from '@/lib/supabase/database.types';
import { getProfile, type Profile } from '@/lib/auth';
import { decryptSecret, isEncryptedSecret } from '@/lib/crypto/secret-cipher';

export type DataResult<T> = { ok: true; data: T } | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'missing_profile' | 'blocked' | 'error'; message: string };
export type CapabilityStatus = { capability: ProviderCapability; ready: boolean; modelId?: string; providerName?: string; providerType?: string; baseUrl?: string | null; secretRef?: string | null; blockedReason?: string };
export type ModelTierStatus = { tier: ModelTier; ready: boolean; modelId?: string; providerId?: string; providerName?: string; providerType?: string; baseUrl?: string | null; secretRef?: string | null; healthStatus?: string; blockedReason?: string };

export type { ModelTier } from '@/lib/supabase/database.types';

export const scenarioModelTiers = {
  student_chat: 'flash',
  bloom_classification: 'flash',
  project_classification: 'flash',
  practice_generation: 'flash',
  teacher_chat: 'advanced',
  practice_evaluation: 'advanced',
  audit_assist: 'advanced',
} as const satisfies Partial<Record<ProviderCapability, ModelTier>>;

export const tierScenarios = {
  flash: ['student_chat', 'bloom_classification', 'project_classification', 'practice_generation'],
  advanced: ['teacher_chat', 'practice_evaluation', 'audit_assist'],
} as const satisfies Record<ModelTier, readonly ProviderCapability[]>;

export function ok<T>(data: T): DataResult<T> { return { ok: true, data }; }
export function fail<T = never>(reason: DataResult<T> extends infer R ? R extends { ok: false; reason: infer S } ? S : never : never, message: string): DataResult<T> { return { ok: false, reason, message } as DataResult<T>; }

/**
 * 根据 CapabilityStatus 解析出可用的 LanguageModel 实例。
 * 所有 AI 功能的 Provider 路由逻辑集中在此处；新增协议只需修改这一处（ADR-0001）。
 * 返回 null 表示 secret 未就绪，调用方应向客户端返回 503。
 */
export function resolveLanguageModel(capability: CapabilityStatus): LanguageModel | null {
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

export async function requireRole(role: AppRole): Promise<DataResult<Profile>> {
  try {
    const profile = await getProfile();
    if (!profile) return fail('missing_profile', '当前账号缺少 Supabase profile，无法猜测角色。');
    if (profile.status !== 'active') return fail('forbidden', '当前账号已停用。');
    if (profile.role !== role) return fail('forbidden', `当前账号不是 ${role} 角色。`);
    return ok(profile);
  } catch (error) {
    return fail('error', error instanceof Error ? error.message : '读取角色资料失败');
  }
}

function tierBlockedMessage(tier: ModelTier) {
  return tier === 'flash'
    ? '缺少 Flash Model 真实模型层配置；学生会话回答、学生问题布鲁姆路径判断与挑战生成不会降级到默认模型。'
    : '缺少 Advanced Model 真实模型层配置；教师问答、挑战确认评估与教学正确性核实辅助不会降级到默认模型。';
}

function providerHealthBlockedReason(providerName: string, healthStatus: string) {
  if (healthStatus === 'healthy' || healthStatus === 'unchecked') return null;
  return `${providerName} 健康状态为 ${healthStatus}。`;
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

export async function getCapability(capability: ProviderCapability): Promise<DataResult<CapabilityStatus>> {
  if (capability === 'embedding') return getEmbeddingCapability();
  return getProviderCapability(capability);
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

async function getProviderCapability(capability: ProviderCapability): Promise<DataResult<CapabilityStatus>> {
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

async function getEmbeddingCapability(): Promise<DataResult<CapabilityStatus>> {
  return getProviderCapability('embedding');
}

export function resolveEnvSecret(secretRef?: string | null) {
  if (!secretRef) return null;

  // 优先尝试解密：管理员粘贴 API Key 时使用 AES-256-GCM 存储
  if (isEncryptedSecret(secretRef)) {
    return decryptSecret(secretRef);
  }

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
