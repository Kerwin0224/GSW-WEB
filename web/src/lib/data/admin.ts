'use server';

import { createMCPClient } from '@ai-sdk/mcp';
import { revalidatePath } from 'next/cache';
import { encryptSecret } from '@/lib/crypto/secret-cipher';
import { transportForConnectionRef } from '@/lib/mcp-runtime';
import { assertStdioMcpDisabled, requireAllowedMcpRemoteUrl } from '@/lib/mcp-runtime-policy';
import { createDatabaseSessionSignature } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { APP_ROLES, type AppRole, type Database, type Json, type ModelTier, type ProviderCapability } from '@/lib/supabase/database.types';
import { fail, getModelTiers, ok, requireAnyRole, requireRole, scenarioModelTiers, type DataResult, type ModelTierStatus } from './common';
import { asMetadataObject } from './audit-record';
import { assertAllowedProviderBaseUrl } from '@/lib/provider-endpoint-policy';

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
  subject: string | null;
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
  subject: string | null;
  className: string | null;
  status: 'valid' | 'invalid';
  errors: string[];
  /** 本校已存在同 login_id 账号时的角色；null = 这次会新建。 */
  existingRole: AppRole | null;
  /** 这一行是覆盖已有账号而不是新建（覆盖只动姓名，不动密码）。 */
  willUpdate: boolean;
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

type ProviderConfigRow = Database['public']['Tables']['provider_configs']['Row'];
type ProviderCapabilityRow = Database['public']['Tables']['provider_capabilities']['Row'];
type McpServerInsert = Database['public']['Tables']['mcp_servers']['Insert'];
type McpServerUpdate = Database['public']['Tables']['mcp_servers']['Update'];

type ProviderWithCapabilities = ProviderConfigRow & { provider_capabilities?: ProviderCapabilityRow[] | null };

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
    /** null = 公司级模板（所有校可用）；非空 = 该校自带。 */
    schoolId: provider.school_id,
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
  return APP_ROLES.includes(value as AppRole);
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
    if (teacherClasses.length === 0) return '暂未负责班级';
    // 只给数量时管理员无法判断教师到底带哪些班（同校重名班级尤其容易混淆），
    // 因此列出班级名；超过 3 个再折叠为"等 N 个"。
    const names = teacherClasses.map((membership) => membership.classInfo?.name?.trim() || '未命名班级');
    const head = names.slice(0, 3).join('、');
    return names.length > 3 ? `负责：${head} 等 ${names.length} 个班级` : `负责：${head}`;
  }
  if (userRole === 'student') {
    const studentClass = memberships.find((membership) => membership.role === 'student');
    const name = studentClass?.classInfo?.name?.trim();
    const grade = studentClass?.classInfo?.grade?.trim();
    if (!name) return '未分配班级';
    return grade ? `所在班级：${name}（${grade}）` : `所在班级：${name}`;
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

/**
 * 按 RFC4180 解析 CSV：引号包裹、字段内逗号与换行、"" 转义。
 *
 * 名册是用户从 Excel/WPS 导出的，引用与内嵌逗号都合法；朴素的 split(',')
 * 会把含逗号的 class_name 切成两格，Object.fromEntries 取 cells[index] 后
 * 字段静默错位——预览看着"有效"，实际把学生挂进错的班级。
 */
function parseCsv(csvText: string): Record<string, string>[] {
  const table: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    if (inQuotes) {
      if (char !== '"') { cell += char; continue; }
      if (csvText[index + 1] === '"') { cell += '"'; index += 1; continue; }
      inQuotes = false;
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === ',') { row.push(cell); cell = ''; continue; }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && csvText[index + 1] === '\n') index += 1;
      row.push(cell);
      table.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  row.push(cell);
  table.push(row);

  const [headerRow, ...dataRows] = table.filter((cells) => cells.some((value) => value.trim()));
  if (!headerRow) return [];
  const headers = headerRow.map((header) => header.trim());
  return dataRows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? '').trim()])));
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
      subject: user.subject,
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

