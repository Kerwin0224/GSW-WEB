'use server';

/**
 * role-grants.ts —— 作用域级能力位。
 *
 * 为什么要它：profiles.role 是**主身份**（管理员 / 教师 / 学生 / 公司管理员），
 * 但「能看多大范围」不该由主身份决定。此前班主任与任课教师在数据层完全同质——
 * 「班主任」这个词在产品里存在，在代码里不存在。
 *
 * 能力位挂在**作用域**上而不是角色上：同一个人可以在 A 班是班主任（看全组学情），
 * 在 B 班只是任课教师。这正是「作用域」三个字的意思。
 *
 * 已知能力位（其余 capability 值不进界面，留给后续版本）：
 *   review_team   —— 看同组其他教师的核实完成情况（组内学情）
 *   manage_space  —— 管理该空间（增删协作者、成员）
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { fail, ok, requireRole, type ActionState, type DataResult } from './common';

export const ROLE_GRANT_CAPABILITIES = ['review_team', 'manage_space'] as const;
export type RoleGrantCapability = (typeof ROLE_GRANT_CAPABILITIES)[number];

/** 面向用户的说法。班主任这个概念此前只存在于口头约定里，现在它有了名字。 */
export const CAPABILITY_LABEL: Record<RoleGrantCapability, string> = {
  review_team: '组内学情',
  manage_space: '空间管理',
};

const CAPABILITY_DESCRIPTION: Record<RoleGrantCapability, string> = {
  review_team: '可以查看同组其他教师的核实完成情况，不影响他自己的带班范围。',
  manage_space: '可以管理这个空间的协作者与成员。',
};

function isCapability(value: string): value is RoleGrantCapability {
  return ROLE_GRANT_CAPABILITIES.includes(value as RoleGrantCapability);
}

export type RoleGrant = {
  id: string;
  profileId: string;
  displayName: string;
  loginId: string | null;
  role: string;
  capability: string;
  scopeType: 'class' | 'space' | 'school' | 'organization';
  scopeId: string | null;
  /** 作用域的可读名称。能力位挂在一个看不见名字的 uuid 上，管理员无从判断自己授了什么。 */
  scopeLabel: string;
};

export type RoleGrantTarget = {
  scopeType: RoleGrant['scopeType'];
  scopeId: string;
  scopeLabel: string;
  grants: Array<{ id: string; profileId: string; displayName: string; loginId: string | null; capability: string }>;
};

/**
 * 某个教学单元上的全部能力位，按人分组。
 * class 与 space 是界面上唯一两个可授的作用域；school / organization 级
 * 留给平台运营，不在这里暴露。
 */
export async function listRoleGrantsForScope(scopeType: 'class' | 'space', scopeId: string): Promise<DataResult<RoleGrantTarget[]>> {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  if (!scopeId) return fail('error', '缺少教学单元。');

  const supabase = await createClient();
  const { data: grants, error } = await supabase
    .from('role_grants')
    .select('id,profile_id,capability,scope_type,scope_id,profiles(id,display_name,login_id,role)')
    .eq('scope_type', scopeType)
    .eq('scope_id', scopeId);
  if (error) return fail('error', `能力位加载失败：${error.message}`);

  const { data: target } = scopeType === 'class'
    ? await supabase.from('classes').select('name').eq('id', scopeId).maybeSingle()
    : await supabase.from('spaces').select('name').eq('id', scopeId).maybeSingle();
  const scopeLabel = target?.name?.trim() || '（名称不可见）';

  return ok([{
    scopeType,
    scopeId,
    scopeLabel,
    grants: ((grants ?? []) as Array<{ id: string; profile_id: string; capability: string; profiles: { id: string; display_name: string; login_id: string | null; role: string } | Array<{ id: string; display_name: string; login_id: string | null; role: string }> | null }>).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        profileId: row.profile_id,
        displayName: profile?.display_name ?? '未命名账号',
        loginId: profile?.login_id ?? null,
        capability: row.capability,
      };
    }),
  }]);
}

/** 全校能力位一览，管理员在用户页上看得见「谁拿到了什么」。 */
export async function listAllRoleGrants(): Promise<DataResult<RoleGrant[]>> {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('role_grants')
    .select('id,profile_id,capability,scope_type,scope_id,profiles(id,display_name,login_id,role)')
    .order('created_at', { ascending: false });
  if (error) return fail('error', `能力位加载失败：${error.message}`);

  const rows = (data ?? []) as Array<{ id: string; profile_id: string; capability: string; scope_type: RoleGrant['scopeType']; scope_id: string | null; profiles: { id: string; display_name: string; login_id: string | null; role: string } | Array<{ id: string; display_name: string; login_id: string | null; role: string }> | null }>;
  // 作用域名称要一张张回查。只在有行时才查：绝大多数学校一个能力位都没有。
  const labels = new Map<string, string>();
  const classIds = rows.filter((row) => row.scope_type === 'class' && row.scope_id).map((row) => row.scope_id as string);
  const spaceIds = rows.filter((row) => row.scope_type === 'space' && row.scope_id).map((row) => row.scope_id as string);
  if (classIds.length > 0) {
    const { data: classes } = await supabase.from('classes').select('id,name').in('id', classIds);
    for (const row of (classes ?? []) as Array<{ id: string; name: string | null }>) labels.set(`class:${row.id}`, row.name?.trim() || '未命名班级');
  }
  if (spaceIds.length > 0) {
    const { data: spaces } = await supabase.from('spaces').select('id,name').in('id', spaceIds);
    for (const row of (spaces ?? []) as Array<{ id: string; name: string | null }>) labels.set(`space:${row.id}`, row.name?.trim() || '未命名空间');
  }
  return ok(rows.map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    // 目标已删除的作用域显示成「（已删除的教学单元）」，而不是一个裸 uuid：
    // 管理员看到一串 uuid 没法判断自己在给谁授权。
    const label = row.scope_id
      ? labels.get(`${row.scope_type}:${row.scope_id}`) ?? '（已删除的教学单元）'
      : SCOPE_WIDE_LABEL[row.scope_type as 'school' | 'organization'] ?? '（未知作用域）';
    return {
      id: row.id,
      profileId: row.profile_id,
      displayName: profile?.display_name ?? '未命名账号',
      loginId: profile?.login_id ?? null,
      role: profile?.role ?? 'unknown',
      capability: row.capability,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      scopeLabel: label,
    };
  }));
}

