'use server';

/**
 * spaces.ts —— 空间的读写面。
 *
 * 空间属于**老师**：老师建空间、写主题、通过班批量拉学生；学生切换自己被拉进去的空间。
 *
 * 这个模块刻意不提供「加成员 / 移成员」类接口。成员关系由 space_classes 一条边派生
 * （一行 = 该班全部学生都在内），所以对外只有「拉班 / 取消拉班」。这样班册变动零维护
 * （新生自动进、退学自动出），全库没有第二份名册需要同步。
 *
 * 代价是明确的：不支持「只拉班里的部分学生」与「逐个移出学生」。要支持就得引入
 * 第二份名册真源，而那份真源不响应班册变化、学生转学后会留孤儿行。
 *
 * 写入口只有两个：create_space RPC（建空间 + 写主题 + 首次拉班，一次调用）与
 * 对 space_classes 的直接增删。两者都是 security invoker —— RLS 仍是唯一防线，
 * 应用层不做租户过滤（与 admin.ts 的口径一致：DB 是唯一闸门）。
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { fail, ok, requireRole, type ActionState, type DataResult } from './common';

export type SpaceClassSummary = { classId: string; className: string; studentCount: number };

export type TeacherSpace = {
  id: string;
  name: string;
  theme: string;
  classes: SpaceClassSummary[];
  /** 空间覆盖的学生总数（各班去重后；MVP 一个学生只属一个班，直接相加即可）。 */
  studentCount: number;
};

/** 学生视角：只要够渲染切换器。 */
export type StudentSpace = { id: string; name: string };

function revalidateSpaceSurfaces() {
  revalidatePath('/teacher');
  revalidatePath('/student');
}

/**
 * 我建的（活跃）空间，含已拉的班与各班学生数。
 *
 * 学生数取 class_memberships 的 role='student' 计数而非另立名册——名册的唯一真源
 * 就是班级成员关系，这里只是聚合它。
 */
export async function listTeacherSpaces(): Promise<DataResult<TeacherSpace[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();

  const { data: spaces, error } = await supabase
    .from('spaces')
    .select('id,name,theme,space_classes(class_id,classes(name))')
    .eq('owner_id', role.data.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) return fail('error', `空间加载失败：${error.message}`);

  type Row = {
    id: string;
    name: string;
    theme: string;
    space_classes: Array<{ class_id: string; classes: { name: string | null } | Array<{ name: string | null }> | null }> | null;
  };
  const rows = (spaces ?? []) as unknown as Row[];
  const classIds = Array.from(new Set(rows.flatMap((row) => (row.space_classes ?? []).map((edge) => edge.class_id))));

  const studentCountByClass = new Map<string, number>();
  if (classIds.length > 0) {
    const { data: memberships, error: membershipError } = await supabase
      .from('class_memberships')
      .select('class_id')
      .in('class_id', classIds)
      .eq('role', 'student');
    if (membershipError) return fail('error', `班级学生数加载失败：${membershipError.message}`);
    for (const membership of (memberships ?? []) as Array<{ class_id: string }>) {
      studentCountByClass.set(membership.class_id, (studentCountByClass.get(membership.class_id) ?? 0) + 1);
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
    return {
      id: row.id,
      name: row.name,
      theme: row.theme,
      classes,
      studentCount: classes.reduce((sum, klass) => sum + klass.studentCount, 0),
    };
  }));
}

/**
 * 学生视角：我被拉进去的空间。
 *
 * 不加任何学生侧过滤——`spaces_select` 策略里的 is_my_space(id) 已经就是
 * 「我在这个空间的某个班里，且空间所有者仍任教该班」。查不到就是空。
 */
export async function listStudentSpaces(): Promise<DataResult<StudentSpace[]>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('spaces')
    .select('id,name')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) return fail('error', `空间加载失败：${error.message}`);
  return ok((data ?? []) as StudentSpace[]);
}

/**
 * 建空间 或 改已有空间（名字 / 主题 / 首次拉班）。表单驱动的单一入口。
 *
 * 走 create_space RPC 而不是裸 insert：建空间、写主题、拉一个班是三张表的写，
 * 收在一次调用里调用方就不必自己保证顺序与事务性。RPC 是幂等的（同名活跃空间复用），
 * 所以表单重复提交不会建出两个空间。
 */
export async function saveSpaceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const spaceId = String(formData.get('space_id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const theme = String(formData.get('theme') ?? '').trim();
  const classId = String(formData.get('class_id') ?? '').trim();
  if (!name) return { ok: false, message: '请填写空间名称。', errors: { name: '空间名称不能为空。' } };

  const supabase = await createClient();

  // 有 space_id 就是改已有空间。改名走不了 RPC（RPC 按 (owner, name) 幂等，改名会被
  // 当成建一个新空间），所以直接 update —— RLS 的 spaces_update 策略管着权限。
  if (spaceId) {
    const { error } = await supabase.from('spaces').update({ name, theme }).eq('id', spaceId);
    if (error) return { ok: false, message: `空间保存失败：${error.message}` };
    revalidateSpaceSurfaces();
    return { ok: true, message: '空间已保存。' };
  }

  // 新建前先查同名：create_space 按 (owner, name) 幂等复用，命中就走 update set theme
  // 并返回同一个 uuid。调用方拿不到「新建 vs 复用」的信号，老师会以为建了第二个空间，
  // 实际是把第一个空间的口径改了——而 theme 就是归类提示词本身。
  const { data: existing, error: existingError } = await supabase
    .from('spaces')
    .select('id')
    .eq('owner_id', role.data.id)
    .eq('name', name)
    .eq('status', 'active')
    .maybeSingle();
  if (existingError) return { ok: false, message: `空间查重失败：${existingError.message}` };
  if (existing) {
    return { ok: false, message: `已存在同名空间「${name}」。换个名字，或直接编辑它。`, errors: { name: '空间名称重复。' } };
  }

  // 新建：建空间 + 写主题 + 首次拉班是三张表的写，收在一次 RPC 调用里。
  const { error } = await supabase.rpc('create_space', {
    p_name: name,
    p_theme: theme,
    p_class_id: classId || null,
  });
  if (error) return { ok: false, message: `空间保存失败：${error.message}` };

  revalidateSpaceSurfaces();
  return { ok: true, message: classId ? '空间已建好，该班学生已进入这个空间。' : '空间已建好。' };
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