export async function addClassMember(formData: FormData): Promise<AdminActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return actionResult(false, role.message);
  const classId = String(formData.get('class_id') ?? '').trim();
  const profileId = String(formData.get('profile_id') ?? '').trim();
  const membershipRole = String(formData.get('role') ?? '').trim();
  if (!classId || !profileId || !['teacher', 'student'].includes(membershipRole)) {
    return actionResult(false, '参数不完整：请选择班级与成员。');
  }
  const supabase = await createClient();
  const targetRole = membershipRole as 'teacher' | 'student';
  const [{ data: targetClass, error: classError }, { data: targetProfile, error: profileError }] = await Promise.all([
    supabase.from('classes').select('id,name').eq('id', classId).maybeSingle(),
    supabase.from('profiles').select('id,display_name,role,status').eq('id', profileId).maybeSingle(),
  ]);
  if (classError) return actionResult(false, `班级读取失败：${classError.message}`);
  if (profileError) return actionResult(false, `成员读取失败：${profileError.message}`);
  if (!targetClass) return actionResult(false, '班级不存在或当前账号无权访问。');
  if (!targetProfile) return actionResult(false, '成员不存在或不属于本校。');
  if (targetProfile.role !== targetRole) {
    return actionResult(false, `「${targetProfile.display_name}」当前角色是 ${targetProfile.role}，不能作为${targetRole === 'teacher' ? '教师' : '学生'}加入班级。`);
  }
  if (targetProfile.status !== 'active') return actionResult(false, `「${targetProfile.display_name}」已停用，请先启用再分配班级。`);

  if (targetRole === 'student') {
    // 迁班 = 删旧关系 + 插新关系 + 同步 projects/conversations.class_id，一个事务。
    // 应用层那四步每步一个请求，中途失败就是「不属于任何班、历史还指着旧班」的半迁移态。
    const { data: touched, error: transferError } = await supabase.rpc('transfer_student_to_class', {
      p_profile_id: profileId,
      p_class_id: classId,
    });
    if (transferError) return actionResult(false, `学生迁班失败：${transferError.message}`);
    revalidatePath('/admin/classes');
    revalidatePath('/admin/users');
    revalidatePath('/admin');
    const synced = Math.max(Number(touched ?? 0) - 1, 0);
    return actionResult(true, `「${targetProfile.display_name}」已迁入「${targetClass.name}」${synced > 0 ? `，并同步了 ${synced} 条历史项目/会话。` : '。'}`);
  }

  const { data: existing, error: existingError } = await supabase
    .from('class_memberships')
    .select('id')
    .eq('class_id', classId)
    .eq('profile_id', profileId)
    .eq('role', 'teacher')
    .limit(1)
    .maybeSingle();
  if (existingError) return actionResult(false, `教师关系检查失败：${existingError.message}`);
  // 幂等：教师可以负责多个班，重复加入同一班不是错误，说清楚即可。
  if (existing) return actionResult(true, `「${targetProfile.display_name}」已经在这个班的教师名单里。`);

  // insert + select：0 行说明 RLS 没放行，不是"已加入"。
  const { data: inserted, error: insertError } = await supabase
    .from('class_memberships')
    .insert({ class_id: classId, profile_id: profileId, role: 'teacher' })
    .select('id');
  if (insertError) return actionResult(false, `加入班级失败：${insertError.message}`);
  if (!inserted || inserted.length === 0) return actionResult(false, '加入班级失败：当前账号无权管理该班级。');
  revalidatePath('/admin/classes');
  revalidatePath('/admin/users');
  revalidatePath('/admin');
  return actionResult(true, `「${targetProfile.display_name}」已加入「${targetClass.name}」的教师名单。`);
}

