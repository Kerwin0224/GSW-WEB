'use server';

import { revalidatePath } from 'next/cache';
import { encryptSecret } from '@/lib/crypto/secret-cipher';
import { createClient } from '@/lib/supabase/server';
import type { AppRole, AuditKind, Database, Json, ModelTier, ProviderCapability } from '@/lib/supabase/database.types';
import { fail, getModelTiers, ok, requireRole, type ModelTierStatus } from './common';

export type AdminActionState = { ok: boolean; message: string; errors?: Record<string, string> };
export type ProviderActionResult = { ok: true; message?: string } | { ok: false; message: string };
export type AppRoleArray = AppRole[];
export type CsvUserPreviewRow = {
  rowNumber: number;
  displayName: string;
  loginId: string;
  role: AppRole | null;
  className: string | null;
  status: 'valid' | 'invalid';
  errors: string[];
};
export type CsvUserPreview = { rows: CsvUserPreviewRow[]; validCount: number; invalidCount: number };
export type AdminModelTierStatus = ModelTierStatus;

const providerCapabilities = [
  'student_chat',
  'teacher_chat',
  'bloom_classification',
  'project_classification',
  'practice_generation',
  'practice_evaluation',
  'audit_assist',
  'embedding',
] as const satisfies readonly ProviderCapability[];

const appRoles = ['admin', 'teacher', 'student'] as const satisfies readonly AppRole[];

type ProviderConfigRow = Database['public']['Tables']['provider_configs']['Row'];
type ProviderCapabilityRow = Database['public']['Tables']['provider_capabilities']['Row'];
type McpServerInsert = Database['public']['Tables']['mcp_servers']['Insert'];
type McpServerUpdate = Database['public']['Tables']['mcp_servers']['Update'];

type ProviderWithCapabilities = ProviderConfigRow & { provider_capabilities?: ProviderCapabilityRow[] | null };
type ProviderApiModel = { id: string; ownedBy?: string };

type ProviderConfigInput = { name: string; providerType: string; baseUrl: string; apiKey: string };
type ProviderPatchInput = { name?: string; providerType?: string; baseUrl?: string | null; apiKey?: string; isEnabled?: boolean };
type ProviderCapabilityInput = { capability: string; modelId: string };
type McpServerInput = { name: string; description?: string | null; connectionRef?: string | null; token?: string; enabledTools?: unknown; allowedRoles?: AppRoleArray; isEnabled?: boolean };

function actionResult(okResult: boolean, message: string, errors?: Record<string, string>): AdminActionState {
  return { ok: okResult, message, errors };
}

function resolveActionArgs(first: FormData | AdminActionState, second?: FormData) {
  return { formData: second ?? (first as FormData), shouldReturnState: Boolean(second) };
}

function lastFour(secret: string) {
  return secret.slice(-4) || null;
}

function normalizeApiModels(value: Json): ProviderApiModel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const id = typeof item.id === 'string' ? item.id : null;
    if (!id) return [];
    const ownedBy = typeof item.ownedBy === 'string' ? item.ownedBy : typeof item.owned_by === 'string' ? item.owned_by : undefined;
    return [{ id, ownedBy }];
  });
}

function toProviderListItem(provider: ProviderWithCapabilities) {
  return {
    id: provider.id,
    name: provider.name,
    providerType: provider.provider_type,
    baseUrl: provider.base_url,
    secretLastFour: provider.secret_last_four,
    secretCreatedAt: provider.secret_created_at,
    secretLastUsedAt: provider.secret_last_used_at,
    secretRotatedAt: provider.secret_rotated_at,
    isEnabled: provider.is_enabled,
    healthStatus: provider.health_status,
    lastHealthCheckAt: provider.last_health_check_at,
    lastHealthLatencyMs: provider.last_health_latency_ms,
    apiModels: normalizeApiModels(provider.api_models),
    capabilities: (provider.provider_capabilities ?? []).filter((capability) => capability.is_enabled).map((capability) => ({
      capability: capability.capability,
      modelId: capability.model_id,
    })),
  };
}

