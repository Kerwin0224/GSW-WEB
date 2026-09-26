'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { fail, ok, requireRole, type ActionState, type DataResult } from './common';

/**
 * assignments.ts —— 任务下发闭环：教师发起 → 学生完成 → 教师看到完成情况。
 *
 * 此前全仓没有 assignment / submission 任何表，教师无法为学生预置任务、指定层级、
 * 设截止时间。产品只有「学生向 AI 提问 → 教师事后核实」一条主循环，
 * 换成任务驱动课堂，学生端等于空壳。
 *
 * 受众两种：按班级（assignment_recipients 为空 = 面向空间全体成员），
 * 或点名若干学生（assignment_recipients 有行）。空间的 school_id 由库里的
 * sync_assignment_scope 触发器推导，应用层不重复推导。
 */

export type AssignmentKind = 'practice' | 'question' | 'reading' | 'project_work';

export const ASSIGNMENT_KINDS: Array<{ value: AssignmentKind; label: string }> = [
  { value: 'practice', label: '练习' },
  { value: 'question', label: '提问' },
  { value: 'reading', label: '阅读思考' },
  { value: 'project_work', label: '项目任务' },
];

/** 客户端组件要拿这个形状做 useActionState，从数据层原样再导出，不另抄一份。 */
export type { ActionState };

export const ASSIGNMENT_KIND_SET: readonly AssignmentKind[] = ASSIGNMENT_KINDS.map((item) => item.value);

export type TeacherAssignment = {
  id: string;
  title: string;
  instructions: string | null;
  kind: AssignmentKind;
  targetLevel: number | null;
  dueAt: string | null;
  status: 'open' | 'closed';
  classId: string | null;
  className: string;
  spaceId: string | null;
  spaceName: string;
  /** 点名的学生；整班布置时为空数组。 */
  recipients: Array<{ profileId: string; displayName: string; completedAt: string | null }>;
  createdAt: string;
};

export type StudentAssignment = {
  id: string;
  title: string;
  instructions: string | null;
  kind: AssignmentKind;
  targetLevel: number | null;
  dueAt: string | null;
  /** 我是否被点名。未被点名时为空。 */
  completedAt: string | null;
  /** 已提交的产物数（教师已看到完成情况，学生只看自己那条）。 */
  submissionCount: number;
  createdAt: string;
};

type AssignmentRow = {
  id: string;
  title: string;
  instructions: string | null;
  kind: AssignmentKind;
  target_level: number | null;
  due_at: string | null;
  status: 'open' | 'closed';
  class_id: string | null;
  space_id: string | null;
  created_at: string;
  classes?: { name: string | null } | Array<{ name: string | null }> | null;
  spaces?: { name: string | null } | Array<{ name: string | null }> | null;
};

function joined<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function revalidateAssignmentSurfaces() {
  revalidatePath('/teacher/assignments');
  revalidatePath('/student/assignments');
}

/**
 * 布置任务。
 *
 * 两种受众互斥：点名学生就必须给出班级或空间锚点，否则 RLS 判不出教师能不能写这条。
 * 受众行与任务行不是一次写入：任务写成功、受众写失败会留下一条「无受众」的任务，
 * 所以受众写失败时明确报错并说清任务已建，让教师去改而不是以为没建。
 */
export async function createAssignment(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  void _previousState;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const title = String(formData.get('title') ?? '').trim();
  const instructions = String(formData.get('instructions') ?? '').trim() || null;
  const kind = String(formData.get('kind') ?? 'practice') as AssignmentKind;
  const classId = String(formData.get('class_id') ?? '').trim() || null;
  const spaceId = String(formData.get('space_id') ?? '').trim() || null;
  const dueAtRaw = String(formData.get('due_at') ?? '').trim();
  const targetLevelRaw = Number.parseInt(String(formData.get('target_level') ?? ''), 10);
  const recipientIds = formData.getAll('recipients').map((value) => String(value).trim()).filter(Boolean);

  const errors: Record<string, string> = {};
  if (!title) errors.title = '请填写任务标题。';
  if (!ASSIGNMENT_KIND_SET.includes(kind)) errors.kind = '请选择任务类型。';
  if (!classId && !spaceId) errors.scope = '请选择按哪个班级或空间布置。';
  if (recipientIds.length > 0 && !classId && !spaceId) errors.recipients = '点名学生时必须先选班级或空间。';
  // 层级是 1..6 的整数。空值合法（不指定目标层级），但写了非法值不能默默当空值处理。
  if (String(formData.get('target_level') ?? '').trim() && (!Number.isInteger(targetLevelRaw) || targetLevelRaw < 1 || targetLevelRaw > 6)) {
    errors.target_level = '目标层级请填 1 到 6 之间的整数，或留空。';
  }
  if (dueAtRaw && Number.isNaN(Date.parse(dueAtRaw))) errors.due_at = '截止时间格式无效。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐任务信息。', errors };

  const supabase = await createClient();
  const { data: created, error: createError } = await supabase
    .from('assignments')
    .insert({
      title,
      instructions,
      kind,
      class_id: classId,
      space_id: spaceId,
      target_level: Number.isInteger(targetLevelRaw) ? targetLevelRaw : null,
      // datetime-local 给的是本地时间且不带时区，补 Z 会被当成 UTC 而偏几个小时。
      due_at: dueAtRaw ? new Date(dueAtRaw).toISOString() : null,
      created_by: role.data.id,
    })
    .select('id');
  if (createError) return { ok: false, message: `任务创建失败：${createError.message}` };
  // 0 行 = RLS 静默过滤掉的写入。不检查就会报「已布置」而列表里没有这条。
  if (!created || created.length === 0) {
    return { ok: false, message: '任务没有保存，本次布置未生效。请确认你对该班级或空间有布置权限。' };
  }

  if (recipientIds.length > 0) {
    const { data: written, error: recipientError } = await supabase
      .from('assignment_recipients')
      .insert(recipientIds.map((profileId) => ({ assignment_id: created[0].id, profile_id: profileId })))
      .select('assignment_id');
    if (recipientError) {
      return { ok: false, message: `任务已创建，但点名学生写入失败：${recipientError.message}。请到任务列表里重新指定学生。` };
    }
    if (!written || written.length !== recipientIds.length) {
      return { ok: false, message: `任务已创建，但只点名了 ${written?.length ?? 0}/${recipientIds.length} 名学生。请到任务列表里补齐。` };
    }
  }

  revalidateAssignmentSurfaces();
  revalidatePath('/teacher');
  return { ok: true, message: recipientIds.length > 0 ? `任务已布置给 ${recipientIds.length} 名学生。` : '任务已布置。' };
}