export async function removeClassMember(formData: FormData): Promise<AdminActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return actionResult(false, role.message);
  const membershipId = String(formData.get('membership_id') ?? '').trim();
  if (!membershipId) return actionResult(false, '缺少成员关系记录。');
  const supabase = await createClient();
  const { data: removed, error } = await supabase.from('class_memberships').delete().eq('id', membershipId).select('id');
  if (error) return actionResult(false, `移出班级失败：${error.message}`);
  if (!removed || removed.length === 0) return actionResult(false, '该成员关系已不存在或当前账号无权移出。');
  revalidatePath('/admin/classes');
  revalidatePath('/admin/users');
  revalidatePath('/admin');
  return actionResult(true, '已移出该班级。');
}

/**
 * 批量把账号恢复为初始密码（初始密码 = 学号/工号本身，并重新强制首登改密）。
 *
 * 边界校验做两层，缺一不可：
 *   · 应用层：先按 caller.school_id 把这批 id 查出来，越界的直接拒绝并点名。
 *     只靠 DB 的话，界面上选中的每一行都会各自静默失败，管理员看到的是
 *     「已重置 N 个」而 N 后面跟着一条看不懂的 RPC 报错。
 *   · DB 层：set_initial_password_by_profile 内部的 can_admin_profile（唯一闸门）。
 */
export async function resetInitialPasswords(profileIds: string[]): Promise<AdminActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return actionResult(false, role.message);
  if (profileIds.length === 0) return actionResult(false, '请先选择要重置的账号。');
  const supabase = await createClient();
  if (!role.data.school_id) {
    return actionResult(false, '当前管理员账号未归属任何学校，无法重置他人密码。请联系公司管理员补齐归属。');
  }
  const { data: targets, error: lookupError } = await supabase
    .from('profiles')
    .select('id,display_name,school_id')
    .in('id', profileIds);
  if (lookupError) return actionResult(false, `账号查询失败：${lookupError.message}`);
  const found = new Map((targets ?? []).map((row) => [row.id, row]));
  const crossTenant = profileIds.filter((id) => found.get(id)?.school_id !== role.data.school_id);
  if (crossTenant.length > 0) {
    const names = crossTenant.map((id) => found.get(id)?.display_name ?? id);
    return actionResult(false, `已拒绝：${names.join('、')} 不属于本校，无法重置密码。`);
  }
  let reset = 0;
  for (const profileId of profileIds) {
    const { error } = await supabase.rpc('set_initial_password_by_profile', {
      p_profile_id: profileId,
      p_server_signature: createDatabaseSessionSignature(`pw:${profileId}`),
    });
    if (error) {
      return actionResult(false, `已重置 ${reset} 个账号，第 ${reset + 1} 个失败：${error.message}`);
    }
    reset += 1;
  }
  revalidatePath('/admin/users');
  return actionResult(true, `已将 ${reset} 个账号恢复为初始密码（学号/工号），对方下次登录会被要求改密，旧会话已失效。`);
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
  // 校 admin 与 org_admin 都要进得来：前者管本校自带，后者管公司级模板与各校。
  // 看得到哪些行由 RLS 决定（can_read_school_scope），不在这里过滤。
  const role = await requireAnyRole(['admin', 'org_admin']);
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


