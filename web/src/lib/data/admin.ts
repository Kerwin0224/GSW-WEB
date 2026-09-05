'use server';

import { createMCPClient } from '@ai-sdk/mcp';
import { revalidatePath } from 'next/cache';
import { encryptSecret } from '@/lib/crypto/secret-cipher';
import { transportForConnectionRef } from '@/lib/mcp-runtime';
import { assertStdioMcpDisabled, requireAllowedMcpRemoteUrl } from '@/lib/mcp-runtime-policy';
import { createClient } from '@/lib/supabase/server';
import type { AppRole, Database, Json, ModelTier, ProviderCapability } from '@/lib/supabase/database.types';
import { fail, getModelTiers, ok, requireRole, scenarioModelTiers, type DataResult, type ModelTierStatus } from './common';
import { exportDataset } from '@/lib/dataset-export';

export type AdminActionState = { ok: boolean; message: string; errors?: Record<string, string> };
export type ProviderActionResult = { ok: true; message?: string } | { ok: false; message: string };
export type AppRoleArray = AppRole[];
export type AdminProfileStatus = Database['public']['Tables']['profiles']['Row']['status'];
export type AdminUserFilters = { query?: string; role?: AppRole | 'all'; status?: AdminProfileStatus | 'all' };
export type AdminClassMembership = {
  id: string;
  classId: string;
  profileId: string;
  role: 'teacher' | 'student';
  createdAt: string;
  profile: { displayName: string; loginId: string | null; role: AppRole } | null;
  classInfo?: { name: string; grade: string | null } | null;
};
export type AdminClassListItem = {
  id: string;
  name: string;
  grade: string | null;
  status: 'active' | 'archived';
  teachers: AdminClassMembership[];
  students: AdminClassMembership[];
  memberCount: number;
};
export type AdminUserListItem = {
  id: string;
  displayName: string;
  loginId: string | null;
  role: AppRole;
  status: AdminProfileStatus;
  createdAt: string;
  recentActivityLabel: string;
  memberships: AdminClassMembership[];
  assignmentSummary: string;
};
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
export type AdminModelTierStatus = Omit<ModelTierStatus, 'secretRef'>;
export type AdminScenarioTierBinding = { scenario: ProviderCapability; tier: ModelTier };

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

const configurableScenarios = providerCapabilities.filter((capability) => capability !== 'embedding');

const appRoles = ['admin', 'teacher', 'student'] as const satisfies readonly AppRole[];

type ProviderConfigRow = Database['public']['Tables']['provider_configs']['Row'];
type ProviderCapabilityRow = Database['public']['Tables']['provider_capabilities']['Row'];
type McpServerInsert = Database['public']['Tables']['mcp_servers']['Insert'];
type McpServerUpdate = Database['public']['Tables']['mcp_servers']['Update'];

type ProviderWithCapabilities = ProviderConfigRow & { provider_capabilities?: ProviderCapabilityRow[] | null };

function asMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
type ProviderApiModel = { id: string; ownedBy?: string };

type ProviderConfigInput = { name: string; providerType: string; baseUrl: string; apiKey: string };
type ProviderPatchInput = { name?: string; providerType?: string; baseUrl?: string | null; apiKey?: string; isEnabled?: boolean };
type ProviderCapabilityInput = { capability: string; modelId: string };
type McpServerInput = { name?: string; description?: string | null; connectionRef?: string | null; token?: string; enabledTools?: unknown; allowedRoles?: AppRoleArray; isEnabled?: boolean; metadata?: Json; healthStatus?: string };
type McpServerTestResult = { ok: true; message: string; connectionRef: string; serverName: string; toolNames: string[]; healthStatus: string } | { ok: false; message: string };

function actionResult(okResult: boolean, message: string, errors?: Record<string, string>): AdminActionState {
  return { ok: okResult, message, errors };
}

function resolveActionArgs(first: FormData | AdminActionState, second?: FormData) {
  return { formData: second ?? (first as FormData), shouldReturnState: Boolean(second) };
}

function normalizeMcpEnabledTools(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (typeof item !== 'string') return [];
    const tool = item.trim();
    if (!tool || seen.has(tool)) return [];
    seen.add(tool);
    return [tool];
  });
}

function lastFour(secret: string) {
  return secret.slice(-4) || null;
}

