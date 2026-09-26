import { BLOOM_LEVEL_INFO, BLOOM_LEVELS } from './bloom-levels.ts';
import type { createClient } from '@/lib/supabase/server';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * 评价层级。
 *
 * 层级此前是「DB check 约束 + 代码常量」两处写死：改一套评价框架要重写约束、
 * 触发器和全前端。现在 rubric_levels 是真源（平台默认 L1..L6），
 * 学校与空间可以覆盖；bloom-levels.ts 退成平台默认常量与读表失败时的回落值。
 *
 * 两种「最高层级」算法语义不同，混用会得出相反的结论：
 *  · highestAchievedLevel —— 已通过集合的 max。跳层合法，这是数据的答案。
 *  · consecutiveAchievedLevel —— 从最低层起连续通过的前缀末尾。断层即停，
 *    只用于展示路线图：一个只通过 L3 与 L5 的学生，前缀是 0，max 是 5。
 */

export type RubricLevel = {
  levelKey: string;
  /** 与既有 1..6 整数列对齐，挑战记录的 target_bloom_level 直接用它。 */
  ordinal: number;
  name: string;
  /** 该层级的认知操作，不含学科内容。 */
  operation: string;
  hint: string | null;
  /** 是否要求前一层已通过：决定它在连续前缀里算不算断层。 */
  requiresPrevious: boolean;
  origin: 'platform' | 'school' | 'space';
};

const PLATFORM_RUBRIC_KEYS: Record<number, string> = { 1: 'L1', 2: 'L2', 3: 'L3', 4: 'L4', 5: 'L5', 6: 'L6' };

/** 读表失败或尚未配置时的回落值，与迁移里种下的平台默认 L1..L6 同名同序。 */
export const PLATFORM_RUBRIC_LEVELS: RubricLevel[] = BLOOM_LEVELS.map((level) => ({
  levelKey: PLATFORM_RUBRIC_KEYS[level],
  ordinal: level,
  name: BLOOM_LEVEL_INFO[level].name,
  operation: BLOOM_LEVEL_INFO[level].operation,
  hint: BLOOM_LEVEL_INFO[level].hint,
  requiresPrevious: level > 1,
  origin: 'platform',
}));

const LEVEL_COLUMNS = 'school_id,space_id,level_key,ordinal,name,operation,hint,requires_previous,enabled';

type LevelRow = {
  school_id: string | null;
  space_id: string | null;
  level_key: string;
  ordinal: number;
  name: string;
  operation: string;
  hint: string | null;
  requires_previous: boolean | null;
  enabled: boolean | null;
};

/** 空间级 > 学校级 > 平台默认，按 level_key 覆盖；学校只配了前三层时其余层仍用平台默认。 */
function mergeLevels(rows: LevelRow[]): RubricLevel[] {
  const rank = (row: LevelRow) => (row.space_id ? 2 : row.school_id ? 1 : 0);
  // 覆盖是「后写胜出」：平台默认先入，学校再压，空间最后压。
  const ordered = [...rows].sort((left, right) => rank(left) - rank(right));
  const merged = new Map<string, RubricLevel>();
  for (const row of ordered) {
    if (row.enabled === false) continue;
    merged.set(row.level_key, {
      levelKey: row.level_key,
      ordinal: row.ordinal,
      name: row.name,
      operation: row.operation,
      hint: row.hint,
      requiresPrevious: row.requires_previous ?? row.ordinal > 1,
      origin: row.space_id ? 'space' : row.school_id ? 'school' : 'platform',
    });
  }
  return [...merged.values()].sort((left, right) => left.ordinal - right.ordinal || left.levelKey.localeCompare(right.levelKey));
}

/**
 * 读生效层级：空间级 > 学校级 > 平台默认。读表失败回落平台默认，
 * 层级表不可用不该让挑战确认整条链路停摆。
 */
export async function getRubricLevels(supabase: SupabaseClient, spaceId?: string | null, schoolId?: string | null): Promise<RubricLevel[]> {
  const filters = ['school_id.is.null'];
  if (schoolId) filters.push(`school_id.eq.${schoolId}`);
  if (spaceId) filters.push(`space_id.eq.${spaceId}`);

  const { data, error } = await supabase
    .from('rubric_levels')
    .select(LEVEL_COLUMNS)
    .or(filters.join(','))
    .order('ordinal', { ascending: true });
  if (error) return PLATFORM_RUBRIC_LEVELS;

  const levels = mergeLevels((data ?? []) as unknown as LevelRow[]);
  return levels.length > 0 ? levels : PLATFORM_RUBRIC_LEVELS;
}

/** 已通过集合的最大层级：跳层合法（转学生、已有诊断结果的转入生都可能出现断层）。 */
export function highestAchievedLevel(achievedOrdinals: ReadonlySet<number>, levels: readonly RubricLevel[] = PLATFORM_RUBRIC_LEVELS): RubricLevel | undefined {
  return levels.reduce<RubricLevel | undefined>((best, level) => {
    if (!achievedOrdinals.has(level.ordinal)) return best;
    return !best || level.ordinal > best.ordinal ? level : best;
  }, undefined);
}

/** 从最低层起连续通过的前缀末尾，断层即停；requiresPrevious=false 的层不构成断层。 */
export function consecutiveAchievedLevel(achievedOrdinals: ReadonlySet<number>, levels: readonly RubricLevel[] = PLATFORM_RUBRIC_LEVELS): RubricLevel | undefined {
  let last: RubricLevel | undefined;
  for (const level of levels) {
    if (level.requiresPrevious && !achievedOrdinals.has(level.ordinal)) break;
    if (achievedOrdinals.has(level.ordinal)) last = level;
  }
  return last;
}
