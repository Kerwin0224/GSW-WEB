import 'server-only';

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

function normalizeProvider<T>(provider: T | T[] | null | undefined): T | null {
  return Array.isArray(provider) ? provider[0] ?? null : provider ?? null;
}

function tierBlockedMessage(tier: ModelTier) {
  return tier === 'flash'
    ? '缺少 Flash Model 真实模型层配置；学生会话回答、布鲁姆分类与挑战生成不会降级到默认模型。'
    : '缺少 Advanced Model 真实模型层配置；教师问答、挑战确认评估与教学正确性核实辅助不会降级到默认模型。';
}

function providerHealthBlockedReason(providerName: string, healthStatus: string) {
  if (healthStatus === 'healthy' || healthStatus === 'unchecked') return null;
  return `${providerName} 健康状态为 ${healthStatus}。`;
}

export async function getModelTier(tier: ModelTier): Promise<DataResult<ModelTierStatus>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('model_tier_bindings')
      .select('tier,model_id,is_enabled,provider_id,provider_configs(id,name,is_enabled,health_status,provider_type,base_url,secret_ref)')
      .eq('tier', tier)
      .maybeSingle();
    if (error) return fail('error', `读取模型层配置失败：${error.message}`);
    const provider = normalizeProvider(data?.provider_configs as {
      id: string;
      name: string;
      is_enabled: boolean;
      health_status: string;
      provider_type: string;
      base_url: string | null;
      secret_ref: string | null;
    } | Array<{
      id: string;
      name: string;
      is_enabled: boolean;
      health_status: string;
      provider_type: string;
      base_url: string | null;
      secret_ref: string | null;
    }> | null | undefined);

    if (!data || !data.is_enabled || !provider?.is_enabled) return ok({ tier, ready: false, blockedReason: tierBlockedMessage(tier) });
    const baseStatus = { tier, modelId: data.model_id, providerId: data.provider_id, providerName: provider.name, providerType: provider.provider_type, baseUrl: provider.base_url, secretRef: provider.secret_ref, healthStatus: provider.health_status };
    const healthBlockedReason = providerHealthBlockedReason(provider.name, provider.health_status);
    if (healthBlockedReason) return ok({ ...baseStatus, ready: false, blockedReason: healthBlockedReason });
    if (!provider.secret_ref) return ok({ ...baseStatus, secretRef: undefined, ready: false, blockedReason: `${provider.name} 缺少服务端 secret_ref。` });
    if (!resolveEnvSecret(provider.secret_ref)) return ok({ ...baseStatus, ready: false, blockedReason: `${provider.name} 的 secret_ref 未在服务端环境中解析成功。` });
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
type ProviderCapabilityProvider = {
  name: string;
  is_enabled: boolean;
  health_status: string;
  provider_type: string;
  base_url: string | null;
  secret_ref: string | null;
};

type ProviderCapabilityRow = {
  capability: ProviderCapability;
  model_id: string;
  provider_configs: ProviderCapabilityProvider | ProviderCapabilityProvider[] | null;
};

async function getProviderCapability(capability: ProviderCapability): Promise<DataResult<CapabilityStatus>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('provider_capabilities')
      .select('capability,model_id,is_enabled,provider_configs!inner(name,is_enabled,health_status,provider_type,base_url,secret_ref)')
      .eq('capability', capability)
      .eq('is_enabled', true)
      .eq('provider_configs.is_enabled', true)
      .order('provider_id', { ascending: true })
      .order('model_id', { ascending: true });
    if (error) return fail('error', `读取 ${capability} Provider 能力失败：${error.message}`);

    let blockedStatus: CapabilityStatus | null = null;
    for (const row of (data ?? []) as ProviderCapabilityRow[]) {
      const provider = normalizeProvider(row.provider_configs);
      if (!provider?.is_enabled) continue;

      const baseStatus = {
        capability,
        ready: false,
        modelId: row.model_id,
        providerName: provider.name,
        providerType: provider.provider_type,
        baseUrl: provider.base_url,
        secretRef: provider.secret_ref,
      } satisfies CapabilityStatus;

      if (!row.model_id.trim()) {
        blockedStatus ??= { ...baseStatus, blockedReason: `${provider.name} 的 ${capability} model_id 为空。` };
        continue;
      }
      const healthBlockedReason = providerHealthBlockedReason(provider.name, provider.health_status);
      if (healthBlockedReason) {
        blockedStatus ??= { ...baseStatus, blockedReason: healthBlockedReason };
        continue;
      }
      if (!provider.secret_ref) {
        blockedStatus ??= { ...baseStatus, secretRef: undefined, blockedReason: `${provider.name} 缺少服务端 secret_ref。` };
        continue;
      }
      if (!resolveEnvSecret(provider.secret_ref)) {
        blockedStatus ??= { ...baseStatus, blockedReason: `${provider.name} 的 secret_ref 未在服务端环境中解析成功。` };
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
