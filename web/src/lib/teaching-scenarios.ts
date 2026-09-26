import 'server-only';

import { writeLogEvent } from '@/lib/observability/server-log-store';
import { createClient } from '@/lib/supabase/server';
import type { ModelTier } from '@/lib/supabase/database.types';

/**
 * 教学场景与模型能力是两个东西，此前共用一个枚举，于是「加一种教学形态」
 * 必须同时「发明一个模型能力」：PG enum / database.types.ts / 后台白名单 /
 * 能力矩阵 UI 四处要改，漏改任何一处症状都是静默的。
 *
 * 这里把场景从 teaching_scenarios 表读：加一种场景只需要插一行。
 * 模型能力（provider_capabilities.capability）继续留在枚举里——它稳定、只有少数几项，
 * 而且确实约束着 AI SDK 的调用形态。
 */

export type TeachingScenario = {
  key: string;
  displayName: string;
  description: string | null;
  sortOrder: number;
  enabled: boolean;
};

/**
 * 场景没有映射时的租户默认档位。真源是 scenario_tier_bindings；
 * 查不到就走这里，并且必须留一条日志——静默降级等于让教师不知道自己
 * 正在用便宜模型回答学生。
 */
export const DEFAULT_SCENARIO_TIER: ModelTier = 'flash';

type ScenarioRow = {
  key: string;
  display_name: string;
  description: string | null;
  sort_order: number;
  enabled: boolean;
};

function isModelTier(value: unknown): value is ModelTier {
  return value === 'flash' || value === 'advanced';
}

/** 场景目录。读不到时返回空数组并记日志，由调用方决定是空态还是错误页。 */
export async function listTeachingScenarios(options: { includeDisabled?: boolean } = {}): Promise<TeachingScenario[]> {
  try {
    const supabase = await createClient();
    const query = supabase
      .from('teaching_scenarios')
      .select('key,display_name,description,sort_order,enabled')
      .order('sort_order', { ascending: true });
    const { data, error } = options.includeDisabled ? await query : await query.eq('enabled', true);
    if (error) throw new Error(error.message);
    return ((data ?? []) as ScenarioRow[]).map((row) => ({
      key: row.key,
      displayName: row.display_name,
      description: row.description,
      sortOrder: row.sort_order,
      enabled: row.enabled,
    }));
  } catch (error) {
    await writeLogEvent({
      level: 'warn',
      area: 'data',
      event: 'teaching_scenario_list_failed',
      message: error instanceof Error ? error.message : 'teaching_scenarios 读取失败',
    });
    return [];
  }
}

/** scenario_key → tier，只含启用中的映射。 */
export async function readScenarioTierMap(): Promise<Map<string, ModelTier>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('scenario_tier_bindings')
    .select('scenario_key,tier')
    .eq('is_enabled', true);
  if (error) throw new Error(error.message);

  const tiers = new Map<string, ModelTier>();
  for (const row of (data ?? []) as { scenario_key: string | null; tier: string }[]) {
    if (row.scenario_key && isModelTier(row.tier)) tiers.set(row.scenario_key, row.tier);
  }
  return tiers;
}

/**
 * 一个场景该走哪一档路由层。
 *
 * 查不到映射时记一条 warn 再回落默认档位：不记日志的回落会让「这个场景根本没配」
 * 和「这个场景被路由到了便宜模型」在事后无法区分。
 */
export async function resolveScenarioTier(scenarioKey: string): Promise<ModelTier> {
  let tiers: Map<string, ModelTier>;
  try {
    tiers = await readScenarioTierMap();
  } catch (error) {
    await writeLogEvent({
      level: 'warn',
      area: 'data',
      event: 'scenario_tier_lookup_failed',
      message: error instanceof Error ? error.message : 'scenario_tier_bindings 读取失败',
      context: { scenario: scenarioKey, fallbackTier: DEFAULT_SCENARIO_TIER },
    });
    return DEFAULT_SCENARIO_TIER;
  }

  const tier = tiers.get(scenarioKey);
  if (tier) return tier;

  await writeLogEvent({
    level: 'warn',
    area: 'data',
    event: 'scenario_tier_unmapped',
    message: `教学场景「${scenarioKey}」没有配置路由映射，已按租户默认档位处理。`,
    context: { scenario: scenarioKey, fallbackTier: DEFAULT_SCENARIO_TIER },
  });
  return DEFAULT_SCENARIO_TIER;
}
