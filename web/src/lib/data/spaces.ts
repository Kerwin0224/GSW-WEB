'use server';

/**
 * spaces.ts —— 空间的读写面。
 *
 * 空间属于**老师**：老师建空间、写主题、通过班批量拉学生，也可以从自己任教的班级学生中单独加入；学生切换自己被拉进去的空间。
 *
 * 班级成员仍由 space_classes 派生（一行 = 该班全部学生都在内），直接成员由 space_members
 * 单独记录。两类成员都经过 RLS 和空间所属校验；移出只影响空间可见性，不删除学习数据。
 *
 * 写入口包括：create_space RPC（建空间 + 写主题/科目/颜色 + 首次拉班）、space_classes
 * 班级增删、space_members 学生增删。全部是 security invoker，RLS 是唯一租户闸门。
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { SpaceColorKey, SpaceKind } from '@/lib/supabase/database.types';
import { SPACE_COLOR_KEYS } from '@/lib/space-colors';
import { fail, ok, requireRole, type ActionState, type DataResult } from './common';


export type SpaceClassSummary = { classId: string; className: string; studentCount: number };
export type SpaceStudentSummary = { id: string; displayName: string; loginId: string | null; className?: string | null };
export type SpaceStudentOption = { id: string; displayName: string; loginId: string | null; className: string };

export type TeacherSpace = {
  id: string;
  name: string;
  theme: string;
  subject: string | null;
  colorKey: SpaceColorKey;
  kind: SpaceKind;
  classes: SpaceClassSummary[];
  directStudents: SpaceStudentSummary[];
  studentCount: number;
};

/** 学生视角：空间名称、科目和颜色都足够渲染切换器。 */
export type StudentSpace = { id: string; name: string; subject: string | null; colorKey: SpaceColorKey; kind: SpaceKind };

function revalidateSpaceSurfaces() {
  revalidatePath('/teacher');
  revalidatePath('/student');
}

/** 我建的活跃空间，含班级派生成员和直接加入的学生。 */
export async function listTeacherSpaces(): Promise<DataResult<TeacherSpace[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();

  const { data: spaces, error } = await supabase
    .from('spaces')
    .select('id,name,theme,subject,color_key,space_kind,space_classes(class_id,classes(name)),space_members(student_id)')
    .eq('owner_id', role.data.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) return fail('error', `空间加载失败：${error.message}`);

  type Row = {
    id: string;
    name: string;
    theme: string;
    subject: string | null;
    color_key: SpaceColorKey;
    space_kind: SpaceKind;
    space_classes: Array<{ class_id: string; classes: { name: string | null } | Array<{ name: string | null }> | null }> | null;
    space_members: Array<{ student_id: string }> | null;
  };
  const rows = (spaces ?? []) as unknown as Row[];
  const classIds = Array.from(new Set(rows.flatMap((row) => (row.space_classes ?? []).map((edge) => edge.class_id))));
  const directStudentIds = Array.from(new Set(rows.flatMap((row) => (row.space_members ?? []).map((member) => member.student_id))));

  const studentCountByClass = new Map<string, number>();
  const classStudentIdsByClass = new Map<string, string[]>();
  if (classIds.length > 0) {
    const { data: memberships, error: membershipError } = await supabase
      .from('class_memberships')
      .select('class_id,profile_id')
      .in('class_id', classIds)
      .eq('role', 'student');
    if (membershipError) return fail('error', `班级学生数加载失败：${membershipError.message}`);
    for (const membership of (memberships ?? []) as Array<{ class_id: string; profile_id: string }>) {
      studentCountByClass.set(membership.class_id, (studentCountByClass.get(membership.class_id) ?? 0) + 1);
      const ids = classStudentIdsByClass.get(membership.class_id) ?? [];
      ids.push(membership.profile_id);
      classStudentIdsByClass.set(membership.class_id, ids);
    }
  }

  const profileById = new Map<string, { display_name: string; login_id: string | null }>();
  if (directStudentIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id,display_name,login_id')
      .in('id', directStudentIds);
    if (profileError) return fail('error', `空间学生资料加载失败：${profileError.message}`);
    for (const profile of (profiles ?? []) as Array<{ id: string; display_name: string; login_id: string | null }>) {
      profileById.set(profile.id, { display_name: profile.display_name, login_id: profile.login_id });
    }
  }

  return ok(rows.map((row) => {
    const classes = (row.space_classes ?? []).map((edge) => {
      const klass = Array.isArray(edge.classes) ? edge.classes[0] : edge.classes;
      return {
        classId: edge.class_id,
        className: klass?.name?.trim() || '未命名班级',
        studentCount: studentCountByClass.get(edge.class_id) ?? 0,
      };
    });
    const derivedStudentIds = new Set((row.space_classes ?? []).flatMap((edge) => classStudentIdsByClass.get(edge.class_id) ?? []));
    const directStudents = (row.space_members ?? []).flatMap((member) => {
      const profile = profileById.get(member.student_id);
      return profile ? [{ id: member.student_id, displayName: profile.display_name, loginId: profile.login_id }] : [];
    });
    const extraDirectStudents = directStudents.filter((student) => !derivedStudentIds.has(student.id));
    return {
      id: row.id,
      name: row.name,
      theme: row.theme,
      subject: row.subject,
      colorKey: row.color_key,
      kind: row.space_kind,
      classes,
      directStudents,
      studentCount: classes.reduce((sum, klass) => sum + klass.studentCount, 0) + extraDirectStudents.length,
    };
  }));
}

