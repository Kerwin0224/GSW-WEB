'use server';

/**
 * org.ts
 *
 * 公司级大账号（org_admin）的管理面：公司管校。
 * 校内的人/班管理归各校 school_admin（admin 角色，见 admin.ts）；
 * 本文件只做学校这个层级的生命周期与成员账号供给。
 * 所有操作经 requireRole('org_admin') + RLS 双重约束。
 */

import { revalidatePath } from 'next/cache';
import { readAiUsageDaily } from '@/lib/ai-usage';
import { createClient } from '@/lib/supabase/server';
import type { SchoolKind } from '@/lib/supabase/database.types';
import { provisionSchoolAccount } from './account-provisioning';
import { fail, ok, requireRole, type ActionState, type DataResult } from './common';

/**
 * 六种机构形态的通用叫法。
 *
 * 「学校」只是其中一种形态的名字。教培机构、校区、工作室、教研联盟强行自称学校，
 * 下级管理员在名册和班级里看到的就是一堆自称学校的单位——分不清谁是本体、
 * 谁是本部，谁是加盟点。用词跟着形态走，是这套模型里最便宜的一步。
 */
export const ORG_UNIT_LABEL: Record<SchoolKind, string> = {
  school: '学校',
  campus: '校区',
  training_org: '教培机构',
  studio: '工作室',
  alliance: '教研联盟',
  other: '教学单位',
};

export const SCHOOL_KINDS = Object.keys(ORG_UNIT_LABEL) as SchoolKind[];

export function orgUnitLabel(kind: SchoolKind | null | undefined): string {
  return ORG_UNIT_LABEL[kind ?? 'other'] ?? ORG_UNIT_LABEL.other;
}

export type OrgSchoolSummary = {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  createdAt: string;
  /**
 * 机构形态。学校只是其中一种：教培机构、校区、工作室、教研联盟各有各的
 * 账号口径与班级形态，强行都叫「学校」会让下级管理员看不懂自己管的是什么。
   */
  kind: SchoolKind;
  /** 可查询的学段。空数组 = 未划分学段（不是"没有学段"这件事本身有问题）。 */
  educationStages: string[];
  classCount: number;
  teacherCount: number;
  studentCount: number;
  /** 近 30 天的调用次数；公司端分摊成本与限量就靠这一列。 */
  usageCalls30d: number;
  usageTokens30d: number;
};

export type OrgSchoolUser = {
  id: string;
  loginId: string | null;
  displayName: string;
  role: 'admin' | 'teacher' | 'student';
  subject: string | null;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  createdAt: string;
};

export type OrgSchoolClass = {
  id: string;
  name: string;
  grade: string | null;
  /** 可查询的学段；grade 已降级为纯展示标签，筛选与分组一律用 stage。 */
  stage: string | null;
  status: 'active' | 'archived';
};

async function requireOrgContext() {
  const role = await requireRole('org_admin');
  if (!role.ok) return role;
  if (!role.data.organization_id) return fail('forbidden', '公司账号未归属组织，无法管理学校。');
  return ok({ profile: role.data, organizationId: role.data.organization_id });
}

async function assertSchoolInOrg(schoolId: string, organizationId: string) {
  const supabase = await createClient();
  const { data: school, error } = await supabase
    .from('schools')
    .select('id, org_id')
    .eq('id', schoolId)
    .maybeSingle();
  if (error) return fail('error', `学校查询失败：${error.message}`);
  if (!school || school.org_id !== organizationId) return fail('forbidden', '学校不存在或不属于当前公司。');
  return ok(school);
}

