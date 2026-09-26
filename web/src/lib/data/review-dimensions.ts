'use server';

/**
 * AI 预审评价维度的管理端读写面。
 *
 * 维度此前写死在提示词里的一句自然语言 bullet；现在 review_dimensions 是真源：
 * 平台默认（school_id IS NULL）六条，学校行是**覆盖**不是追加，提示词从合并结果渲染。
 *
 * 三条写操作的纪律：
 *  · 平台默认行对任何账号都不可写（RLS 同样只放行 school_id 非空的行），界面不给入口；
 *  · 每次写都带 .eq('school_id', 当前学校) 与 .select()，0 行要能看见——
 *    被 RLS 过滤掉的写入既不报错也不返回行，界面照常刷新就长成「保存成功但没有它」；
 *  · 破坏性动作（删除、改判定口径）的提示文案在调用方，本文件只负责把结果说清楚。
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { PreReviewSeverity } from '@/lib/teacher-pre-review';
import { mergeReviewDimensions } from '@/lib/pre-review-dimensions';
import { fail, ok, requireRole, type DataResult } from './common';

export type AdminReviewDimension = {
  id: string;
  labelKey: string;
  displayName: string;
  criteria: string;
  promptFragment: string;
  defaultSeverity: PreReviewSeverity;
  sortOrder: number;
  enabled: boolean;
  /** platform = 平台默认（任何账号都不可写）；school = 本校覆盖。 */
  origin: 'platform' | 'school';
};

export type ReviewDimensionSettings = {
  platform: AdminReviewDimension[];
  school: AdminReviewDimension[];
  /** 合并后的生效维度，顺序与 AI 预审提示词里完全一致。 */
  effective: AdminReviewDimension[];
};

export type ReviewDimensionInput = {
  labelKey: string;
  displayName: string;
  criteria: string;
  promptFragment: string;
  defaultSeverity: PreReviewSeverity;
  sortOrder: number;
};

const SEVERITIES: PreReviewSeverity[] = ['low', 'medium', 'high'];

/** 与数据库 check 约束 review_dimensions_key_format 同口径，先在应用层拦下并给出可读文案。 */
const LABEL_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

type DimensionRow = {
  id: string;
  school_id: string | null;
  label_key: string;
  display_name: string;
  criteria: string | null;
  default_severity: string | null;
  prompt_fragment: string | null;
  sort_order: number | null;
  enabled: boolean | null;
};

function toAdminDimension(row: DimensionRow): AdminReviewDimension {
  return {
    id: row.id,
    labelKey: row.label_key,
    displayName: row.display_name,
    criteria: row.criteria?.trim() ?? '',
    promptFragment: row.prompt_fragment?.trim() ?? '',
    defaultSeverity: row.default_severity === 'low' || row.default_severity === 'high' ? row.default_severity : 'medium',
    sortOrder: row.sort_order ?? 100,
    enabled: row.enabled !== false,
    origin: row.school_id === null ? 'platform' : 'school',
  };
}

function validateInput(input: ReviewDimensionInput): string | null {
  if (!LABEL_KEY_PATTERN.test(input.labelKey)) {
    return '稳定键只能是小写字母开头的 2–40 位小写字母、数字或下划线，例如 concept_error。';
  }
  if (!input.displayName.trim()) return '请填写维度显示名。';
  if (!input.criteria.trim()) return '请填写判定说明：教师据此判断什么算这一类疑点。';
  if (!SEVERITIES.includes(input.defaultSeverity)) return '默认严重度只能是 low / medium / high。';
  if (!Number.isFinite(input.sortOrder)) return '顺序必须是数字。';
  return null;
}
/** 平台默认 + 本校覆盖，合成一份给页面列出来。平台行只读。 */
export async function getReviewDimensionSettings(): Promise<DataResult<ReviewDimensionSettings>> {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const schoolId = role.data.school_id;
  if (!schoolId) return fail('forbidden', '当前账号没有划归学校，无法维护本校的评价维度。');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('review_dimensions')
    .select('id,school_id,label_key,display_name,criteria,default_severity,prompt_fragment,sort_order,enabled')
    .or(`school_id.is.null,school_id.eq.${schoolId}`)
    .order('sort_order', { ascending: true });
  if (error) return fail('error', `评价维度加载失败：${error.message}`);

  const rows = (data ?? []) as unknown as DimensionRow[];
  const platform = rows.filter((row) => row.school_id === null).map(toAdminDimension);
  const school = rows.filter((row) => row.school_id !== null).map(toAdminDimension);
  // effective 与 AI 预审提示词用的是同一份合并结果：管理端看到的生效顺序就是模型看到的顺序。
  const effective = mergeReviewDimensions([...platform, ...school]);
  return ok({ platform, school, effective });
}

export async function createReviewDimension(input: ReviewDimensionInput): Promise<DataResult<{ id: string }>> {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const schoolId = role.data.school_id;
  if (!schoolId) return fail('forbidden', '当前账号没有划归学校，无法维护本校的评价维度。');

  const invalid = validateInput(input);
  if (invalid) return fail('error', invalid);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('review_dimensions')
    .insert({
      school_id: schoolId,
      label_key: input.labelKey,
      display_name: input.displayName.trim(),
      criteria: input.criteria.trim(),
      prompt_fragment: input.promptFragment.trim() || input.criteria.trim(),
      default_severity: input.defaultSeverity,
      sort_order: input.sortOrder,
      enabled: true,
    })
    .select('id')
    .maybeSingle();
  if (error) return fail('error', `评价维度保存失败${error.code === '23505' ? '：本校已存在同一个稳定键，请换一个' : `：${error.message}`}`);
  if (!data) return fail('error', '评价维度保存失败：数据库没有返回可核对的写入结果，请刷新后确认是否已保存。');

  revalidatePath('/admin/review-dimensions');
  return ok({ id: data.id });
}

