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

/** 会话级核实状态。 */
export function reviewStateLabel(state: ReviewState): string {
  if (state === 'confirmed') return '已提交';
  if (state === 'revised') return '已提交含修订';
  return '待最终提交';
}

/** 单条 AI 回答气泡的核实状态。 */
export function assistantStateLabel(state?: ReviewState): string {
  if (state === 'revised') return '已修订';
  if (state === 'confirmed') return '已确认无误';
  return '待随会话提交';
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

export type AuditHrefParams = { page?: number; status?: string; session?: string };

/**
 * 核实页的链接构造。选中态与分页共用同一套 searchParams——
 * 页面因此可以直接深链到某条会话，后退键也正常工作。
 */
export function buildAuditHref({ page, status, session }: AuditHrefParams): string {
  const params = new URLSearchParams();
  if (status === 'all') params.set('status', 'all');
  if (page && page > 1) params.set('page', String(page));
  if (session) params.set('session', session);
  const query = params.toString();
  return query ? `/teacher/audit?${query}` : '/teacher/audit';
}