export async function listOrgSchools(): Promise<DataResult<OrgSchoolSummary[]>> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return ctx;
  const supabase = await createClient();

  const { data: schools, error } = await supabase
    .from('schools')
    .select('id, name, status, created_at, kind, education_stages')
    .eq('org_id', ctx.data.organizationId)
    .order('created_at', { ascending: true });
  if (error) return fail('error', `下级单位列表加载失败：${error.message}`);

  const schoolIds = (schools ?? []).map((school) => school.id);
  if (schoolIds.length === 0) return ok([]);

  const [classesResult, profilesResult] = await Promise.all([
    supabase.from('classes').select('id, school_id').in('school_id', schoolIds),
    supabase.from('profiles').select('school_id, role, status').in('school_id', schoolIds),
  ]);
  if (classesResult.error) return fail('error', `教学单元统计失败：${classesResult.error.message}`);
  if (profilesResult.error) return fail('error', `账号统计失败：${profilesResult.error.message}`);

  // 用量是「先有计量再谈限量」的第一步。读不到用量不该让整个下级列表打不开——
  // 账号规模是管理员的日常操作用量，成本是月底才看的一列。
  const usageBySchool = new Map<string, { calls: number; tokens: number }>();
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (const row of await readAiUsageDaily(since, new Date())) {
      if (!row.schoolId) continue;
      const current = usageBySchool.get(row.schoolId) ?? { calls: 0, tokens: 0 };
      current.calls += row.calls;
      current.tokens += row.totalTokens;
      usageBySchool.set(row.schoolId, current);
    }
  } catch {
    // 计量读失败就留零值，界面上标出「用量暂不可读」，不伪装成「没用量」。
  }

  const classes = (classesResult.data ?? []) as Array<{ id: string; school_id: string | null }>;
  const profiles = (profilesResult.data ?? []) as Array<{ school_id: string | null; role: string; status: string }>;
  return ok((schools ?? []).map((school) => {
    const usage = usageBySchool.get(school.id) ?? { calls: 0, tokens: 0 };
    return {
      id: school.id,
      name: school.name,
      status: school.status as OrgSchoolSummary['status'],
      createdAt: school.created_at,
      kind: (school.kind ?? 'other') as SchoolKind,
      educationStages: school.education_stages ?? [],
      classCount: classes.filter((row) => row.school_id === school.id).length,
      teacherCount: profiles.filter((row) => row.school_id === school.id && row.role === 'teacher' && row.status === 'active').length,
      studentCount: profiles.filter((row) => row.school_id === school.id && row.role === 'student' && row.status === 'active').length,
      usageCalls30d: usage.calls,
      usageTokens30d: usage.tokens,
    };
  }));
}

export async function createSchool(formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const name = String(formData.get('name') ?? '').trim();
  const kindRaw = String(formData.get('kind') ?? 'school').trim();
  const loginIdPattern = String(formData.get('loginIdPattern') ?? '').trim();
  const stages = String(formData.get('educationStages') ?? '')
    .split(/[,，、\n]/)
    .map((stage) => stage.trim())
    .filter((stage) => stage.length > 0)
    .slice(0, 12);
  if (!name) return { ok: false, message: '名称不能为空。' };
  if (name.length > 60) return { ok: false, message: '名称请控制在 60 字以内。' };
  if (!SCHOOL_KINDS.includes(kindRaw as SchoolKind)) {
    return { ok: false, message: '请选择有效的机构形态。' };
  }
  if (stages.some((stage) => stage.length > 20)) {
    return { ok: false, message: '学段名称请控制在 20 字以内。' };
  }
  // 留空即用平台默认（8 位数字），与迁移的回填值一致。
  const pattern = loginIdPattern || undefined;
  if (pattern) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern);
    } catch {
      return { ok: false, message: '账号格式不是合法的正则表达式，请检查后重试。', errors: { loginIdPattern: '正则表达式写错了。' } };
    }
    if (pattern.length > 120) {
      return { ok: false, message: '账号格式表达式过长。', errors: { loginIdPattern: '表达式请控制在 120 字符以内。' } };
    }
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from('schools')
    .insert({ org_id: ctx.data.organizationId, name, kind: kindRaw as SchoolKind, education_stages: stages, ...(pattern ? { login_id_pattern: pattern } : {}) })
    .select('id');
  if (error) return { ok: false, message: `创建失败：${error.message}` };
  if (!inserted || inserted.length === 0) return { ok: false, message: '创建失败：数据库没有返回记录，请重试。' };

  revalidatePath('/org');
  return { ok: true, message: `已创建${orgUnitLabel(kindRaw as SchoolKind)}「${name}」。` };
}

/**
 * 改机构形态与账号格式。
 *
 * 账号格式这一项影响**已经建好的账号的登录**：改成新格式之后，
 * 旧格式的账号仍然能登录（校验只发生在建号时），但新账号只能按新格式来。
 * 所以界面上必须写明这一点，否则管理员会以为改完格式老账号就登不进来了。
 */
