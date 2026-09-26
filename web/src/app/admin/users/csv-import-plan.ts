/**
 * CSV 导入的纯逻辑：把预览行按"会发生什么"分类，以及失败时回推已成功的行数。
 *
 * 独立成文件是为了能直接跑 node --test（TSX 里的函数没法在 node 里 import）。
 * 服务端预览已带 willUpdate / existingRole（同校口径，最准）；拿不到时退回
 * 用页面上的账号列表本地比对（列表带筛选时不完整，界面会提示）。
 */
export type ExistingImportUser = { loginId: string | null; displayName: string; role: string };

export type CsvPlanRow = {
  rowNumber: number;
  status: 'valid' | 'invalid';
  loginId: string;
  displayName: string;
  role: string | null;
  errors: string[];
  subject: string | null;
  className: string | null;
  /** 服务端预览给的同校既有角色；非空即这一行会覆盖已有账号。 */
  existingRole?: string | null;
  willUpdate?: boolean;
};

export type RowKind = 'create' | 'update' | 'role-change' | 'duplicate' | 'invalid';

export type RowPlan = {
  row: CsvPlanRow;
  kind: RowKind;
  existingRole?: string;
  existingName?: string;
  duplicateOfRow?: number;
};

export const KIND_LABEL: Record<RowKind, string> = {
  create: '新建',
  update: '更新资料',
  'role-change': '角色变化',
  duplicate: '本批重复',
  invalid: '有错误',
};

export function planRows(rows: CsvPlanRow[], existing: ExistingImportUser[]): RowPlan[] {
  const byLoginId = new Map(existing.filter((user) => user.loginId).map((user) => [user.loginId!.trim(), user]));
  const firstSeenRow = new Map<string, number>();

  return rows.map((row) => {
    if (row.status === 'invalid') return { row, kind: 'invalid' as const };
    if (row.willUpdate) {
      return row.existingRole && row.existingRole !== row.role
        ? { row, kind: 'role-change' as const, existingRole: row.existingRole }
        : { row, kind: 'update' as const, existingRole: row.existingRole ?? undefined };
    }
    const key = row.loginId.trim();
    const seenAt = firstSeenRow.get(key);
    if (seenAt !== undefined) return { row, kind: 'duplicate' as const, duplicateOfRow: seenAt };
    firstSeenRow.set(key, row.rowNumber);

    const match = byLoginId.get(key);
    if (!match) return { row, kind: 'create' as const };
    if (match.role !== row.role) return { row, kind: 'role-change' as const, existingRole: match.role, existingName: match.displayName };
    return { row, kind: 'update' as const, existingRole: match.role, existingName: match.displayName };
  });
}

/**
 * 失败时数据层给的是"第 N 行出错"，据此回推已经写进去多少行。
 * 服务端若直接回报 succeededCount，优先用它。
 */
export function succeededRowCount(message: string, plans: RowPlan[], reported?: number): number | null {
  if (typeof reported === 'number' && Number.isFinite(reported)) return reported;
  const match = /第\s*(\d+)\s*行/.exec(message);
  if (!match) return null;
  const failedRow = Number(match[1]);
  return plans.filter((plan) => plan.row.status === 'valid' && plan.row.rowNumber < failedRow).length;
}
