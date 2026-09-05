/**
 * audit-record.ts
 *
 * 学习记录核实的共享辅助逻辑。
 *
 * teacher.ts（只读查询层）和 teacher-actions.ts（写入 Server Actions 层）
 * 都需要对 audit_records 行做状态推断，原本各自维护一份副本。
 * 这里定义最小结构接口 + 纯函数，使两边共享同一实现，消除语义漂移风险。
 *
 * 接口设计原则：
 *   - AuditRowBase — 只包含这批纯函数真正需要的字段，两个调用方各自的本地类型
 *     可以 satisfies 或赋值兼容，无需 extends。
 *   - 所有函数均为纯函数，无副作用，可直接单元测试。
 */

/** 纯函数依赖的最小审阅行结构。 */
export type AuditRowBase = {
  kind?: 'sft' | 'dpo' | 'metadata' | null;
  status?: string | null;
  original_answer?: string | null;
  corrected_answer?: string | null;
  chosen_answer?: string | null;
  rejected_answer?: string | null;
  metadata?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

/** 审阅状态：对应学习记录核实中单条 AI 回答气泡的核实结果。 */
export type ReviewState = 'pending' | 'confirmed' | 'revised';

// ─── 基础谓词 ─────────────────────────────────────────────────────────────────

export function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function reviewTimestamp(row: AuditRowBase): string {
  return row.updated_at ?? row.created_at ?? '';
}

/**
 * 防御式检查：行是否处于"已被教师审批"的可见态。
 *
 * audit_status 在数据库层只有 approved 和 exported 两个值（CONTEXT.md：
 * 没有中间审批态）。行的 status 来自数据库 join 后的 unknown，仍然
 * 显式校验，避免上游脏数据或类型断言错误。
 */
export function isApprovedAudit(row: AuditRowBase): boolean {
  return row.status === 'approved' || row.status === 'exported';
}

export function asMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function metadataAction(row: AuditRowBase): unknown {
  return asMetadataObject(row.metadata).teacher_action;
}

/** 读取 metadata 中的字符串字段；找不到或非字符串时返回空字符串。 */
export function metadataText(row: AuditRowBase, key: string): string {
  const value = asMetadataObject(row.metadata)[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function isRevisionDraft(row: AuditRowBase): boolean {
  return row.kind === 'metadata' && isApprovedAudit(row) && metadataAction(row) === 'revision_draft';
}

// ─── 状态解析 ─────────────────────────────────────────────────────────────────

export function latestRevisionDraft<T extends AuditRowBase>(rows: T[]): T | undefined {
  return rows
    .filter(isRevisionDraft)
    .sort((left, right) => reviewTimestamp(right).localeCompare(reviewTimestamp(left)))[0];
}

export function latestMaterializedReview<T extends AuditRowBase>(rows: T[]): T | undefined {
  return rows
    .filter((row) => (row.kind === 'sft' || row.kind === 'dpo') && isApprovedAudit(row))
    .sort((left, right) => reviewTimestamp(right).localeCompare(reviewTimestamp(left)))[0];
}

/**
 * 从单条审阅行提取展示用的修订对（原始回答 / 修订回答）。
 * 字段读取优先级：DPO 专用字段 > SFT/metadata 通用字段 > metadata 内联 JSON。
 * 若两者相同或任一为空则返回 null（无意义的修订）。
 */
export function revisionDisplayFromRow(row: AuditRowBase | undefined): {
  originalAnswer: string;
  correctedAnswer: string;
} | null {
  if (!row) return null;
  const originalAnswer =
    row.rejected_answer?.trim() ||
    row.original_answer?.trim() ||
    metadataText(row, 'original_answer');
  const correctedAnswer =
    row.chosen_answer?.trim() ||
    row.corrected_answer?.trim() ||
    metadataText(row, 'corrected_answer');
  if (!originalAnswer || !correctedAnswer || originalAnswer === correctedAnswer) return null;
  return { originalAnswer, correctedAnswer };
}

/**
 * 综合 draft 和 materialized review，决定当前展示的修订版本。
 * draft 时间 >= 最新已物化时间时，优先展示 draft（即保存了但还未最终提交的修订）。
 */
export function resolveRevisionDisplay<T extends AuditRowBase>(
  audits: T[] | undefined,
): { originalAnswer: string; correctedAnswer: string } | null {
  const rows = audits ?? [];
  const latestDraft = latestRevisionDraft(rows);
  const latestReviewed = latestMaterializedReview(rows);
  const displayRow =
    latestDraft && (!latestReviewed || reviewTimestamp(latestDraft) >= reviewTimestamp(latestReviewed))
      ? latestDraft
      : latestReviewed;
  return revisionDisplayFromRow(displayRow);
}

/**
 * 推断单条 AI 回答气泡的核实状态。
 *
 * 规则（与 CONTEXT.md 对齐）：
 *   - draft 存在且时间 >= 最新已物化记录 → 'revised'（草稿修订，尚未最终提交）
 *   - 无任何已批准的 sft/dpo 记录 → 'pending'
 *   - 最新已物化记录是 dpo 或含 corrected/chosen 字段 → 'revised'（已最终提交的修订）
 *   - 否则 → 'confirmed'（无修订，已确认无误）
 */
export function resolveReviewState<T extends AuditRowBase>(
  audits: T[] | undefined,
): ReviewState {
  const rows = audits ?? [];
  const latestDraft = latestRevisionDraft(rows);
  const latestReviewed = latestMaterializedReview(rows);
  const reviewed = rows.filter(
    (audit) => (audit.kind === 'sft' || audit.kind === 'dpo') && isApprovedAudit(audit),
  );

  if (latestDraft && (!latestReviewed || reviewTimestamp(latestDraft) >= reviewTimestamp(latestReviewed)))
    return 'revised';
  if (reviewed.length === 0) return 'pending';
  if (!latestReviewed) return 'pending';
  if (latestReviewed.kind === 'dpo' || latestReviewed.corrected_answer || latestReviewed.chosen_answer)
    return 'revised';
  return 'confirmed';
}

/**
 * 按 metadata.teacher_action 过滤并取最新一条 metadata 类审阅行。
 * 用于定位 conversation_pre_review / conversation_finalized 等会话级事件。
 */
export function latestMetadataByAction<T extends AuditRowBase>(
  rows: T[],
  action: string,
): T | undefined {
  return rows
    .filter(
      (row) =>
        row.kind === 'metadata' &&
        (row.status === 'approved' || row.status === 'exported') &&
        metadataAction(row) === action,
    )
    .sort((left, right) => reviewTimestamp(right).localeCompare(reviewTimestamp(left)))[0];
}