/**
 * 改本校维度。改的是 AI 预审的判定口径与历史标签的归类：
 * 页面在提交前会把这句影响说给用户听，这里不再重复。
 */
export async function updateReviewDimension(id: string, input: ReviewDimensionInput): Promise<DataResult<{ id: string }>> {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const schoolId = role.data.school_id;
  if (!schoolId) return fail('forbidden', '当前账号没有划归学校，无法维护本校的评价维度。');

  const invalid = validateInput(input);
  if (invalid) return fail('error', invalid);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('review_dimensions')
    .update({
      label_key: input.labelKey,
      display_name: input.displayName.trim(),
      criteria: input.criteria.trim(),
      prompt_fragment: input.promptFragment.trim() || input.criteria.trim(),
      default_severity: input.defaultSeverity,
      sort_order: input.sortOrder,
    })
    .eq('id', id)
    .eq('school_id', schoolId)
    .select('id')
    .maybeSingle();
  if (error) return fail('error', `评价维度保存失败${error.code === '23505' ? '：本校已存在同一个稳定键，请换一个' : `：${error.message}`}`);
  if (!data) return fail('error', '评价维度保存失败：这条维度不存在或不属于本校，平台默认维度不可修改。');

  revalidatePath('/admin/review-dimensions');
  return ok({ id: data.id });
}

/** 启用/停用。停用某一维度会让 AI 预审不再检查它，历史疑点仍按原标签保留。 */
export async function setReviewDimensionEnabled(id: string, enabled: boolean): Promise<DataResult<{ id: string }>> {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const schoolId = role.data.school_id;
  if (!schoolId) return fail('forbidden', '当前账号没有划归学校，无法维护本校的评价维度。');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('review_dimensions')
    .update({ enabled })
    .eq('id', id)
    .eq('school_id', schoolId)
    .select('id')
    .maybeSingle();
  if (error) return fail('error', `${enabled ? '启用' : '停用'}评价维度失败：${error.message}`);
  if (!data) return fail('error', `${enabled ? '启用' : '停用'}失败：这条维度不存在或不属于本校。`);

  revalidatePath('/admin/review-dimensions');
  return ok({ id: data.id });
}

/**
 * 上下调顺序。顺序决定提示词里维度的先后与页面展示次序，
 * 调序只改 sort_order，不改判定口径。
 */
export async function moveReviewDimension(id: string, direction: 'up' | 'down'): Promise<DataResult<{ id: string }>> {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const schoolId = role.data.school_id;
  if (!schoolId) return fail('forbidden', '当前账号没有划归学校，无法维护本校的评价维度。');

  const supabase = await createClient();
  const { data: rows, error: readError } = await supabase
    .from('review_dimensions')
    .select('id,sort_order')
    .eq('school_id', schoolId)
    .order('sort_order', { ascending: true });
  if (readError) return fail('error', `评价维度顺序读取失败：${readError.message}`);

  const own = (rows ?? []) as unknown as Array<{ id: string; sort_order: number | null }>;
  const index = own.findIndex((row) => row.id === id);
  if (index < 0) return fail('error', '这条维度不存在或不属于本校，顺序未改动。');

  // 合并后的完整次序要算上平台默认：平台行不可写，但顺序照样影响展示与提示词。
  const { data: platformRows } = await supabase
    .from('review_dimensions')
    .select('id,sort_order')
    .is('school_id', null)
    .order('sort_order', { ascending: true });
  const all = [
    ...((platformRows ?? []) as unknown as Array<{ id: string; sort_order: number | null }>),
    ...own,
  ].sort((left, right) => (left.sort_order ?? 100) - (right.sort_order ?? 100));

  const mergedIndex = all.findIndex((row) => row.id === id);
  const neighbor = direction === 'up' ? all[mergedIndex - 1] : all[mergedIndex + 1];
  if (!neighbor) return fail('error', `这条维度已经是${direction === 'up' ? '最前' : '最后'}一条，顺序未改动。`);

  const nextOrder = direction === 'up' ? (neighbor.sort_order ?? 100) - 1 : (neighbor.sort_order ?? 100) + 1;
  const { data, error } = await supabase
    .from('review_dimensions')
    .update({ sort_order: nextOrder })
    .eq('id', id)
    .eq('school_id', schoolId)
    .select('id')
    .maybeSingle();
  if (error) return fail('error', `评价维度顺序调整失败：${error.message}`);
  if (!data) return fail('error', '评价维度顺序调整失败：这条维度不存在或不属于本校。');

  revalidatePath('/admin/review-dimensions');
  return ok({ id: data.id });
}

/** 删除本校覆盖行。删掉之后该维度回落平台默认，而不是消失。 */
export async function deleteReviewDimension(id: string): Promise<DataResult<{ id: string }>> {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const schoolId = role.data.school_id;
  if (!schoolId) return fail('forbidden', '当前账号没有划归学校，无法维护本校的评价维度。');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('review_dimensions')
    .delete()
    .eq('id', id)
    .eq('school_id', schoolId)
    .select('id')
    .maybeSingle();
  if (error) return fail('error', `评价维度删除失败：${error.message}`);
  if (!data) return fail('error', '评价维度删除失败：这条维度不存在或不属于本校。');

  revalidatePath('/admin/review-dimensions');
  return ok({ id: data.id });
}