export async function saveProviderConfigV2(input: ProviderConfigInput): Promise<ProviderActionResult> {
  const role = await requireAnyRole(['admin', 'org_admin']);
  if (!role.ok) return providerFailure(role.message);
  const name = input.name.trim();
  const providerType = input.providerType.trim();
  const apiKey = input.apiKey.trim();
  if (!name || !providerType || !input.baseUrl.trim() || !apiKey) return providerFailure('请填写 Provider 名称、类型、Base URL 和 API Key。');
  // base_url 决定带密钥的出站请求发到哪里：与 MCP 远程地址同一道闸门（见 @/lib/provider-endpoint-policy）。
  let baseUrl: string;
  try {
    baseUrl = assertAllowedProviderBaseUrl(input.baseUrl.trim());
  } catch (error) {
    return providerFailure(error instanceof Error ? error.message : 'Base URL 不合法。');
  }
  const now = new Date().toISOString();
  const supabase = await createClient();
  // insert ... select：不加 select 时 PostgREST 恒返回空数组，"插入失败"只能靠 error 分支，
  // 而 RLS 静默过滤掉的插入既不报 error 也不返回行——那正是"保存成功但列表里没有它"。
  const { data: inserted, error } = await supabase.from('provider_configs').insert({
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
  }).select('id');
  if (error) return providerFailure(`Provider 保存失败：${error.message}`);
  if (!inserted || inserted.length === 0) return providerFailure('Provider 保存失败：数据库没有接受这行记录（可能被权限策略过滤），请确认当前账号可管理该层级的 Provider。');
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return providerSuccess('Provider 已保存。');
}

export async function updateProviderConfig(providerId: string, patch: ProviderPatchInput): Promise<ProviderActionResult> {
  const role = await requireAnyRole(['admin', 'org_admin']);
  if (!role.ok) return providerFailure(role.message);
  const updates: Database['public']['Tables']['provider_configs']['Update'] = {};
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.providerType !== undefined) updates.provider_type = patch.providerType.trim();
  if (patch.baseUrl !== undefined) {
    if (!patch.baseUrl?.trim()) updates.base_url = null;
    else {
      let baseUrl: string;
      try {
        baseUrl = assertAllowedProviderBaseUrl(patch.baseUrl.trim());
      } catch (error) {
        return providerFailure(error instanceof Error ? error.message : 'Base URL 不合法。');
      }
      updates.base_url = baseUrl;
    }
  }
  if (patch.isEnabled !== undefined) updates.is_enabled = patch.isEnabled;
  if (patch.apiKey?.trim()) {
    updates.secret_ref = encryptSecret(patch.apiKey.trim());
    updates.secret_last_four = lastFour(patch.apiKey.trim());
    updates.secret_rotated_at = new Date().toISOString();
  }
  if (Object.keys(updates).length === 0) return providerFailure('没有需要更新的字段。');
  const supabase = await createClient();
  // 同上：0 行 = RLS 没放行这行，而不是"已更新"。
  const { data: updated, error } = await supabase.from('provider_configs').update(updates).eq('id', providerId).select('id');
  if (error) return providerFailure(`Provider 更新失败：${error.message}`);
  if (!updated || updated.length === 0) return providerFailure('Provider 未更新：该 Provider 不存在，或当前账号无权修改（可能已被他人删除）。');
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return providerSuccess('Provider 已更新。');
}

export async function updateProviderCapabilities(providerId: string, rows: ProviderCapabilityInput[]): Promise<ProviderActionResult> {
  const role = await requireAnyRole(['admin', 'org_admin']);
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
  const { data: inserted, error } = await supabase
    .from('provider_capabilities')
    .insert(validRows.map((row) => ({ provider_id: providerId, capability: row.capability, model_id: row.modelId, is_enabled: true })))
    .select('id');
  if (error) return providerFailure(`Embedding 能力保存失败：${error.message}`);
  if (!inserted || inserted.length === 0) return providerFailure('Embedding 能力未保存：该 Provider 不存在或当前账号无权配置。');
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return providerSuccess('Embedding 能力已保存。');
}

export async function deleteProvider(providerId: string): Promise<ProviderActionResult> {
  const role = await requireAnyRole(['admin', 'org_admin']);
  if (!role.ok) return providerFailure(role.message);
  const supabase = await createClient();
  const tierDelete = await supabase.from('model_tier_bindings').delete().eq('provider_id', providerId);
  if (tierDelete.error) return providerFailure(`模型层绑定清理失败：${tierDelete.error.message}`);
  const capabilityDelete = await supabase.from('provider_capabilities').delete().eq('provider_id', providerId);
  if (capabilityDelete.error) return providerFailure(`Provider 能力清理失败：${capabilityDelete.error.message}`);
  const { data: deleted, error } = await supabase.from('provider_configs').delete().eq('id', providerId).select('id');
  if (error) return providerFailure(`Provider 删除失败：${error.message}`);
  if (!deleted || deleted.length === 0) return providerFailure('Provider 未删除：该 Provider 不存在，或当前账号无权删除。');
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return providerSuccess('Provider 已删除。');
}

