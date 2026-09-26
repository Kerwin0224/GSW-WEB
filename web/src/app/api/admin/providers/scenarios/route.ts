import { requireAnyRole } from '@/lib/data/common';
import { listTeachingScenarios, readScenarioTierMap, DEFAULT_SCENARIO_TIER } from '@/lib/teaching-scenarios';
import { withApiLogging } from '@/lib/observability/with-api-logging';

/**
 * 能力矩阵的场景目录。场景行来自 teaching_scenarios 表而不是代码常量：
 * 加一种教学形态只需要往表里插一行，前端不必跟着改。
 */
export async function GET(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'provider_scenarios', route: '/api/admin/providers/scenarios' }, async () => {
    const role = await requireAnyRole(['admin', 'org_admin']);
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    const [scenarios, tiers] = await Promise.all([listTeachingScenarios(), readScenarioTierMap()]);
    return Response.json({
      scenarios,
      tiers: Object.fromEntries(tiers),
      defaultTier: DEFAULT_SCENARIO_TIER,
    });
  });
}