function providerSuccess(message = '操作已完成。'): ProviderActionResult {
  return { ok: true, message };
}

function providerFailure(message: string): ProviderActionResult {
  return { ok: false, message };
}

function isProviderCapability(value: string): value is ProviderCapability {
  return providerCapabilities.includes(value as ProviderCapability);
}

function isAppRole(value: string): value is AppRole {
  return appRoles.includes(value as AppRole);
}

function parseCsv(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const [headerLine, ...rows] = lines;
  if (!headerLine) return [];
  const headers = headerLine.split(',').map((header) => header.trim());
  return rows.map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

export async function getAdminDashboard() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const [users, classes, providers, presets, mcp, exports] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('classes').select('*').order('created_at', { ascending: false }),
    supabase.from('provider_capabilities').select('capability,is_enabled,provider_configs!inner(is_enabled)').eq('is_enabled', true),
    supabase.from('prompt_presets').select('*').eq('status', 'published'),
    supabase.from('mcp_servers').select('*').eq('is_enabled', true),
    supabase.from('export_batches').select('*').order('created_at', { ascending: false }).limit(10),
  ]);
  for (const result of [users, classes, providers, presets, mcp, exports]) if (result.error) return fail('error', result.error.message);
  const readyCaps = new Set(((providers.data ?? []) as Array<{ capability: string; provider_configs?: { is_enabled?: boolean } | Array<{ is_enabled?: boolean }> }>).filter((row) => { const provider = Array.isArray(row.provider_configs) ? row.provider_configs[0] : row.provider_configs; return provider?.is_enabled; }).map((row) => row.capability));
  return ok({ users: users.data ?? [], classes: classes.data ?? [], readyCaps, presets: presets.data ?? [], mcp: mcp.data ?? [], exports: exports.data ?? [] });
}

export async function getAdminClasses() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase.from('classes').select('*, class_memberships(id, role, profiles(display_name, login_id, role))').order('created_at', { ascending: false });
  if (error) return fail('error', `班级关系加载失败：${error.message}`);
  return ok(data ?? []);
}

export async function createClass(formData: FormData): Promise<void>;
export async function createClass(previousState: AdminActionState, formData: FormData): Promise<AdminActionState>;
export async function createClass(first: FormData | AdminActionState, second?: FormData): Promise<void | AdminActionState> {
  const { formData, shouldReturnState } = resolveActionArgs(first, second);
  const role = await requireRole('admin');
  if (!role.ok) return shouldReturnState ? actionResult(false, role.message) : undefined;
  const name = String(formData.get('name') ?? '').trim();
  const grade = String(formData.get('grade') ?? '').trim() || null;
  const errors: Record<string, string> = {};
  if (!name) errors.name = '请填写班级名称。';
  if (Object.keys(errors).length > 0) return shouldReturnState ? actionResult(false, '请补齐班级信息。', errors) : undefined;
  const supabase = await createClient();
  const { error } = await supabase.from('classes').insert({ name, grade, created_by: role.data.id });
  if (error) return shouldReturnState ? actionResult(false, `班级创建失败：${error.message}`) : undefined;
  revalidatePath('/admin/classes');
  revalidatePath('/admin');
  return shouldReturnState ? actionResult(true, '班级已创建。') : undefined;
}

export async function getAdminProviders() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const [{ data, error }, modelTiers] = await Promise.all([
    supabase.from('provider_configs').select('*, provider_capabilities(*)').order('created_at', { ascending: false }),
    getModelTiers(['flash', 'advanced']),
  ]);
  if (error) return fail('error', `Provider 能力加载失败：${error.message}`);
  return ok({ providers: ((data ?? []) as ProviderWithCapabilities[]).map(toProviderListItem), modelTiers });
}

