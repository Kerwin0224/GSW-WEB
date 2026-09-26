import { z } from 'zod';

import type { createClient } from '@/lib/supabase/server';
import type { PreReviewSeverity } from '@/lib/teacher-pre-review';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * AI 预审的评价维度。
 *
 * 此前「AI 该看什么」是提示词里写死的一句自然语言 bullet，
 * 疑点标签是模型自由文本：同一个错误在不同会话被叫作三种名字，
 * 「本班最常见的 3 类问题」按字符串聚合永远统计不出来。
 * 现在维度进表（review_dimensions），提示词从表渲染，疑点落稳定 label_key。
 *
 * 三条不可退让的规则：
 *  1. 平台默认（school_id IS NULL）全平台一份，学校行是**覆盖**不是追加；
 *  2. 读表失败只降级为「没有维度 + 自由标签」，绝不连累整次 AI 预审；
 *  3. 提示词片段与 zod 枚举必须来自同一份维度，否则模型输出会被自己的 schema 判非法。
 */

export type PreReviewDimension = {
  /** 稳定键，落进预审结果并跨会话聚合；显示名会改，这个不改。 */
  labelKey: string;
  displayName: string;
  /** 租户写下的判定说明（管理端口径）。 */
  criteria: string;
  /** 给模型看的判定说明；为空时退回 criteria。 */
  promptFragment: string;
  defaultSeverity: PreReviewSeverity;
  sortOrder: number;
  origin: 'platform' | 'school';
};

/** 合并的输入：带 enabled，因为「本校停用」本身就是一种覆盖（把平台那条挤掉）。 */
export type ReviewDimensionSource = PreReviewDimension & { enabled: boolean };

export type ReviewDimensionLoad = {
  dimensions: PreReviewDimension[];
  /** 读表失败：提示词不带维度、标签退回自由文本，AI 预审仍然照常发起。 */
  degraded: boolean;
};

const DIMENSION_COLUMNS = 'school_id,label_key,display_name,criteria,default_severity,prompt_fragment,sort_order,enabled';

type DimensionRow = {
  school_id: string | null;
  label_key: string;
  display_name: string;
  criteria: string | null;
  default_severity: string | null;
  prompt_fragment: string | null;
  sort_order: number | null;
  enabled: boolean | null;
};

function toSeverity(value: string | null): PreReviewSeverity {
  return value === 'low' || value === 'high' ? value : 'medium';
}

/**
 * 合成生效维度：平台默认先入，本校行按稳定键覆盖。
 * 同键的本校行 enabled=false 表示这一维度在本校停用（挤掉平台行，不是追加一条）。
 * 排序按 sort_order，同序按稳定键，保证提示词与界面每次渲染顺序一致。
 */
export function mergeReviewDimensions<T extends ReviewDimensionSource>(rows: readonly T[]): T[] {
  const merged = new Map<string, T>();
  const apply = (row: T) => {
    if (row.enabled) merged.set(row.labelKey, row);
    else merged.delete(row.labelKey);
  };

  for (const row of rows.filter((candidate) => candidate.origin === 'platform').sort((left, right) => left.sortOrder - right.sortOrder)) apply(row);
  for (const row of rows.filter((candidate) => candidate.origin === 'school')) apply(row);

  return [...merged.values()].sort((left, right) => left.sortOrder - right.sortOrder || left.labelKey.localeCompare(right.labelKey));
}

/**
 * 读本租户生效的维度：平台默认 + 本校覆盖，合成一份。
 * 读表失败返回空维度并标 degraded —— 提示词退回「模型自由判断 + 自由标签」，
 * 教师照样能发起 AI 预审，比整次预审直接失败可用。
 */
export async function loadReviewDimensions(supabase: SupabaseClient, schoolId: string | null | undefined): Promise<ReviewDimensionLoad> {
  const filter = schoolId ? `school_id.is.null,school_id.eq.${schoolId}` : 'school_id.is.null';
  const { data, error } = await supabase
    .from('review_dimensions')
    .select(DIMENSION_COLUMNS)
    .or(filter)
    .order('sort_order', { ascending: true });
  if (error) return { dimensions: [], degraded: true };

  const rows = ((data ?? []) as unknown as DimensionRow[]).map((row) => ({
    labelKey: row.label_key,
    displayName: row.display_name,
    criteria: row.criteria?.trim() ?? '',
    promptFragment: row.prompt_fragment?.trim() ?? '',
    defaultSeverity: toSeverity(row.default_severity),
    sortOrder: row.sort_order ?? 100,
    enabled: row.enabled !== false,
    origin: (row.school_id === null ? 'platform' : 'school') as 'platform' | 'school',
  }));
  return { dimensions: mergeReviewDimensions(rows), degraded: false };
}

/** 渲染成提示词片段；没有维度时返回空串，调用方据此判断要不要保留自己的兜底 bullet。 */
export function renderDimensionsPromptFragment(dimensions: readonly PreReviewDimension[]): string {
  if (dimensions.length === 0) return '';
  const lines = dimensions.map((dimension) => {
    const description = dimension.promptFragment || dimension.criteria || '由教师自行判断。';
    return `- ${dimension.labelKey}（${dimension.displayName}）：${description}`;
  });
  return [
    'AI 预审的评价维度（label 只能逐字取下面这些稳定键，不要自造说法）：',
    ...lines,
  ].join('\n');
}

/**
 * 疑点标签的 schema：有维度时用 z.enum 把模型钉在稳定键上，
 * 没维度时退回 z.string() —— 读不到表不该让整次结构化输出失败。
 */
export function buildIssueLabelSchema(dimensions: readonly PreReviewDimension[]): z.ZodType<string> {
  const keys = dimensions.map((dimension) => dimension.labelKey);
  if (keys.length === 0) return z.string();
  return z.enum(keys as [string, ...string[]]);
}

/**
 * 把模型自由文本或历史记录里的旧标签归到当前维度键上。
 * 认不出来就返回 null：宁可没有键，也不要把疑点错归到不相干的维度上。
 */
export function matchDimensionKey(label: string, dimensions: readonly PreReviewDimension[]): string | null {
  const needle = label.trim().toLocaleLowerCase();
  if (!needle) return null;
  for (const dimension of dimensions) {
    if (dimension.labelKey.toLocaleLowerCase() === needle) return dimension.labelKey;
    if (dimension.displayName.trim().toLocaleLowerCase() === needle) return dimension.labelKey;
  }
  return null;
}
