'use server';

import { revalidatePath } from 'next/cache';

import {
  createReviewDimension,
  deleteReviewDimension,
  moveReviewDimension,
  setReviewDimensionEnabled,
  updateReviewDimension,
  type ReviewDimensionInput,
} from '@/lib/data/review-dimensions';
import type { PreReviewSeverity } from '@/lib/teacher-pre-review';

/** 与 lib/data/common.ts 的 ActionState 同形。 */
export type DimensionActionState = { ok: boolean; message: string; errors?: Record<string, string> };

const SEVERITIES: PreReviewSeverity[] = ['low', 'medium', 'high'];

function readInput(formData: FormData): { input: ReviewDimensionInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const labelKey = String(formData.get('label_key') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim();
  const criteria = String(formData.get('criteria') ?? '').trim();
  const promptFragment = String(formData.get('prompt_fragment') ?? '').trim();
  const defaultSeverity = String(formData.get('default_severity') ?? 'medium') as PreReviewSeverity;
  const sortOrder = Number(formData.get('sort_order') ?? 100);

  if (!labelKey) errors.label_key = '请填写稳定键。';
  if (!displayName) errors.display_name = '请填写显示名。';
  if (!criteria) errors.criteria = '请填写判定说明。';
  if (!SEVERITIES.includes(defaultSeverity)) errors.default_severity = '默认严重度只能是 low / medium / high。';
  if (!Number.isFinite(sortOrder)) errors.sort_order = '顺序必须是数字。';

  return { input: { labelKey, displayName, criteria, promptFragment, defaultSeverity, sortOrder }, errors };
}

export async function submitReviewDimension(
  _previousState: DimensionActionState,
  formData: FormData,
): Promise<DimensionActionState> {
  const dimensionId = String(formData.get('dimension_id') ?? '').trim();
  const { input, errors } = readInput(formData);
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐维度信息。', errors };

  const result = dimensionId
    ? await updateReviewDimension(dimensionId, input)
    : await createReviewDimension(input);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/admin/review-dimensions');
  return { ok: true, message: dimensionId ? '维度已保存，下次 AI 预审按新口径执行。' : '维度已新增。' };
}

export async function toggleReviewDimension(dimensionId: string, enabled: boolean): Promise<DimensionActionState> {
  const result = await setReviewDimensionEnabled(dimensionId, enabled);
  return result.ok
    ? { ok: true, message: enabled ? '维度已启用。' : '维度已停用：AI 预审不再检查这一类疑点，历史疑点仍按原标签保留。' }
    : { ok: false, message: result.message };
}

export async function shiftReviewDimension(dimensionId: string, direction: 'up' | 'down'): Promise<DimensionActionState> {
  const result = await moveReviewDimension(dimensionId, direction);
  return result.ok ? { ok: true, message: '顺序已调整。' } : { ok: false, message: result.message };
}

export async function removeReviewDimension(dimensionId: string): Promise<DimensionActionState> {
  const result = await deleteReviewDimension(dimensionId);
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath('/admin/review-dimensions');
  return { ok: true, message: '本校覆盖已删除，该维度回落平台默认。' };
}