export async function saveProviderConfig(formData: FormData): Promise<void> {
  const role = await requireRole('admin');
  if (!role.ok) return;
  const name = String(formData.get('name') ?? '').trim();
  const provider_type = String(formData.get('provider_type') ?? '').trim();
  const base_url = String(formData.get('base_url') ?? '').trim() || null;
  const secret_ref = String(formData.get('secret_ref') ?? '').trim();
  const secret_last_four = String(formData.get('secret_last_four') ?? '').trim() || null;
  const model_id = String(formData.get('model_id') ?? '').trim();
  const selected = providerCapabilities.filter((capability) => formData.get(capability) === 'on');
  if (!name || !provider_type || !secret_ref.startsWith('env:') || !model_id || selected.length === 0) return;
  const supabase = await createClient();
  const { data: provider, error } = await supabase.from('provider_configs').insert({ name, provider_type, base_url, secret_ref, secret_last_four, is_enabled: true, health_status: 'unchecked', created_by: role.data.id }).select('id').single();
  if (error) return;
  const { error: capError } = await supabase.from('provider_capabilities').insert(selected.map((capability) => ({ provider_id: provider.id, capability, model_id, is_enabled: true })));
  if (capError) return;
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
}

export async function saveProviderConfigV2(input: ProviderConfigInput): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  const name = input.name.trim();
  const providerType = input.providerType.trim();
  const baseUrl = input.baseUrl.trim();
  const apiKey = input.apiKey.trim();
  if (!name || !providerType || !baseUrl || !apiKey) return providerFailure('请填写 Provider 名称、类型、Base URL 和 API Key。');
  const now = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase.from('provider_configs').insert({
    name,
    provider_type: providerType,
    base_url: baseUrl,
    secret_ref: encryptSecret(apiKey),
    secret_last_four: lastFour(apiKey),
    secret_created_at: now,
    secret_rotated_at: now,
    is_enabled: true,
    health_status: 'unchecked',
    created_by: role.data.id,
  });
  if (error) return providerFailure(`Provider 保存失败：${error.message}`);
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return providerSuccess('Provider 已保存。');
}

export async function updateProviderConfig(providerId: string, patch: ProviderPatchInput): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  const updates: Database['public']['Tables']['provider_configs']['Update'] = {};
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.providerType !== undefined) updates.provider_type = patch.providerType.trim();
  if (patch.baseUrl !== undefined) updates.base_url = patch.baseUrl?.trim() || null;
  if (patch.isEnabled !== undefined) updates.is_enabled = patch.isEnabled;
  if (patch.apiKey?.trim()) {
    updates.secret_ref = encryptSecret(patch.apiKey.trim());
    updates.secret_last_four = lastFour(patch.apiKey.trim());
    updates.secret_rotated_at = new Date().toISOString();
  }
  const supabase = await createClient();
  const { error } = await supabase.from('provider_configs').update(updates).eq('id', providerId);
  if (error) return providerFailure(`Provider 更新失败：${error.message}`);
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return providerSuccess('Provider 已更新。');
}

export async function updateProviderCapabilities(providerId: string, rows: ProviderCapabilityInput[]): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  const validRows = rows
    .map((row) => ({ capability: row.capability.trim(), modelId: row.modelId.trim() }))
    .filter((row): row is { capability: ProviderCapability; modelId: string } => isProviderCapability(row.capability) && Boolean(row.modelId));
  if (validRows.length === 0) return providerFailure('请至少配置一个有效能力。');
  const supabase = await createClient();
  const { error: deleteError } = await supabase.from('provider_capabilities').delete().eq('provider_id', providerId);
  if (deleteError) return providerFailure(`旧能力清理失败：${deleteError.message}`);
  const { error } = await supabase.from('provider_capabilities').insert(validRows.map((row) => ({ provider_id: providerId, capability: row.capability, model_id: row.modelId, is_enabled: true })));
  if (error) return providerFailure(`能力配置保存失败：${error.message}`);
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return providerSuccess('能力配置已保存。');
}