/** school / organization 级能力位不带 scope_id，只有这两种作用域是「全体」。 */
const SCOPE_WIDE_LABEL: Record<'school' | 'organization', string> = {
  school: '全校',
  organization: '全公司',
};

export async function grantRoleCapabilityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return { ok: false, message: role.message };

  const profileId = String(formData.get('profile_id') ?? '').trim();
  const capability = String(formData.get('capability') ?? '').trim();
  const scopeType = String(formData.get('scope_type') ?? '').trim();
  const scopeId = String(formData.get('scope_id') ?? '').trim();
  if (!profileId || !isCapability(capability) || !['class', 'space'].includes(scopeType) || !scopeId) {
    return { ok: false, message: '请选择要授予的人、能力与教学单元。' };
  }
  if (profileId === role.data.id) {
    return { ok: false, message: '不需要给自己授权：管理员本来就管着全校。' };
  }

  const supabase = await createClient();
  // 目标必须本校在职教师。给学生或外校的人授权，界面上看不出问题，
  // 但那是一条永远不会被行使、也没人能撤销的脏能力位。
  const { data: target } = await supabase.from('profiles').select('role,status,school_id').eq('id', profileId).maybeSingle();
  if (!target) return { ok: false, message: '该账号不存在。' };
  if (target.role !== 'teacher') return { ok: false, message: '能力位只授予教师账号。' };
  if (target.status !== 'active') return { ok: false, message: '该账号已停用，请先启用再授权。' };
  if (target.school_id !== role.data.school_id) return { ok: false, message: '只能给本校教师授权。' };

  const { data: inserted, error } = await supabase
    .from('role_grants')
    .upsert({ profile_id: profileId, capability, scope_type: scopeType as 'class' | 'space', scope_id: scopeId, granted_by: role.data.id }, { onConflict: 'profile_id,capability,scope_type,scope_id', ignoreDuplicates: true })
    .select('id');
  if (error) return { ok: false, message: `授权失败：${error.message}` };

  revalidatePath('/admin/classes');
  revalidatePath('/admin/users');
  revalidatePath('/teacher/collaborators');
  return { ok: true, message: inserted && inserted.length > 0 ? `已授予「${CAPABILITY_LABEL[capability]}」。${CAPABILITY_DESCRIPTION[capability]}` : '这位教师已经有这项能力了。' };
}

export async function revokeRoleCapabilityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return { ok: false, message: role.message };

  const grantId = String(formData.get('grant_id') ?? '').trim();
  if (!grantId) return { ok: false, message: '请选择要撤销的能力位。' };

  const supabase = await createClient();
  // 0 行 = RLS 没放行（这项能力位不属于本校），不是"已撤销"。
  const { data: removed, error } = await supabase.from('role_grants').delete().eq('id', grantId).select('id');
  if (error) return { ok: false, message: `撤销失败：${error.message}` };
  if (!removed || removed.length === 0) return { ok: false, message: '撤销失败：该能力位不存在或不属于本校。' };

  revalidatePath('/admin/classes');
  revalidatePath('/admin/users');
  revalidatePath('/teacher/collaborators');
  return { ok: true, message: '已撤销该能力位。' };
}

/**
 * 教师侧读自己的能力位。
 *
 * 只取自己那些**指向具体教学单元**的授予：school / organization 级的能力位
 * 影响的是全量可见性，那属于平台运营的开关，不在这里参与教师端的组内视角。
 */
export async function listMyCapabilities(): Promise<DataResult<{ capability: RoleGrantCapability; scopeType: 'class' | 'space'; scopeId: string }[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('role_grants')
    .select('capability,scope_type,scope_id')
    .eq('profile_id', role.data.id)
    .in('scope_type', ['class', 'space']);
  if (error) return fail('error', `能力位加载失败：${error.message}`);

  const capabilities: Array<{ capability: RoleGrantCapability; scopeType: 'class' | 'space'; scopeId: string }> = [];
  for (const row of (data ?? []) as Array<{ capability: string; scope_type: string; scope_id: string | null }>) {
    if (!isCapability(row.capability) || !row.scope_id) continue;
    if (row.scope_type !== 'class' && row.scope_type !== 'space') continue;
    capabilities.push({ capability: row.capability, scopeType: row.scope_type, scopeId: row.scope_id });
  }
  return ok(capabilities);
}
