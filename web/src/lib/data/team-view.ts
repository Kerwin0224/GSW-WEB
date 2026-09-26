import { createClient } from '@/lib/supabase/server';
import { fail, ok, requireRole, type DataResult } from './common';

export type TeamReviewRow = {
  scopeType: 'class' | 'space';
  scopeId: string;
  label: string;
  teacherCount: number;
  studentCount: number;
  pendingCount: number;
  finalizedCount: number;
};

/**
 * 组内学情：能力位授权范围内的核实聚合。
 *
 * 统计口径只由 SQL 侧决定（见迁移 20260926173000 的 team_review_summary），
 * 应用层不重复过滤、不重算：那份判定依赖 role_grants 与跨表可见性，
 * 在应用层重做一遍就变成第二处会漂移的真源。
 *
 * **这里拿到的是计数，不是别人的会话原文。** 教师看学生对话的路径仍然只有
 * 「自己带的班级」和「自己拥有的空间」两条，组内视角不扩张这条边界。
 */
export async function listTeamAuditSummary(_scopeIds: string[]): Promise<DataResult<TeamReviewRow[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('team_review_summary');
  if (error) return fail('error', `组内学情加载失败：${error.message}`);

  const rows = (data ?? []) as Array<{
    scope_type: string;
    scope_id: string;
    scope_label: string | null;
    teacher_count: number | string;
    student_count: number | string;
    pending_count: number | string;
    finalized_count: number | string;
  }>;

  return ok(
    rows
      .filter((row): row is typeof row & { scope_type: 'class' | 'space' } => row.scope_type === 'class' || row.scope_type === 'space')
      .map((row) => ({
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        // 空间或班级被删后 label 会是空：显示成「已删除的教学单元」，
        // 不显示空白——空白看起来像加载失败。
        label: row.scope_label?.trim() || '已删除的教学单元',
        teacherCount: Number(row.teacher_count ?? 0),
        studentCount: Number(row.student_count ?? 0),
        pendingCount: Number(row.pending_count ?? 0),
        finalizedCount: Number(row.finalized_count ?? 0),
      })),
  );
}