export async function updateSchoolProfile(formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const schoolId = String(formData.get('schoolId') ?? '').trim();
  const kindRaw = String(formData.get('kind') ?? '').trim();
  const loginIdPattern = String(formData.get('loginIdPattern') ?? '').trim();
  const stages = String(formData.get('educationStages') ?? '')
    .split(/[,，、\n]/)
    .map((stage) => stage.trim())
    .filter((stage) => stage.length > 0)
    .slice(0, 12);
  if (!schoolId || !SCHOOL_KINDS.includes(kindRaw as SchoolKind)) {
    return { ok: false, message: '请选择有效的机构形态。' };
  }
  if (stages.some((stage) => stage.length > 20)) {
    return { ok: false, message: '学段名称请控制在 20 字以内。' };
  }
  if (loginIdPattern) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(loginIdPattern);
    } catch {
      return { ok: false, message: '账号格式不是合法的正则表达式，请检查后重试。', errors: { loginIdPattern: '正则表达式写错了。' } };
    }
  }
  const owned = await assertSchoolInOrg(schoolId, ctx.data.organizationId);
  if (!owned.ok) return { ok: false, message: owned.message };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from('schools')
    .update({ kind: kindRaw as SchoolKind, education_stages: stages, ...(loginIdPattern ? { login_id_pattern: loginIdPattern } : {}) })
    .eq('id', schoolId)
    .select('id');
  if (error) return { ok: false, message: `设置失败：${error.message}` };
  if (!updated || updated.length === 0) return { ok: false, message: '设置未生效：该单位不属于当前公司。' };

  revalidatePath('/org');
  revalidatePath(`/org/schools/${schoolId}`);
  return { ok: true, message: `已更新为${orgUnitLabel(kindRaw as SchoolKind)}。账号格式只影响之后新建的账号，已有账号不受影响。` };
}

