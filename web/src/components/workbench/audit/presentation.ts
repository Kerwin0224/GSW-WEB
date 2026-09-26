/**
 * presentation.ts
 *
 * 学习记录核实的展示层措辞与链接构造。列表、详情、看板三处共用同一套措辞，
 * 避免同一状态在不同界面被叫成两个名字。
 *
 * 术语对齐 CONTEXT.md：教师侧统一用「学习记录核实」「AI 预审」「确认无误」「确认提交整个会话」；
 * audit / 初筛 这类词不出现在教师可见文案里。
 */

import type { PreReviewState } from '@/lib/audit-queue';
import type { ReviewState } from '@/lib/data/audit-record';
import type { TeacherAuditQueueFilters } from '@/lib/data/teacher';

/** 会话级核实状态。 */
export function reviewStateLabel(state: ReviewState): string {
  if (state === 'confirmed') return '已提交';
  if (state === 'revised') return '已提交含修订';
  return '待核实';
}

/** 单条 AI 回答气泡的核实状态。 */
export function assistantStateLabel(state?: ReviewState): string {
  if (state === 'revised') return '已修订';
  if (state === 'confirmed') return '已确认无误';
  return '待核实（随会话提交）';
}

/**
 * AI 预审的一句话摘要。列表行与详情面板共用：
 * 入参刻意只取计数，让两种数据形状（只带计数的列表行 / 带疑点全文的详情）都能用。
 */
export function preReviewSummaryLabel(input: {
  preReviewState: PreReviewState;
  coveredCount: number;
  assistantCount: number;
  issueCount: number;
}): string {
  const coverage = `${input.coveredCount}/${input.assistantCount}`;
  switch (input.preReviewState) {
    case 'ready':
      return input.issueCount > 0
        ? `AI 预审 ${input.issueCount} 处疑点 · 覆盖 ${coverage}`
        : `AI 预审已覆盖 ${coverage} · 无明显疑点`;
    case 'partial':
      return `AI 预审待补充 ${coverage}`;
    case 'blocked':
      return 'AI 预审暂不可用';
    case 'failed':
      return 'AI 预审失败';
    default:
      return '尚未运行 AI 预审';
  }
}

export type AuditHrefParams = { page?: number; status?: string; session?: string } & TeacherAuditQueueFilters;

/**
 * 核实队列的两个真实视图。
 *
 * 此前只有一个 `status=all`，而服务端的 all 不做任何过滤（见 data/teacher.ts），
 * 于是「查看已提交的记录」点进去看到的仍是全部会话——标签在撒谎。
 * 两个态必须真的对应两种查询结果，所以这里给出显式枚举，URL 传不进来就回落到待核实。
 */
export const AUDIT_QUEUE_VIEWS = [
  { value: 'pending', label: '待核实' },
  { value: 'finalized', label: '已提交' },
] as const;

export type AuditQueueView = (typeof AUDIT_QUEUE_VIEWS)[number]['value'];

export function auditQueueView(value: string | undefined): AuditQueueView {
  return AUDIT_QUEUE_VIEWS.some((view) => view.value === value) ? (value as AuditQueueView) : 'pending';
}

export function auditQueueViewLabel(view: AuditQueueView): string {
  return AUDIT_QUEUE_VIEWS.find((item) => item.value === view)?.label ?? '待核实';
}

/**
 * 核实页的链接构造。选中态、分页与筛选共用同一套 searchParams——
 * 页面因此可以直接深链到某条会话，后退键也正常工作。
 *
 * 筛选值原样带回去：切换视图或翻页时丢掉筛选，等于告诉教师「你刚才筛的那个班不在这里」。
 */
export function buildAuditHref({ page, status, session, classId, studentId, projectId, hasIssue, dateFrom }: AuditHrefParams): string {
  const params = new URLSearchParams();
  if (status && status !== 'pending') params.set('status', status);
  if (page && page > 1) params.set('page', String(page));
  if (session) params.set('session', session);
  if (classId) params.set('classId', classId);
  if (studentId) params.set('studentId', studentId);
  if (projectId) params.set('projectId', projectId);
  if (hasIssue) params.set('hasIssue', '1');
  if (dateFrom) params.set('dateFrom', dateFrom);
  const query = params.toString();
  return query ? `/teacher/audit?${query}` : '/teacher/audit';
}

/** 当前筛选是否为空。空筛选不写进 URL，免得把默认值显示成显式设置。 */
export function hasActiveAuditFilters(filters: TeacherAuditQueueFilters) {
  return Boolean(filters.classId || filters.studentId || filters.projectId || filters.hasIssue || filters.dateFrom);
}
