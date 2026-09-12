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
import { createDatabaseSessionSignature } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, requireRole, type DataResult } from './common';

export type OrgSchoolSummary = {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  createdAt: string;
  classCount: number;
  teacherCount: number;
  studentCount: number;
};

export type OrgSchoolUser = {
  id: string;
  loginId: string | null;
  displayName: string;
  role: 'admin' | 'teacher' | 'student';
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  createdAt: string;
};

export type OrgSchoolClass = {
  id: string;
  name: string;
  grade: string | null;
  status: 'active' | 'archived';
  studentCount: number;
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
    .select('id, name, status, created_at')
    .eq('org_id', ctx.data.organizationId)
    .order('created_at', { ascending: true });
  if (error) return fail('error', `学校列表加载失败：${error.message}`);

  const { data: classes, error: classError } = await supabase
    .from('classes')
    .select('id, school_id')
    .in('school_id', (schools ?? []).map((school) => school.id));
  if (classError) return fail('error', `班级统计失败：${classError.message}`);

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('school_id, role, status')
    .in('school_id', (schools ?? []).map((school) => school.id));
  if (profileError) return fail('error', `账号统计失败：${profileError.message}`);

  const summaries = (schools ?? []).map((school) => ({
    id: school.id,
    name: school.name,
    status: school.status as OrgSchoolSummary['status'],
    createdAt: school.created_at,
    classCount: (classes ?? []).filter((row) => row.school_id === school.id).length,
    teacherCount: (profiles ?? []).filter((row) => row.school_id === school.id && row.role === 'teacher' && row.status === 'active').length,
    studentCount: (profiles ?? []).filter((row) => row.school_id === school.id && row.role === 'student' && row.status === 'active').length,
  }));
  return ok(summaries);
}

export async function createSchool(formData: FormData): Promise<AdminActionLike> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, message: '学校名称不能为空。' };
  if (name.length > 60) return { ok: false, message: '学校名称过长。' };

  const supabase = await createClient();
  const { error } = await supabase.from('schools').insert({ org_id: ctx.data.organizationId, name });
  if (error) return { ok: false, message: `学校创建失败：${error.message}` };
  revalidatePath('/org');
  return { ok: true, message: `已创建学校「${name}」。` };
}

export async function setSchoolStatus(formData: FormData): Promise<AdminActionLike> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const schoolId = String(formData.get('schoolId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!schoolId || (status !== 'active' && status !== 'disabled')) return { ok: false, message: '参数无效。' };
  const owned = await assertSchoolInOrg(schoolId, ctx.data.organizationId);
  if (!owned.ok) return { ok: false, message: owned.message };

  const supabase = await createClient();
  const { error } = await supabase.from('schools').update({ status }).eq('id', schoolId);
  if (error) return { ok: false, message: `学校状态更新失败：${error.message}` };
  revalidatePath('/org');
  revalidatePath(`/org/schools/${schoolId}`);
  return { ok: true, message: status === 'active' ? '学校已启用。' : '学校已停用。' };
}

export async function renameSchool(formData: FormData): Promise<AdminActionLike> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const schoolId = String(formData.get('schoolId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!schoolId || !name || name.length > 60) return { ok: false, message: '参数无效。' };
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
  school: { id: string; name: string; status: 'active' | 'disabled'; createdAt: string };
  users: OrgSchoolUser[];
  classes: OrgSchoolClass[];
}>> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return ctx;
  const owned = await assertSchoolInOrg(schoolId, ctx.data.organizationId);
  if (!owned.ok) return owned;
  const supabase = await createClient();

  const [{ data: schoolRow, error: schoolError }, { data: users, error: usersError }, { data: classes, error: classesError }] = await Promise.all([
    supabase.from('schools').select('id, name, status, created_at').eq('id', schoolId).maybeSingle(),
    supabase.from('profiles').select('id, login_id, display_name, role, status, must_change_password, created_at')
      .eq('school_id', schoolId).in('role', ['admin', 'teacher', 'student']).order('created_at', { ascending: true }),
    supabase.from('classes').select('id, name, grade, status').eq('school_id', schoolId).order('created_at', { ascending: true }),
  ]);
  if (schoolError) return fail('error', `学校加载失败：${schoolError.message}`);
  if (usersError) return fail('error', `用户列表加载失败：${usersError.message}`);
  if (classesError) return fail('error', `班级列表加载失败：${classesError.message}`);
  if (!schoolRow) return fail('error', '学校不存在。');

  return ok({
    school: { id: schoolRow.id, name: schoolRow.name, status: schoolRow.status as 'active' | 'disabled', createdAt: schoolRow.created_at },
    users: (users ?? []).map((row) => ({
      id: row.id,
      loginId: row.login_id,
      displayName: row.display_name,
      role: row.role as OrgSchoolUser['role'],
      status: row.status as OrgSchoolUser['status'],
      mustChangePassword: row.must_change_password,
      createdAt: row.created_at,
    })),
    classes: (classes ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      grade: row.grade,
      status: row.status as OrgSchoolClass['status'],
      // v1 口径：班级人数在详情页按成员表统计（一个班一次查询成本可接受）
      studentCount: 0,
    })),
  });
}

// AdminActionLike：与 admin.ts 的表单 action 返回形状一致，复用其客户端组件。
export type AdminActionLike = { ok: boolean; message: string };

export async function createSchoolAdmin(formData: FormData): Promise<AdminActionLike> {
  const ctx = await requireOrgContext();
  if (!ctx.ok) return { ok: false, message: ctx.message };
  const schoolId = String(formData.get('schoolId') ?? '');
  const loginId = String(formData.get('loginId') ?? '').trim();
  const displayName = String(formData.get('displayName') ?? '').trim();
  if (!schoolId || !/^\d{8}$/.test(loginId) || !displayName) {
    return { ok: false, message: '请填写 8 位数字工号与姓名。' };
  }
  const owned = await assertSchoolInOrg(schoolId, ctx.data.organizationId);
  if (!owned.ok) return { ok: false, message: owned.message };

  const supabase = await createClient();
  const { data: profileId, error: provisionError } = await supabase.rpc('provision_school_account', {
    p_login_id: loginId,
    p_display_name: displayName,
    p_role: 'admin',
    p_school_id: schoolId,
    p_server_signature: createDatabaseSessionSignature('provision_school_account'),
  });
  if (provisionError) return { ok: false, message: `校管理员创建失败：${provisionError.message}` };

  revalidatePath(`/org/schools/${schoolId}`);
  return { ok: true, message: `校管理员「${displayName}」已创建（工号 ${loginId}），初始密码为工号本身，首次登录将强制改密。` };
}