export async function deleteProvider(providerId: string): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  const supabase = await createClient();
  const tierDelete = await supabase.from('model_tier_bindings').delete().eq('provider_id', providerId);
  if (tierDelete.error) return providerFailure(`模型层绑定清理失败：${tierDelete.error.message}`);
  const capabilityDelete = await supabase.from('provider_capabilities').delete().eq('provider_id', providerId);
  if (capabilityDelete.error) return providerFailure(`Provider 能力清理失败：${capabilityDelete.error.message}`);
  const { error } = await supabase.from('provider_configs').delete().eq('id', providerId);
  if (error) return providerFailure(`Provider 删除失败：${error.message}`);
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return providerSuccess('Provider 已删除。');
}

export async function saveProviderHealthCheck(providerId: string, result: { healthy: boolean; latencyMs: number; message?: string }): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  const supabase = await createClient();
  const { error } = await supabase.from('provider_configs').update({
    health_status: result.healthy ? 'healthy' : 'failed',
    last_health_check_at: new Date().toISOString(),
    last_health_latency_ms: result.latencyMs,
  }).eq('id', providerId);
  if (error) return providerFailure(`健康检查保存失败：${error.message}`);
  revalidatePath('/admin/providers');
  return providerSuccess(result.message ?? '健康检查已保存。');
}

export async function saveProviderApiModels(providerId: string, models: ProviderApiModel[]): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  const apiModels = models.map((model) => ({ id: model.id, ownedBy: model.ownedBy ?? null }));
  const supabase = await createClient();
  const { error } = await supabase.from('provider_configs').update({ api_models: apiModels }).eq('id', providerId);
  if (error) return providerFailure(`模型列表保存失败：${error.message}`);
  revalidatePath('/admin/providers');
  return providerSuccess('模型列表已保存。');
}

export async function saveModelTierBinding(input: { tier: ModelTier; providerId: string; modelId: string }): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  const modelId = input.modelId.trim();
  if (!modelId) return providerFailure('请填写模型 ID。');
  const supabase = await createClient();
  const { error } = await supabase.from('model_tier_bindings').upsert({
    tier: input.tier,
    provider_id: input.providerId,
    model_id: modelId,
    is_enabled: true,
  }, { onConflict: 'tier' });
  if (error) return providerFailure(`模型层保存失败：${error.message}`);
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return providerSuccess('模型层已保存。');
}

export async function getAdminMcp() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase.from('mcp_servers').select('*').order('created_at', { ascending: false });
  if (error) return fail('error', `MCP 能力加载失败：${error.message}`);
  return ok(data ?? []);
}

export async function createMcpServer(input: McpServerInput): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  const name = input.name.trim();
  if (!name) return providerFailure('请填写 MCP Server 名称。');
  const allowedRoles = (input.allowedRoles ?? []).filter((item): item is AppRole => isAppRole(item));
  const insert: McpServerInsert = {
    name,
    description: input.description?.trim() || null,
    connection_ref: input.connectionRef?.trim() || null,
    enabled_tools: (input.enabledTools ?? []) as Json,
    allowed_roles: allowedRoles,
    is_enabled: input.isEnabled ?? false,
    created_by: role.data.id,
  };
  if (input.token?.trim()) {
    insert.secret_ref = encryptSecret(input.token.trim());
    insert.secret_last_four = lastFour(input.token.trim());
  }
  const supabase = await createClient();
  const { error } = await supabase.from('mcp_servers').insert(insert);
  if (error) return providerFailure(`MCP Server 保存失败：${error.message}`);
  revalidatePath('/admin/mcp');
  revalidatePath('/admin');
  return providerSuccess('MCP Server 已保存。');
}