function deriveMcpServerName(rawName: string | undefined, connectionRef: string) {
  const name = rawName?.trim();
  if (name) return name;
  const remoteUrl = connectionRef.startsWith('sse:')
    ? connectionRef.slice(4).trim()
    : connectionRef.startsWith('http-mcp:')
      ? connectionRef.slice(9).trim()
      : connectionRef;
  try {
    return new URL(remoteUrl).hostname || '未命名 MCP Server';
  } catch {
    return '未命名 MCP Server';
  }
}

function validateMcpConnectionRef(rawConnectionRef: string) {
  const connectionRef = rawConnectionRef.trim();
  if (!connectionRef) throw new Error('请填写远程 MCP 地址。');
  assertStdioMcpDisabled(connectionRef);
  if (connectionRef.startsWith('sse:')) {
    requireAllowedMcpRemoteUrl(connectionRef.slice(4).trim());
    return connectionRef;
  }
  if (connectionRef.startsWith('http-mcp:')) {
    requireAllowedMcpRemoteUrl(connectionRef.slice(9).trim());
    return connectionRef;
  }
  if (connectionRef.startsWith('http:') || connectionRef.startsWith('https:')) {
    return requireAllowedMcpRemoteUrl(connectionRef);
  }
  throw new Error('仅支持远程 https MCP 地址；可直接填写 https://…，或使用 sse:/http-mcp: 前缀。');
}

function normalizeApiModels(value: Json): ProviderApiModel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const rawId = typeof item.id === 'string' ? item.id : null;
    const id = rawId?.trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
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

async function getScenarioTierBindingsFromDb(supabase: Awaited<ReturnType<typeof createClient>>): Promise<AdminScenarioTierBinding[]> {
  const { data, error } = await supabase
    .from('scenario_tier_bindings')
    .select('scenario,tier,is_enabled')
    .eq('is_enabled', true);
  if (error) throw new Error(`场景路由映射加载失败：${error.message}`);

  const configured = new Map<ProviderCapability, ModelTier>();
  for (const row of data ?? []) {
    if (isProviderCapability(row.scenario) && row.scenario !== 'embedding' && (row.tier === 'flash' || row.tier === 'advanced')) {
      configured.set(row.scenario, row.tier);
    }
  }

  return configurableScenarios.map((scenario) => ({
    scenario,
    tier: configured.get(scenario) ?? scenarioModelTiers[scenario] ?? 'flash',
  }));
}

function toAdminModelTierStatus(status: ModelTierStatus): AdminModelTierStatus {
  const safeStatus = { ...status };
  delete safeStatus.secretRef;
  return safeStatus;
}

async function getAdminModelTiers() {
  const modelTiers = await getModelTiers(['flash', 'advanced']);
  return {
    flash: toAdminModelTierStatus(modelTiers.flash),
    advanced: toAdminModelTierStatus(modelTiers.advanced),
  } satisfies Record<ModelTier, AdminModelTierStatus>;
}

async function syncScenarioCapabilities(supabase: Awaited<ReturnType<typeof createClient>>, bindings: AdminScenarioTierBinding[]) {
  const { error } = await supabase.rpc('save_scenario_tier_bindings_and_sync', {
    p_bindings: bindings.map((binding) => ({ scenario: binding.scenario, tier: binding.tier })) as Json,
  });
  if (error) return providerFailure(`场景能力同步失败：${error.message}`);
  return providerSuccess('场景路由映射已保存，并已同步到运行时能力。');
}

function normalizeMembership(row: {
  id: string;
  class_id: string;
  profile_id: string;
  role: 'teacher' | 'student';
  created_at: string;
  profiles?: { display_name?: string | null; login_id?: string | null; role?: AppRole } | Array<{ display_name?: string | null; login_id?: string | null; role?: AppRole }> | null;
  classes?: { name?: string | null; grade?: string | null } | Array<{ name?: string | null; grade?: string | null }> | null;
}): AdminClassMembership {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const classInfo = Array.isArray(row.classes) ? row.classes[0] : row.classes;
  return {
    id: row.id,
    classId: row.class_id,
    profileId: row.profile_id,
    role: row.role,
    createdAt: row.created_at,
    profile: profile ? {
      displayName: profile.display_name ?? '未命名账号',
      loginId: profile.login_id ?? null,
      role: profile.role ?? row.role,
    } : null,
    classInfo: classInfo ? { name: classInfo.name ?? '未命名班级', grade: classInfo.grade ?? null } : null,
  };
}

