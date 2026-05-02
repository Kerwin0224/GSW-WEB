import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { AppRole, Database, ProviderCapability } from '@/lib/supabase/database.types';
import { getProfile, type Profile } from '@/lib/auth';

export type DataResult<T> = { ok: true; data: T } | { ok: false; reason: 'unauthenticated' | 'forbidden' | 'missing_profile' | 'blocked' | 'error'; message: string };
export type CapabilityStatus = { capability: ProviderCapability; ready: boolean; modelId?: string; providerName?: string; providerType?: string; baseUrl?: string | null; secretRef?: string | null; blockedReason?: string };

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

export async function getCapability(capability: ProviderCapability): Promise<DataResult<CapabilityStatus>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('provider_capabilities')
      .select('capability,model_id,is_enabled,provider_configs(name,is_enabled,health_status,provider_type,base_url,secret_ref)')
      .eq('capability', capability)
      .eq('is_enabled', true)
      .limit(1)
      .maybeSingle();
    if (error) return fail('error', `读取 Provider 能力失败：${error.message}`);
    const provider = Array.isArray(data?.provider_configs) ? data.provider_configs[0] : data?.provider_configs;
    if (!data || !provider?.is_enabled) return ok({ capability, ready: false, blockedReason: `缺少 ${capability} 真实模型能力配置。` });
    if (provider.health_status === 'failed' || provider.health_status === 'blocked') return ok({ capability, ready: false, modelId: data.model_id, providerName: provider.name, providerType: provider.provider_type, baseUrl: provider.base_url, secretRef: provider.secret_ref, blockedReason: `${provider.name} 健康状态为 ${provider.health_status}。` });
    if (!provider.secret_ref) return ok({ capability, ready: false, modelId: data.model_id, providerName: provider.name, providerType: provider.provider_type, baseUrl: provider.base_url, blockedReason: `${provider.name} 缺少服务端 secret_ref。` });
    if (!resolveEnvSecret(provider.secret_ref)) return ok({ capability, ready: false, modelId: data.model_id, providerName: provider.name, providerType: provider.provider_type, baseUrl: provider.base_url, secretRef: provider.secret_ref, blockedReason: `${provider.name} 的 ${provider.secret_ref} 未在服务端环境中配置。` });
    return ok({ capability, ready: true, modelId: data.model_id, providerName: provider.name, providerType: provider.provider_type, baseUrl: provider.base_url, secretRef: provider.secret_ref });
  } catch (error) {
    return fail('error', error instanceof Error ? error.message : '读取 Provider 能力失败');
  }
}

export function resolveEnvSecret(secretRef?: string | null) {
  if (!secretRef?.startsWith('env:')) return null;
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