export async function updateMcpServer(id: string, input: McpServerInput): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  const name = input.name.trim();
  if (!name) return providerFailure('请填写 MCP Server 名称。');
  const allowedRoles = (input.allowedRoles ?? []).filter((item): item is AppRole => isAppRole(item));
  const update: McpServerUpdate = {
    name,
    description: input.description?.trim() || null,
    connection_ref: input.connectionRef?.trim() || null,
    enabled_tools: (input.enabledTools ?? []) as Json,
    allowed_roles: allowedRoles,
    is_enabled: input.isEnabled ?? false,
  };
  if (input.token?.trim()) {
    update.secret_ref = encryptSecret(input.token.trim());
    update.secret_last_four = lastFour(input.token.trim());
  }
  const supabase = await createClient();
  const { error } = await supabase.from('mcp_servers').update(update).eq('id', id);
  if (error) return providerFailure(`MCP Server 更新失败：${error.message}`);
  revalidatePath('/admin/mcp');
  revalidatePath('/admin');
  return providerSuccess('MCP Server 已更新。');
}

export async function deleteMcpServer(id: string): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  const supabase = await createClient();
  const { error } = await supabase.from('mcp_servers').delete().eq('id', id);
  if (error) return providerFailure(`MCP Server 删除失败：${error.message}`);
  revalidatePath('/admin/mcp');
  revalidatePath('/admin');
  return providerSuccess('MCP Server 已删除。');
}

export async function getAdminPresets() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase.from('prompt_presets').select('*').order('updated_at', { ascending: false });
  if (error) return fail('error', `Prompt 预设加载失败：${error.message}`);
  return ok(data ?? []);
}

export async function savePromptPreset(formData: FormData): Promise<void>;
export async function savePromptPreset(previousState: AdminActionState, formData: FormData): Promise<AdminActionState>;
export async function savePromptPreset(first: FormData | AdminActionState, second?: FormData): Promise<void | AdminActionState> {
  const { formData, shouldReturnState } = resolveActionArgs(first, second);
  const role = await requireRole('admin');
  if (!role.ok) return shouldReturnState ? actionResult(false, role.message) : undefined;
  const title = String(formData.get('title') ?? '').trim();
  const scenario = String(formData.get('scenario') ?? '').trim();
  const system_instruction = String(formData.get('system_instruction') ?? '').trim();
  const variables = String(formData.get('variables') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const status = String(formData.get('status') ?? 'draft') as 'draft' | 'published' | 'disabled';
  const errors: Record<string, string> = {};
  if (!title) errors.title = '请填写标题。';
  if (!scenario) errors.scenario = '请填写教学场景。';
  if (!system_instruction) errors.system_instruction = '请填写 System Instruction。';
  if (!['draft', 'published', 'disabled'].includes(status)) errors.status = '状态不合法。';
  if (Object.keys(errors).length > 0) return shouldReturnState ? actionResult(false, '请补齐 Prompt 预设信息。', errors) : undefined;
  const supabase = await createClient();
  const { error } = await supabase.from('prompt_presets').insert({ title, scenario, system_instruction, variables, status, target_role: 'teacher', created_by: role.data.id });
  if (error) return shouldReturnState ? actionResult(false, `Prompt 预设保存失败：${error.message}`) : undefined;
  revalidatePath('/admin/presets');
  revalidatePath('/teacher');
  return shouldReturnState ? actionResult(true, 'Prompt 预设已保存。') : undefined;
}

export async function previewUserCsv(csvText: string): Promise<CsvUserPreview> {
  const rows = parseCsv(csvText).map((row, index) => {
    const displayName = row.display_name?.trim() ?? '';
    const loginId = row.login_id?.trim() ?? '';
    const role = isAppRole(row.role?.trim() ?? '') ? row.role.trim() as AppRole : null;
    const className = row.class_name?.trim() || null;
    const errors: string[] = [];
    if (!displayName) errors.push('缺少 display_name');
    if (!loginId) errors.push('缺少 login_id');
    if (!role) errors.push('role 必须是 admin / teacher / student');
    return { rowNumber: index + 2, displayName, loginId, role, className, status: errors.length > 0 ? 'invalid' : 'valid', errors } satisfies CsvUserPreviewRow;
  });
  return { rows, validCount: rows.filter((row) => row.status === 'valid').length, invalidCount: rows.filter((row) => row.status === 'invalid').length };
}

export async function importUsersFromCsv(csvText: string): Promise<{ ok: true; imported: number } | { ok: false; message: string; preview: CsvUserPreview }> {
  const role = await requireRole('admin');
  if (!role.ok) return { ok: false, message: role.message, preview: await previewUserCsv(csvText) };
  const preview = await previewUserCsv(csvText);
  if (preview.invalidCount > 0) return { ok: false, message: 'CSV 存在无效行。', preview };
  const supabase = await createClient();
  let imported = 0;
  for (const row of preview.rows) {
    const { data: profile, error: profileError } = await supabase.from('profiles').upsert({
      id: crypto.randomUUID(),
      display_name: row.displayName,
      login_id: row.loginId,
      role: row.role ?? 'student',
      status: 'active',
    }, { onConflict: 'login_id' }).select('id').single();
    if (profileError) return { ok: false, message: `第 ${row.rowNumber} 行账号导入失败：${profileError.message}`, preview };
    if (row.className && row.role !== 'admin') {
      const { data: classRow, error: classError } = await supabase.from('classes').upsert({ name: row.className, created_by: role.data.id }, { onConflict: 'name' }).select('id').single();
      if (classError) return { ok: false, message: `第 ${row.rowNumber} 行班级导入失败：${classError.message}`, preview };
      const { error: membershipError } = await supabase.from('class_memberships').upsert({ class_id: classRow.id, profile_id: profile.id, role: row.role }, { onConflict: 'class_id,profile_id' });
      if (membershipError) return { ok: false, message: `第 ${row.rowNumber} 行班级关系导入失败：${membershipError.message}`, preview };
    }
    imported += 1;
  }
  revalidatePath('/admin');
  revalidatePath('/admin/classes');
  return { ok: true, imported };
}

export async function getAdminExports() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const [{ data: approved, error: approvedError }, { data: history, error: historyError }] = await Promise.all([
    supabase.from('audit_records').select('*').in('status', ['approved', 'exported']).order('created_at', { ascending: false }),
    supabase.from('export_batches').select('*').order('created_at', { ascending: false }),
  ]);
  if (approvedError) return fail('error', `可导出记录加载失败：${approvedError.message}`);
  if (historyError) return fail('error', `导出历史加载失败：${historyError.message}`);
  return ok({ approved: approved ?? [], history: history ?? [] });
}