function getAssignmentSummary(userRole: AppRole, memberships: AdminClassMembership[]) {
  if (userRole === 'teacher') {
    const teacherClasses = memberships.filter((membership) => membership.role === 'teacher');
    return teacherClasses.length > 0 ? `负责 ${teacherClasses.length} 个班级` : '暂未负责班级';
  }
  if (userRole === 'student') {
    const studentClass = memberships.find((membership) => membership.role === 'student');
    return studentClass?.classInfo?.name ? `所在班级：${studentClass.classInfo.name}` : '未分配班级';
  }
  return '管理员账号不绑定班级';
}

function matchesAdminUserFilters(user: AdminUserListItem, filters: AdminUserFilters) {
  const query = filters.query?.trim().toLowerCase();
  if (filters.role && filters.role !== 'all' && user.role !== filters.role) return false;
  if (filters.status && filters.status !== 'all' && user.status !== filters.status) return false;
  if (!query) return true;
  return [user.displayName, user.loginId ?? '', user.assignmentSummary]
    .some((value) => value.toLowerCase().includes(query));
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

export async function getAdminUsers(filters: AdminUserFilters = {}) {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*, class_memberships(id,class_id,profile_id,role,created_at,classes(name,grade))')
    .order('created_at', { ascending: false });
  if (error) return fail('error', `用户管理加载失败：${error.message}`);
  const users = ((data ?? []) as Array<Database['public']['Tables']['profiles']['Row'] & {
    class_memberships?: Array<{
      id: string;
      class_id: string;
      profile_id: string;
      role: 'teacher' | 'student';
      created_at: string;
      classes?: { name?: string | null; grade?: string | null } | Array<{ name?: string | null; grade?: string | null }> | null;
    }> | null;
  }>).map((user): AdminUserListItem => {
    const memberships = (user.class_memberships ?? []).map((membership) => normalizeMembership({ ...membership, profiles: { display_name: user.display_name, login_id: user.login_id, role: user.role } }));
    return {
      id: user.id,
      displayName: user.display_name,
      loginId: user.login_id,
      role: user.role,
      status: user.status,
      createdAt: user.created_at,
      recentActivityLabel: user.updated_at !== user.created_at
        ? `资料更新：${new Date(user.updated_at).toLocaleString('zh-CN')}`
        : `账号创建：${new Date(user.created_at).toLocaleString('zh-CN')}`,
      memberships,
      assignmentSummary: getAssignmentSummary(user.role, memberships),
    };
  });
  return ok(users.filter((user) => matchesAdminUserFilters(user, filters)));
}

export type AdminDuplicateClassGroup = {
  name: string;
  count: number;
  classes: Array<{ id: string; name: string; grade: string | null; status: 'active' | 'archived'; memberCount: number }>;
};
export type AdminClassesPayload = { classes: AdminClassListItem[]; duplicateGroups: AdminDuplicateClassGroup[] };

export async function getAdminClasses(): Promise<DataResult<AdminClassesPayload>> {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase.from('classes').select('*, class_memberships(id,class_id,profile_id,role,created_at,profiles(display_name,login_id,role))').order('created_at', { ascending: false });
  if (error) return fail('error', `班级关系加载失败：${error.message}`);
  const classes = ((data ?? []) as Array<Database['public']['Tables']['classes']['Row'] & {
    class_memberships?: Array<{
      id: string;
      class_id: string;
      profile_id: string;
      role: 'teacher' | 'student';
      created_at: string;
      profiles?: { display_name?: string | null; login_id?: string | null; role?: AppRole } | Array<{ display_name?: string | null; login_id?: string | null; role?: AppRole }> | null;
    }> | null;
  }>).map((klass): AdminClassListItem => {
    const memberships = (klass.class_memberships ?? []).map(normalizeMembership);
    const teachers = memberships.filter((membership) => membership.role === 'teacher');
    const students = memberships.filter((membership) => membership.role === 'student');
    return {
      id: klass.id,
      name: klass.name,
      grade: klass.grade,
      status: klass.status,
      teachers,
      students,
      memberCount: memberships.length,
    };
  });
  const duplicateGroups = Array.from(classes.reduce((groups, klass) => {
    const existing = groups.get(klass.name) ?? [];
    existing.push({ id: klass.id, name: klass.name, grade: klass.grade, status: klass.status, memberCount: klass.memberCount });
    groups.set(klass.name, existing);
    return groups;
  }, new Map<string, Array<{ id: string; name: string; grade: string | null; status: 'active' | 'archived'; memberCount: number }>>()))
    .filter(([, group]) => group.length > 1)
    .map(([name, group]) => ({ name, count: group.length, classes: group }));
  return ok({ classes, duplicateGroups });
}

export async function addClassMember(formData: FormData): Promise<void> {
  const role = await requireRole('admin');
  if (!role.ok) return;
  const classId = String(formData.get('class_id') ?? '').trim();
  const profileId = String(formData.get('profile_id') ?? '').trim();
  const membershipRole = String(formData.get('role') ?? '').trim();
  if (!classId || !profileId || !['teacher', 'student'].includes(membershipRole)) return;
  const supabase = await createClient();
  const targetRole = membershipRole as 'teacher' | 'student';
  const [{ data: targetClass, error: classError }, { data: targetProfile, error: profileError }] = await Promise.all([
    supabase.from('classes').select('id').eq('id', classId).maybeSingle(),
    supabase.from('profiles').select('id,role,status').eq('id', profileId).maybeSingle(),
  ]);
  if (classError || profileError || !targetClass || !targetProfile || targetProfile.role !== targetRole || targetProfile.status !== 'active') return;
  if (targetRole === 'teacher') {
    const { data: existing, error: existingError } = await supabase
      .from('class_memberships')
      .select('id')
      .eq('class_id', classId)
      .eq('profile_id', profileId)
      .eq('role', 'teacher')
      .limit(1)
      .maybeSingle();
    if (existingError || existing) return;
  }
  if (targetRole === 'student') {
    const { error: migrationError } = await supabase.from('class_memberships').delete().eq('profile_id', profileId).eq('role', 'student');
    if (migrationError) return;
  }
  const { error } = await supabase.from('class_memberships').upsert({ class_id: classId, profile_id: profileId, role: targetRole }, { onConflict: 'class_id,profile_id' });
  if (error) return;
  // 迁班后同步历史项目和会话的 class_id，使新班教师可见所有历史核实记录。
  if (targetRole === 'student') {
    await supabase.from('text_projects').update({ class_id: classId }).eq('owner_id', profileId);
    await supabase.from('conversations').update({ class_id: classId }).eq('owner_id', profileId).eq('source', 'student_chat').is('deleted_at', null);
  }
  revalidatePath('/admin/users');
  revalidatePath('/admin');
}

export async function removeClassMember(formData: FormData): Promise<void> {
  const role = await requireRole('admin');
  if (!role.ok) return;
  const membershipId = String(formData.get('membership_id') ?? '').trim();
  if (!membershipId) return;
  const supabase = await createClient();
  const { error } = await supabase.from('class_memberships').delete().eq('id', membershipId);
  if (error) return;
  revalidatePath('/admin/classes');
  revalidatePath('/admin/users');
  revalidatePath('/admin');
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
  const { data: existing, error: existingError } = await supabase
    .from('classes')
    .select('id,status,grade')
    .eq('name', name)
    .limit(1)
    .maybeSingle();
  if (existingError) return shouldReturnState ? actionResult(false, `班级重复检查失败：${existingError.message}`) : undefined;
  if (existing) {
    const gradeHint = existing.grade ? `（${existing.grade}）` : '';
    return shouldReturnState
      ? actionResult(false, `已存在名为「${name}」${gradeHint}的班级，请直接在该班级中进行成员分配。`, { name: '班级名称已存在。' })
      : undefined;
  }
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
  try {
    const [{ data, error }, modelTiers, scenarioTierBindings] = await Promise.all([
      supabase.from('provider_configs').select('*, provider_capabilities(*)').order('created_at', { ascending: false }),
      getAdminModelTiers(),
      getScenarioTierBindingsFromDb(supabase),
    ]);
    if (error) return fail('error', `Provider 能力加载失败：${error.message}`);
    return ok({ providers: ((data ?? []) as ProviderWithCapabilities[]).map(toProviderListItem), modelTiers, scenarioTierBindings });
  } catch (error) {
    return fail('error', error instanceof Error ? error.message : 'Provider 能力加载失败');
  }
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
    .filter((row): row is { capability: ProviderCapability; modelId: string } => row.capability === 'embedding' && Boolean(row.modelId));
  if (validRows.length === 0) return providerFailure('场景能力由场景路由映射管理；这里只能配置 Embedding 能力。');
  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from('provider_capabilities')
    .delete()
    .eq('provider_id', providerId)
    .eq('capability', 'embedding');
  if (deleteError) return providerFailure(`旧 Embedding 能力清理失败：${deleteError.message}`);
  const { error } = await supabase.from('provider_capabilities').insert(validRows.map((row) => ({ provider_id: providerId, capability: row.capability, model_id: row.modelId, is_enabled: true })));
  if (error) return providerFailure(`Embedding 能力保存失败：${error.message}`);

  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return providerSuccess('Embedding 能力已保存。');
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
  const seen = new Set<string>();
  const apiModels = models.flatMap((model) => {
    const id = model.id.trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, ownedBy: model.ownedBy ?? null }];
  });
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
  const { error } = await supabase.rpc('save_model_tier_binding_and_sync', {
    p_tier: input.tier,
    p_provider_id: input.providerId,
    p_model_id: modelId,
  });
  if (error) return providerFailure(`模型层保存失败：${error.message}`);

  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return providerSuccess('模型层已保存，并已按自定义场景映射同步。');
}