export async function saveProviderHealthCheck(providerId: string, result: { healthy: boolean; latencyMs: number; message?: string }): Promise<ProviderActionResult> {
  const role = await requireAnyRole(['admin', 'org_admin']);
  if (!role.ok) return providerFailure(role.message);
  const supabase = await createClient();
  const { data: updated, error } = await supabase.from('provider_configs').update({
    health_status: result.healthy ? 'healthy' : 'failed',
    last_health_check_at: new Date().toISOString(),
    last_health_latency_ms: result.latencyMs,
  }).eq('id', providerId).select('id');
  if (error) return providerFailure(`健康检查保存失败：${error.message}`);
  if (!updated || updated.length === 0) return providerFailure(`健康检查结果未能保存：Provider ${providerId} 不存在或无权写入。`);
  revalidatePath('/admin/providers');
  return providerSuccess(result.message ?? '健康检查已保存。');
}

export async function saveProviderApiModels(providerId: string, models: ProviderApiModel[]): Promise<ProviderActionResult> {
  const role = await requireAnyRole(['admin', 'org_admin']);
  if (!role.ok) return providerFailure(role.message);
  const seen = new Set<string>();
  const apiModels = models.flatMap((model) => {
    const id = model.id.trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, ownedBy: model.ownedBy ?? null }];
  });
  const supabase = await createClient();
  const { data: updated, error } = await supabase.from('provider_configs').update({ api_models: apiModels }).eq('id', providerId).select('id');
  if (error) return providerFailure(`模型列表保存失败：${error.message}`);
  if (!updated || updated.length === 0) return providerFailure(`模型列表未能保存：Provider ${providerId} 不存在或无权写入。`);
  revalidatePath('/admin/providers');
  return providerSuccess('模型列表已保存。');
}

export async function saveModelTierBinding(input: { tier: ModelTier; providerId: string; modelId: string }): Promise<ProviderActionResult> {
  const role = await requireAnyRole(['admin', 'org_admin']);
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
  // 场景路由决定「哪个场景走哪个 tier」，是公司级资产：改它会影响所有学校。
  // 学校要换的是 tier 绑到哪个 Provider（saveModelTierBinding），不是这套映射。
  const role = await requireRole('org_admin');
  if (!role.ok) return providerFailure('场景路由映射是公司级配置，仅公司管理员可改。');
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
  const role = await requireAnyRole(['admin', 'org_admin']);
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase.from('mcp_servers').select('*').order('created_at', { ascending: false });
  if (error) return fail('error', `MCP 能力加载失败：${error.message}`);
  return ok(data ?? []);
}

