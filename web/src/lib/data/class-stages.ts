import 'server-only';

/**
 * class-stages.ts —— 教师任教班级的学段。
 *
 * 为什么单独查：教师侧的班级清单（getTeacherClasses）只返回 id / 名称 / 人数，
 * 学段存在 classes.stage 上从没被读过。跨学段任教时（同时带初三和高一），
 * 只有班名的看板分不出「高一(3)班」和「初三(3)班」——两个都是「(3)班」，
 * 教师会以为看错了学生。classes.grade 已降级为纯展示字段，学段查询用 stage。
 */

import { createClient } from '@/lib/supabase/server';
import { fail, ok, requireRole, type DataResult } from './common';

export type TeacherClassStage = { classId: string; className: string; stage: string | null };

export async function listTeacherClassStages(): Promise<DataResult<TeacherClassStage[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('class_memberships')
    .select('class_id,classes(id,name,stage)')
    .eq('profile_id', role.data.id)
    .eq('role', 'teacher');
  if (error) return fail('error', `任教班级学段加载失败：${error.message}`);

  const rows = (data ?? []) as Array<{ class_id: string; classes: { id: string; name: string | null; stage: string | null } | Array<{ id: string; name: string | null; stage: string | null }> | null }>;
  return ok(rows.flatMap((row) => {
    const klass = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    if (!klass) return [];
    return [{ classId: klass.id ?? row.class_id, className: klass.name ?? '未命名班级', stage: klass.stage }];
  }));
}