export async function saveScenarioTierBindings(input: AdminScenarioTierBinding[]): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  const normalized = configurableScenarios.map((scenario) => {
    const tier = input.find((binding) => binding.scenario === scenario)?.tier ?? scenarioModelTiers[scenario] ?? 'flash';
    return { scenario, tier } satisfies AdminScenarioTierBinding;
  });
  const supabase = await createClient();
  const syncResult = await syncScenarioCapabilities(supabase, normalized);
  if (!syncResult.ok) return syncResult;
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return syncResult;
}

export async function getAdminMcp() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase.from('mcp_servers').select('*').order('created_at', { ascending: false });
  if (error) return fail('error', `MCP 能力加载失败：${error.message}`);
  return ok(data ?? []);
}

export async function testMcpServerConnection(input: McpServerInput): Promise<McpServerTestResult> {
  const role = await requireRole('admin');
  if (!role.ok) return { ok: false, message: role.message };

  let connectionRef: string;
  try {
    connectionRef = validateMcpConnectionRef(input.connectionRef ?? '');
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'MCP 连接配置不合法。' };
  }

  const serverName = deriveMcpServerName(input.name, connectionRef);
  let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;

  try {
    client = await createMCPClient({
      transport: transportForConnectionRef(connectionRef, input.token?.trim() || undefined),
    });
    const tools = await client.tools();
    const toolNames = Object.keys(tools).sort((a, b) => a.localeCompare(b));

    return {
      ok: true,
      message: toolNames.length > 0 ? `连接成功，发现 ${toolNames.length} 个工具。` : '连接成功，但服务端未暴露任何工具。',
      connectionRef,
      serverName,
      toolNames,
      healthStatus: 'healthy',
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? `MCP 测试失败：${error.message}` : 'MCP 测试失败。' };
  } finally {
    await client?.close();
  }
}