export async function createExportBatch(formData: FormData): Promise<void> {
  const role = await requireRole('admin');
  if (!role.ok) return;
  const export_type = String(formData.get('export_type') ?? 'sft') as AuditKind;
  const supabase = await createClient();
  const query = supabase.from('audit_records').select('*');
  const { data: records, error } = export_type === 'review_metadata'
    ? await query.in('status', ['approved', 'exported'])
    : await query.eq('status', 'approved').eq('kind', export_type);
  if (error) return;
  if (!records?.length) return;
  const jsonl = records.map((record) => {
    if (export_type === 'review_metadata') {
      return JSON.stringify({
        source_record_id: record.id,
        source_message_id: record.source_message_id,
        source_conversation_id: record.source_conversation_id,
        auditor_id: record.auditor_id,
        class_id: record.class_id,
        kind: record.kind,
        status: record.status,
        quality: record.quality,
        rationale: record.rationale,
        metadata: record.metadata,
        reviewed_at: record.updated_at,
      });
    }
    return export_type === 'sft'
      ? JSON.stringify({ prompt: record.prompt, completion: record.corrected_answer || record.original_answer, source_record_id: record.id })
      : JSON.stringify({ prompt: record.prompt, chosen: record.chosen_answer, rejected: record.rejected_answer, source_record_id: record.id, rationale: record.rationale });
  }).join('\n');
  const { error: insertError } = await supabase.from('export_batches').insert({ export_type, record_count: records.length, jsonl, created_by: role.data.id });
  if (insertError) return;
  if (export_type !== 'review_metadata') {
    await supabase.from('audit_records').update({ status: 'exported', exported_at: new Date().toISOString() }).in('id', records.map((record) => record.id));
  }
  revalidatePath('/admin/exports');
  revalidatePath('/admin');
}