/** 教师任教班级里的学生，作为空间直接成员的可选名册。 */
export async function listTeacherStudentOptions(): Promise<DataResult<SpaceStudentOption[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data: teacherClasses, error: classError } = await supabase
    .from('class_memberships')
    .select('class_id,classes(name)')
    .eq('profile_id', role.data.id)
    .eq('role', 'teacher');
  if (classError) return fail('error', `任教班级加载失败：${classError.message}`);
  const classRows = (teacherClasses ?? []) as Array<{ class_id: string; classes: { name: string | null } | Array<{ name: string | null }> | null }>;
  if (classRows.length === 0) return ok([]);

  const classNameById = new Map(classRows.map((row) => {
    const klass = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    return [row.class_id, klass?.name?.trim() || '未命名班级'] as const;
  }));
  const { data: memberships, error: studentError } = await supabase
    .from('class_memberships')
    .select('class_id,profile_id,profiles!inner(id,display_name,login_id,status)')
    .in('class_id', classRows.map((row) => row.class_id))
    .eq('role', 'student');
  if (studentError) return fail('error', `学生名册加载失败：${studentError.message}`);

  const options = new Map<string, SpaceStudentOption>();
  for (const row of (memberships ?? []) as Array<{
    class_id: string;
    profile_id: string;
    profiles: { id: string; display_name: string; login_id: string | null; status: string } | Array<{ id: string; display_name: string; login_id: string | null; status: string }> | null;
  }>) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!profile || profile.status !== 'active') continue;
    const existing = options.get(profile.id);
    const className = classNameById.get(row.class_id) ?? '未命名班级';
    if (existing) existing.className = Array.from(new Set([...existing.className.split('、'), className])).join('、');
    else options.set(profile.id, { id: profile.id, displayName: profile.display_name, loginId: profile.login_id, className });
  }
  return ok(Array.from(options.values()));
}

/** 学生视角：我被拉进去的空间。 */
export async function listStudentSpaces(): Promise<DataResult<StudentSpace[]>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('spaces')
    .select('id,name,subject,color_key,space_kind')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) return fail('error', `空间加载失败：${error.message}`);
  return ok((data ?? []).map((space) => ({ id: space.id, name: space.name, subject: space.subject, colorKey: space.color_key, kind: space.space_kind })));
}

/**
 * 建空间或改已有空间。科目和颜色属于空间，归类规则仍由 theme 单独表达。
 */