export async function createMcpServer(input: McpServerInput): Promise<ProviderActionResult> {
  const role = await requireRole('admin');
  if (!role.ok) return providerFailure(role.message);
  let connectionRef: string;
  try {
    connectionRef = validateMcpConnectionRef(input.connectionRef ?? '');
  } catch (error) {
    return providerFailure(error instanceof Error ? error.message : 'MCP 连接配置不合法。');
  }
  const name = deriveMcpServerName(input.name, connectionRef);
  const allowedRoles = (input.allowedRoles ?? []).filter((item): item is AppRole => item !== 'admin' && isAppRole(item));
  const insert: McpServerInsert = {
    name,
    description: input.description?.trim() || null,
    connection_ref: connectionRef,
    enabled_tools: normalizeMcpEnabledTools(input.enabledTools) as Json,
    allowed_roles: allowedRoles,
    metadata: (input.metadata ?? {}) as Json,
    is_enabled: input.isEnabled ?? false,
    health_status: input.healthStatus?.trim() || 'unchecked',
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
  let connectionRef: string;
  try {
    connectionRef = validateMcpConnectionRef(input.connectionRef ?? '');
  } catch (error) {
    return providerFailure(error instanceof Error ? error.message : 'MCP 连接配置不合法。');
  }
  const name = deriveMcpServerName(input.name, connectionRef);
  const allowedRoles = (input.allowedRoles ?? []).filter((item): item is AppRole => item !== 'admin' && isAppRole(item));
  const update: McpServerUpdate = {
    name,
    description: input.description?.trim() || null,
    connection_ref: connectionRef,
    enabled_tools: normalizeMcpEnabledTools(input.enabledTools) as Json,
    allowed_roles: allowedRoles,
    metadata: (input.metadata ?? {}) as Json,
    is_enabled: input.isEnabled ?? false,
    health_status: input.healthStatus?.trim() || 'unchecked',
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
      if (row.role === 'student') {
        const { error: transferError } = await supabase.from('class_memberships').delete().eq('profile_id', profile.id).eq('role', 'student');
        if (transferError) return { ok: false, message: `第 ${row.rowNumber} 行自动迁班失败：${transferError.message}`, preview };
      } else if (row.role === 'teacher') {
        const { data: existingTeacher, error: existingTeacherError } = await supabase
          .from('class_memberships')
          .select('id')
          .eq('class_id', classRow.id)
          .eq('profile_id', profile.id)
          .eq('role', 'teacher')
          .limit(1)
          .maybeSingle();
        if (existingTeacherError) return { ok: false, message: `第 ${row.rowNumber} 行教师关系检查失败：${existingTeacherError.message}`, preview };
        if (existingTeacher) {
          imported += 1;
          continue;
        }
      }
      const { error: membershipError } = await supabase.from('class_memberships').upsert({ class_id: classRow.id, profile_id: profile.id, role: row.role }, { onConflict: 'class_id,profile_id' });
      if (membershipError) return { ok: false, message: `第 ${row.rowNumber} 行班级关系导入失败：${membershipError.message}`, preview };
      // 迁班后同步历史项目和会话的 class_id，使新班教师可见所有历史核实记录。
      if (row.role === 'student') {
        await supabase.from('text_projects').update({ class_id: classRow.id }).eq('owner_id', profile.id);
        await supabase.from('conversations').update({ class_id: classRow.id }).eq('owner_id', profile.id).eq('source', 'student_chat').is('deleted_at', null);
      }
    }
    imported += 1;
  }
  revalidatePath('/admin');
  revalidatePath('/admin/users');
  revalidatePath('/admin/classes');
  return { ok: true, imported };
}