export async function setSchoolStatus(formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const schoolId = String(formData.get('schoolId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!schoolId || (status !== 'active' && status !== 'disabled')) return { ok: false, message: '未指定学校或目标状态，请刷新学校列表后重试。' };
  const owned = await assertSchoolInOrg(schoolId, ctx.data.organizationId);
  if (!owned.ok) return { ok: false, message: owned.message };

  const supabase = await createClient();
  const { error } = await supabase.from('schools').update({ status }).eq('id', schoolId);
  if (error) return { ok: false, message: `学校状态更新失败：${error.message}` };
  revalidatePath('/org');
  revalidatePath(`/org/schools/${schoolId}`);
  return { ok: true, message: status === 'active' ? '学校已启用。' : '学校已停用。' };
}

export async function renameSchool(formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const schoolId = String(formData.get('schoolId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!schoolId || !name || name.length > 60) return { ok: false, message: '请填写学校名称（不超过 60 字），或刷新页面后重试。' };
  const owned = await assertSchoolInOrg(schoolId, ctx.data.organizationId);
  if (!owned.ok) return { ok: false, message: owned.message };

  const supabase = await createClient();
  const { error } = await supabase.from('schools').update({ name }).eq('id', schoolId);
  if (error) return { ok: false, message: `学校更名失败：${error.message}` };
  revalidatePath('/org');
  revalidatePath(`/org/schools/${schoolId}`);
  return { ok: true, message: '学校已更名。' };
}

export async function getOrgSchoolDetail(schoolId: string): Promise<DataResult<{
  school: { id: string; name: string; status: 'active' | 'disabled'; createdAt: string; kind: SchoolKind; educationStages: string[]; loginIdPattern: string };
  users: OrgSchoolUser[];
  classes: OrgSchoolClass[];
}>> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return ctx;
  const owned = await assertSchoolInOrg(schoolId, ctx.data.organizationId);
  if (!owned.ok) return owned;
  const supabase = await createClient();

  const [{ data: schoolRow, error: schoolError }, { data: users, error: usersError }, { data: classes, error: classesError }] = await Promise.all([
    supabase.from('schools').select('id, name, status, created_at, kind, education_stages, login_id_pattern').eq('id', schoolId).maybeSingle(),
    supabase.from('profiles').select('id, login_id, display_name, role, subject, status, must_change_password, created_at')
      .eq('school_id', schoolId).in('role', ['admin', 'teacher', 'student']).order('created_at', { ascending: true }),
    supabase.from('classes').select('id, name, grade, stage, status').eq('school_id', schoolId).order('created_at', { ascending: true }),
  ]);
  if (schoolError) return fail('error', `下级单位加载失败：${schoolError.message}`);
  if (usersError) return fail('error', `用户列表加载失败：${usersError.message}`);
  if (classesError) return fail('error', `教学单元列表加载失败：${classesError.message}`);
  if (!schoolRow) return fail('error', '下级单位不存在。');

  return ok({
    school: {
      id: schoolRow.id,
      name: schoolRow.name,
      status: schoolRow.status as 'active' | 'disabled',
      createdAt: schoolRow.created_at,
      kind: (schoolRow.kind ?? 'other') as SchoolKind,
      educationStages: schoolRow.education_stages ?? [],
      loginIdPattern: schoolRow.login_id_pattern,
    },
    users: (users ?? []).map((row) => ({
      id: row.id,
      loginId: row.login_id,
      displayName: row.display_name,
      role: row.role as OrgSchoolUser['role'],
      subject: row.subject,
      status: row.status as OrgSchoolUser['status'],
      mustChangePassword: row.must_change_password,
      createdAt: row.created_at,
    })),
    classes: (classes ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      grade: row.grade,
      stage: row.stage,
      status: row.status as OrgSchoolClass['status'],
    })),
  });
}

/**
 * 建一个下级单位管理员。
 *
 * 返回值里多带一个 initialPassword：口令是**随机一次性**的，只在这里出现一次，
 * 管理员必须当面/单条转交给本人。账号本身已经可能是邮箱或工牌号，
 * 拿它当口令等于把全校账号的钥匙印在名册上。
 */
export async function createSchoolAdmin(formData: FormData): Promise<ActionState & { initialPassword?: string; loginId?: string }> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const schoolId = String(formData.get('schoolId') ?? '');
  const loginId = String(formData.get('loginId') ?? '').trim();
  const displayName = String(formData.get('displayName') ?? '').trim();
  const initialPassword = String(formData.get('initialPassword') ?? '').trim();
  if (!schoolId || !loginId || !displayName) {
    return { ok: false, message: '请填写登录账号与姓名。' };
  }
  const owned = await assertSchoolInOrg(schoolId, ctx.data.organizationId);
  if (!owned.ok) return { ok: false, message: owned.message };

  // 同校同账号已存在就停在这里。原因：provision_school_account 的「重导入」分支曾经
  // 无条件 set role = p_role，于是把一个已存在的教师/学生的账号填进这个表单，
  // 那个账号就在零提示的情况下变成了管理员——一次静默提权。
  // 角色变更必须显式，走用户管理页的改角色入口。
  const supabase = await createClient();
  const { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('display_name,role,status')
    .eq('school_id', schoolId)
    .eq('login_id', loginId)
    .maybeSingle();
  if (lookupError) return { ok: false, message: `账号校验失败：${lookupError.message}` };
  if (existing) {
    const hint = existing.role === 'admin'
      ? '该账号已经是本单位的 administrator。'
      : `该账号已属于「${existing.display_name}」（${existing.role}${existing.status === 'disabled' ? '，已停用' : ''}）。创建管理员不会改变已有账号的角色；如需变更，请到用户管理页显式修改。`;
    return { ok: false, message: hint };
  }

  // 账号格式按**目标单位**的口径校验，不写死 8 位数字。
  const provisioned = await provisionSchoolAccount({ schoolId, loginId, displayName, role: 'admin', initialPassword });
  if (!provisioned.ok) return { ok: false, message: `管理员创建失败：${provisioned.message}` };

  revalidatePath(`/org/schools/${schoolId}`);
  return {
    ok: true,
    message: `管理员「${displayName}」已创建（账号 ${provisioned.data.loginId}）。请把下面的一次性初始口令单独转交给本人，首次登录会强制改密。`,
    initialPassword: provisioned.data.initialPassword,
    loginId: provisioned.data.loginId,
  };
}
