import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { McpServerList, type ServerRow } from '@/components/workbench/mcp-server-list';
import { McpServerDialog } from '@/components/workbench/mcp-server-dialog';
import { ProviderCapabilityMatrix } from '@/components/workbench/provider-capability-matrix';
import { ProviderConfigDialog } from '@/components/workbench/provider-config-dialog';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getAdminMcp, getAdminProviders } from '@/lib/data/admin';
import { requireProfile } from '@/lib/auth';

/**
 * 公司级平台配置（org_admin）。
 *
 * 为什么单独一个页面：公司级模板（`school_id IS NULL`）是全校共用的兜底——
 * 学校没自带 Provider 或 MCP 时就用它。它属于**公司**，不属于任何一所学校，
 * 所以归 org_admin 管，而不是某个学校的管理员。
 *
 * 此前没有这个入口：/admin 的布局只放行 admin 角色，org_admin 被 redirect 掉，
 * 于是「公司级模板」在界面上谁都建不了——RLS 放行了也没用。这里补上。
 *
 * 复用 /admin 的两个组件：同一份能力矩阵、同一份 MCP 列表，因为看到的是同一批数据
 * （RLS 按 can_read_school_scope 决定 org_admin 能看到本公司各校 + 公司级）。
 */
export default async function OrgPlatformPage() {
  await requireProfile('org_admin');

  const [providersResult, mcpResult] = await Promise.all([getAdminProviders(), getAdminMcp()]);
  if (!providersResult.ok) {
    return <div className="p-6"><ErrorState title="模型供应商加载失败" description={providersResult.message} /></div>;
  }

  const { providers, modelTiers, scenarioTierBindings } = providersResult.data;
  const servers = (mcpResult.ok ? mcpResult.data : []) as ServerRow[];
  const companyProviders = providers.filter((provider) => provider.schoolId === null).length;
  const companyServers = servers.filter((server) => (server as ServerRow & { school_id?: string | null }).school_id == null).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="公司管理 / 平台配置"
        title="模型与工具"
        description="公司级模板是全校共用的兜底：学校没自带模型网关或 MCP 时用它。学校自带的那份由各校管理员在自家后台维护。"
        metrics={[
          { label: '模型供应商', value: providers.length, hint: `其中公司级模板 ${companyProviders} 个` },
          { label: 'MCP Server', value: servers.length, hint: `其中公司级模板 ${companyServers} 个` },
          { label: '已配模型层', value: `${[modelTiers.flash, modelTiers.advanced].filter((tier) => tier.providerId && tier.modelId).length}/2`, hint: 'Flash / Advanced' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="模型层与供应商"
          description="场景路由（哪个场景走 Flash、哪个走 Advanced）是公司级资产；学校自带 Provider 后只需把模型层绑到它，映射不用改。"
          action={<ProviderConfigDialog />}
        />
        <ProviderCapabilityMatrix providers={providers} modelTiers={modelTiers} scenarioTierBindings={scenarioTierBindings} canEditScenarioRouting />
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="MCP Server"
          description="学校自带 MCP 时只用本校那一套（整体替换，不是叠加）——这样学校能屏蔽掉不适合本校的工具。"
          action={<McpServerDialog />}
        />
        <Card>
          <CardContent className="pt-6">
            <McpServerList servers={servers} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