export async function saveSpaceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const spaceId = String(formData.get('space_id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const theme = String(formData.get('theme') ?? '').trim();
  const subject = String(formData.get('subject') ?? '').trim();
  const colorKey = String(formData.get('color_key') ?? 'pine').trim();
  const spaceKind = String(formData.get('space_kind') ?? 'term').trim() as SpaceKind;
  const classId = String(formData.get('class_id') ?? '').trim();
  if (!name) return { ok: false, message: '请填写空间名称。', errors: { name: '空间名称不能为空。' } };
  if (!subject) return { ok: false, message: '请填写空间科目。', errors: { subject: '空间科目不能为空。' } };
  if (subject.length > 40) return { ok: false, message: '科目名称不能超过 40 个字符。', errors: { subject: '科目名称过长。' } };
  if (!SPACE_COLOR_KEYS.includes(colorKey as SpaceColorKey)) return { ok: false, message: '请选择有效的空间颜色。' };
  if (spaceKind !== 'term' && spaceKind !== 'topic') return { ok: false, message: '请选择有效的空间类型。' };

  const supabase = await createClient();
  if (spaceId) {
    const { error } = await supabase.from('spaces').update({ name, theme, subject: subject || null, color_key: colorKey as SpaceColorKey, space_kind: spaceKind }).eq('id', spaceId);
    if (error) return { ok: false, message: `空间保存失败：${error.message}` };
    revalidateSpaceSurfaces();
    return { ok: true, message: '空间已保存。' };
  }

  const { data: existing, error: existingError } = await supabase
    .from('spaces')
    .select('id')
    .eq('owner_id', role.data.id)
    .eq('name', name)
    .eq('status', 'active')
    .maybeSingle();
  if (existingError) return { ok: false, message: `空间查重失败：${existingError.message}` };
  if (existing) return { ok: false, message: `已存在同名空间「${name}」。换个名字，或直接编辑它。`, errors: { name: '空间名称重复。' } };

  const { error } = await supabase.rpc('create_space_v3', {
    p_name: name,
    p_theme: theme,
    p_class_id: classId || null,
    p_subject: subject || null,
    p_color_key: colorKey as SpaceColorKey,
    p_space_kind: spaceKind,
  });
  if (error) return { ok: false, message: `空间保存失败：${error.message}` };

  revalidateSpaceSurfaces();
  return { ok: true, message: classId ? '空间已建好，该班学生已进入这个空间。' : '空间已建好。' };
}

/** 直接加入或移出一个学生；班级派生成员仍由 space_classes 管理。 */
export async function setSpaceStudentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const spaceId = String(formData.get('space_id') ?? '').trim();
  const studentId = String(formData.get('student_id') ?? '').trim();
  const intent = String(formData.get('intent') ?? '').trim();
  if (!spaceId || !studentId) return { ok: false, message: '缺少空间或学生。' };

  const supabase = await createClient();
  if (intent === 'remove') {
    const { error } = await supabase.from('space_members').delete().eq('space_id', spaceId).eq('student_id', studentId);
    if (error) return { ok: false, message: `移出学生失败：${error.message}` };
    revalidateSpaceSurfaces();
    return { ok: true, message: '已移出该学生。' };
  }

  const { error } = await supabase.from('space_members').insert({ space_id: spaceId, student_id: studentId, created_by: role.data.id });
  if (error) return { ok: false, message: `加入学生失败：${error.message}` };
  revalidateSpaceSurfaces();
  return { ok: true, message: '已加入该学生。' };
}

/**
 * 拉一个班进来 / 把一个班移出去。
 *
 * 移出 = 删掉那条边，该班学生即刻离开空间。**不碰任何学习数据**——他们沉淀的项目与
 * 会话仍在原地，对他们自己和班主任老师可见，只是不再挂在这位老师的空间主题下。
 * 这就是「零同步」的直接好处：没有孤儿要清，因为本来就没有成员行。
 */
export async function setSpaceClassAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const spaceId = String(formData.get('space_id') ?? '').trim();
  const classId = String(formData.get('class_id') ?? '').trim();
  const intent = String(formData.get('intent') ?? '').trim();
  if (!spaceId || !classId) return { ok: false, message: '缺少空间或班级。' };

  const supabase = await createClient();
  if (intent === 'remove') {
    const { error } = await supabase.from('space_classes').delete().eq('space_id', spaceId).eq('class_id', classId);
    if (error) return { ok: false, message: `移出班级失败：${error.message}` };
    revalidateSpaceSurfaces();
    return { ok: true, message: '已移出该班，班内学生不再属于这个空间。' };
  }

  const { data: added, error } = await supabase.rpc('pull_class_into_space', {
    p_space_id: spaceId,
    p_class_id: classId,
  });
  if (error) return { ok: false, message: `拉班失败：${error.message}` };
  revalidateSpaceSurfaces();
  // RPC 返回新增边数：0 表示这个班本来就在空间里，不是错误，但值得说清楚。
  return { ok: true, message: added ? '已拉入该班。' : '该班本来就在这个空间里。' };
}

/** 归档空间。不支持硬删除（迁移里没有 delete 策略），归档后学生侧即刻消失、主题立刻不再生效。 */
export async function archiveSpaceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const spaceId = String(formData.get('space_id') ?? '').trim();
  if (!spaceId) return { ok: false, message: '缺少空间。' };

  const supabase = await createClient();
  const { error } = await supabase.from('spaces').update({ status: 'archived' }).eq('id', spaceId);
  if (error) return { ok: false, message: `归档失败：${error.message}` };

  revalidateSpaceSurfaces();
  return { ok: true, message: '空间已归档，学生侧不再显示。' };
}