export async function getAdminExports() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const [{ data: approved, error: approvedError }, { data: history, error: historyError }] = await Promise.all([
    supabase
      .from('audit_records')
      .select('id,source_message_id,status,metadata,created_at,updated_at')
      .in('status', ['approved', 'exported'])
      .not('source_message_id', 'is', null)
      .order('created_at', { ascending: false }),
    supabase.from('export_batches').select('*').order('created_at', { ascending: false }),
  ]);
  if (approvedError) return fail('error', `可导出记录加载失败：${approvedError.message}`);
  if (historyError) return fail('error', `导出历史加载失败：${historyError.message}`);

  const latestByMessage = new Map<string, { id: string; status: string; created_at: string; updated_at: string; metadata: unknown }>();
  for (const record of approved ?? []) {
    if (!record.source_message_id) continue;
    if (asMetadataObject(record.metadata).conversation_action !== 'conversation_finalized') continue;
    const previous = latestByMessage.get(record.source_message_id);
    const recordTime = record.updated_at || record.created_at;
    const previousTime = previous ? previous.updated_at || previous.created_at : '';
    if (!previous || recordTime >= previousTime) latestByMessage.set(record.source_message_id, record);
  }

  const exportable = [...latestByMessage.values()].filter((record) => record.status === 'approved');
  return ok({ approved: exportable, history: history ?? [] });
}

export async function createExportBatch(formData: FormData): Promise<void> {
  const role = await requireRole('admin');
  if (!role.ok) return;

  const exportType = String(formData.get('export_type') ?? 'sft') === 'dpo' ? 'dpo' : 'sft';
  const result = await exportDataset(exportType);
  if (!result.success) return;

  const supabase = await createClient();
  const { data: batch, error: insertError } = await supabase.from('export_batches').insert({
    export_type: exportType,
    record_count: result.recordCount,
    jsonl: result.jsonl,
    created_by: role.data.id,
  }).select('id').single();
  if (insertError || !batch) return;

  const { error: exportMarkError } = await supabase
    .from('audit_records')
    .update({ status: 'exported', exported_at: result.exportedAt })
    .in('id', result.recordIds);

  if (exportMarkError) {
    await supabase.from('export_batches').delete().eq('id', batch.id);
    return;
  }

  revalidatePath('/admin/exports');
  revalidatePath('/admin');
}