/** 教师侧任务列表：带受众与完成情况。 */
export async function listTeacherAssignments(): Promise<DataResult<TeacherAssignment[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('assignments')
    .select('id,title,instructions,kind,target_level,due_at,status,class_id,space_id,created_at,classes(name),spaces(name),assignment_recipients(profile_id,completed_at,profiles!inner(id,display_name))')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return fail('error', `任务列表加载失败：${error.message}`);

  const rows = (data ?? []) as Array<AssignmentRow & {
    assignment_recipients?: Array<{ profile_id: string; completed_at: string | null; profiles?: { id: string; display_name: string | null } | Array<{ id: string; display_name: string | null }> | null }> | null;
  }>;

  return ok(rows.map((row) => ({
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    kind: row.kind,
    targetLevel: row.target_level,
    dueAt: row.due_at,
    status: row.status,
    classId: row.class_id,
    className: joined(row.classes)?.name?.trim() || '未分班',
    spaceId: row.space_id,
    spaceName: joined(row.spaces)?.name?.trim() || '未指定空间',
    recipients: (row.assignment_recipients ?? []).map((item) => ({
      profileId: item.profile_id,
      displayName: joined(item.profiles)?.display_name?.trim() || '未命名学生',
      completedAt: item.completed_at,
    })),
    createdAt: row.created_at,
  })));
}

/**
 * 学生侧待办。
 *
 * 可见性交给 RLS（布置人 / 本班学生 / 空间成员），应用层不重写授权。
 * completed_at 只对被点名的学生有意义：整班布置时它是空的，
 * 「我完成了没有」由 submissions 回答，不靠这一列。
 */
export async function listStudentAssignments(): Promise<DataResult<StudentAssignment[]>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('assignments')
    .select('id,title,instructions,kind,target_level,due_at,status,created_at,assignment_recipients(completed_at)')
    .eq('status', 'open')
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(50);
  if (error) return fail('error', `待办任务加载失败：${error.message}`);

  const rows = (data ?? []) as Array<AssignmentRow & { assignment_recipients?: Array<{ completed_at: string | null }> | null }>;
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return ok([]);

  // 提交物计数单独取：join 进 assignments 会让一条任务按提交数重复，计数与列表就对不上。
  const { data: submissionRows, error: submissionError } = await supabase
    .from('submissions')
    .select('assignment_id')
    .eq('owner_id', role.data.id)
    .in('assignment_id', ids);
  if (submissionError) return fail('error', `提交物计数失败：${submissionError.message}`);
  const submissionCountByAssignment = new Map<string, number>();
  for (const row of (submissionRows ?? []) as Array<{ assignment_id: string | null }>) {
    if (!row.assignment_id) continue;
    submissionCountByAssignment.set(row.assignment_id, (submissionCountByAssignment.get(row.assignment_id) ?? 0) + 1);
  }

  return ok(rows.map((row) => {
    const mine = (row.assignment_recipients ?? []).find((item) => item.completed_at);
    return {
      id: row.id,
      title: row.title,
      instructions: row.instructions,
      kind: row.kind,
      targetLevel: row.target_level,
      dueAt: row.due_at,
      completedAt: mine?.completed_at ?? null,
      submissionCount: submissionCountByAssignment.get(row.id) ?? 0,
      createdAt: row.created_at,
    };
  }));
}

/** 关闭任务。学生不能再看到它，但已有的提交物与核实记录全部保留。 */
export async function closeAssignment(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  void _previousState;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const assignmentId = String(formData.get('assignmentId') ?? '').trim();
  const supabase = await createClient();
  const { data: updatedRows, error } = await supabase
    .from('assignments')
    .update({ status: 'closed' })
    .eq('id', assignmentId)
    .eq('created_by', role.data.id)
    .eq('status', 'open')
    .select('id');
  if (error) return { ok: false, message: `任务关闭失败：${error.message}` };
  if (!updatedRows || updatedRows.length === 0) {
    return { ok: false, message: '任务不存在、已关闭或不在你的范围内，本次操作未生效。' };
  }

  revalidateAssignmentSurfaces();
  return { ok: true, message: '任务已关闭。' };
}