export async function testMcpServerConnection(input: McpServerInput): Promise<McpServerTestResult> {
  const role = await requireAnyRole(['admin', 'org_admin']);
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
  const role = await requireAnyRole(['admin', 'org_admin']);
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
  const role = await requireAnyRole(['admin', 'org_admin']);
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
  const role = await requireAnyRole(['admin', 'org_admin']);
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

/**
 * CSV 名册预览。除了字段级校验，还必须回答管理员真正会问的那两个问题：
 *   · 这一行会**新建**账号还是**覆盖**已有账号？（同校同 login_id）
 *   · 如果角色和已有账号不一致，这是在**提权**（student → admin）还是**降权**？
 * 两者都不检查的话，一次手滑的 CSV 就能把整届学生的角色改掉，而预览页全是绿的。
 *
 * 角色不一致一律判 invalid：角色是权限边界，只能显式改，不能由一次名册导入顺带完成
 * （DB 侧 provision_school_account 同样拒绝，见 20260926102000）。
 */
export async function previewUserCsv(csvText: string): Promise<CsvUserPreview> {
  const caller = await requireRole('admin');
  const schoolId = caller.ok ? caller.data.school_id : null;
  const parsed = parseCsv(csvText);
  // 同校已有账号：一次性查回来，不逐行打数据库。
  const loginIds = new Set(parsed.map((row) => row.login_id?.trim() ?? '').filter((loginId) => /^\d{8}$/.test(loginId)));
  const existingByLoginId = new Map<string, AppRole>();
  if (schoolId && loginIds.size > 0) {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from('profiles')
      .select('login_id,role')
      .eq('school_id', schoolId)
      .in('login_id', [...loginIds]);
    for (const row of existing ?? []) if (row.login_id) existingByLoginId.set(row.login_id, row.role);
  }

  const seen = new Set<string>();
  const rows = parsed.map((row, index) => {
    const displayName = row.display_name?.trim() ?? '';
    const loginId = row.login_id?.trim() ?? '';
    const role = isAppRole(row.role?.trim() ?? '') ? row.role.trim() as AppRole : null;
    const subject = row.subject?.trim() || null;
    const className = row.class_name?.trim() || null;
    const errors: string[] = [];
    if (!displayName) errors.push('缺少姓名');
    if (!loginId) errors.push('缺少账号');
    else if (!/^\d{8}$/.test(loginId)) errors.push('账号必须是 8 位数字');
    if (loginId && seen.has(loginId)) errors.push('账号在文件内重复');
    if (loginId) seen.add(loginId);
    if (!role) errors.push('角色必须是管理员 / 教师 / 学生');
    if (role === 'teacher' && !subject) errors.push('教师缺少科目');
    const existingRole = existingByLoginId.get(loginId) ?? null;
    if (existingRole && role && existingRole !== role) {
      errors.push(`该工号在本校已是 ${existingRole}，本次要改成 ${role}（权限变更），必须显式处理`);
    }
    return {
      rowNumber: index + 2,
      displayName,
      loginId,
      role,
      subject,
      className,
      status: errors.length > 0 ? 'invalid' : 'valid',
      errors,
      existingRole,
      willUpdate: existingRole !== null,
    } satisfies CsvUserPreviewRow;
  });
  return { rows, validCount: rows.filter((row) => row.status === 'valid').length, invalidCount: rows.filter((row) => row.status === 'invalid').length };
}

export type CsvImportResult = {
  ok: boolean;
  message: string;
  /** 成功写入（新建或覆盖）的行数；失败时为已成功的那部分。 */
  imported: number;
  /** 与 imported 同值，语义化别名：失败时它是"已成功"，不是"总共"。 */
  succeededCount: number;
  preview: CsvUserPreview;
};

export async function importUsersFromCsv(csvText: string): Promise<CsvImportResult> {
  const role = await requireRole('admin');
  const preview = await previewUserCsv(csvText);
  if (!role.ok) return { ok: false, message: role.message, imported: 0, succeededCount: 0, preview };
  // 校 admin 导入本校名册；班级与账号都挂到调用者的学校（org_admin 的学校归属后续版本放开）。
  const schoolId = role.data.school_id;
  if (preview.invalidCount > 0) {
    return { ok: false, message: `CSV 存在 ${preview.invalidCount} 行无效数据（见预览表），未导入任何账号。`, imported: 0, succeededCount: 0, preview };
  }
  if (!schoolId) {
    return { ok: false, message: '当前管理员账号未归属任何学校，无法导入名册。', imported: 0, succeededCount: 0, preview };
  }
  const supabase = await createClient();
  let imported = 0;
  for (const row of preview.rows) {
    // provision RPC 一次完成 auth.users 镜像 + profile + 初始密码（学号）+ 强制改密；
    // 重导入（同校同号、角色相同）仅更新姓名，不动密码——角色不同则 RPC 直接拒绝。
    const { data: profileId, error: provisionError } = await supabase.rpc('provision_school_account', {
      p_login_id: row.loginId,
      p_display_name: row.displayName,
      p_role: row.role ?? 'student',
      p_school_id: schoolId,
      p_server_signature: createDatabaseSessionSignature('provision_school_account'),
    });
    // 逐行推进，所以任何一步失败都必须报「已经成功了多少」：批量导入半途停下时，
    // 只说"失败"的管理员会以为整份名册都没进去，然后重跑一遍。
    if (provisionError || !profileId) {
      return { ok: false, message: `第 ${row.rowNumber} 行账号导入失败：${provisionError?.message ?? 'unknown'}（已成功 ${imported} 行）`, imported, succeededCount: imported, preview };
    }
    const profileIdText = String(profileId);
    if (row.role === 'teacher') {
      const { data: synced, error: subjectError } = await supabase.from('profiles').update({ subject: row.subject }).eq('id', profileIdText).select('id');
      if (subjectError || !synced || synced.length === 0) {
        return { ok: false, message: `第 ${row.rowNumber} 行教师科目未能保存：${subjectError?.message ?? '账号不属于本校或已被停用'}（已成功 ${imported} 行）`, imported, succeededCount: imported, preview };
      }
    }
    if (row.className && row.role !== 'admin') {
      const { data: classRow, error: classError } = await supabase.from('classes').upsert({ name: row.className, school_id: schoolId, created_by: role.data.id }, { onConflict: 'school_id,name' }).select('id').single();
      if (classError || !classRow) {
        return { ok: false, message: `第 ${row.rowNumber} 行班级导入失败：${classError?.message ?? '未返回班级记录'}（已成功 ${imported} 行）`, imported, succeededCount: imported, preview };
      }
      if (row.role === 'student') {
        // 迁班走 RPC：删旧关系 + 插新关系 + 同步历史项目/会话，一个事务，失败不留半迁移态。
        const { error: transferError } = await supabase.rpc('transfer_student_to_class', {
          p_profile_id: profileIdText,
          p_class_id: classRow.id,
        });
        if (transferError) {
          return { ok: false, message: `第 ${row.rowNumber} 行自动迁班失败：${transferError.message}（已成功 ${imported} 行）`, imported, succeededCount: imported, preview };
        }
      } else {
        // 教师可以带多个班，重复加入同一班是幂等的，不是错误。
        const { data: existingTeacher, error: existingTeacherError } = await supabase
          .from('class_memberships')
          .select('id')
          .eq('class_id', classRow.id)
          .eq('profile_id', profileIdText)
          .eq('role', 'teacher')
          .limit(1)
          .maybeSingle();
        if (existingTeacherError) {
          return { ok: false, message: `第 ${row.rowNumber} 行教师关系检查失败：${existingTeacherError.message}（已成功 ${imported} 行）`, imported, succeededCount: imported, preview };
        }
        if (!existingTeacher) {
          const { data: linked, error: membershipError } = await supabase
            .from('class_memberships')
            .insert({ class_id: classRow.id, profile_id: profileIdText, role: 'teacher' })
            .select('id');
          if (membershipError || !linked || linked.length === 0) {
            return { ok: false, message: `第 ${row.rowNumber} 行班级关系导入失败：${membershipError?.message ?? '当前账号无权管理该班级'}（已成功 ${imported} 行）`, imported, succeededCount: imported, preview };
          }
        }
      }
    }
    imported += 1;
  }
  revalidatePath('/admin');
  revalidatePath('/admin/users');
  revalidatePath('/admin/classes');
  return { ok: true, message: `已导入 ${imported} 个账号。`, imported, succeededCount: imported, preview };
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

