import { ProviderCapabilityMatrix } from '@/components/workbench/provider-capability-matrix';
import { ProviderConfigDialog } from '@/components/workbench/provider-config-dialog';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getAdminProviders } from '@/lib/data/admin';

export default async function AdminProvidersPage() {
  const result = await getAdminProviders();
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="Provider 能力加载失败" description={result.message} />
      </div>
    );
  }

  const { providers, modelTiers, scenarioTierBindings } = result.data;
  const checkedProviders = providers.filter((provider) => provider.lastHealthCheckAt).length;
  const configuredTiers = [modelTiers.flash, modelTiers.advanced].filter((tier) => tier.providerId && tier.modelId).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="模型供应商"
        description="添加模型服务、检查连通性，并为 Flash、Advanced 和 Embedding 配置明确的模型 ID。"
        metrics={[
          { label: '模型供应商', value: providers.length, hint: '已保存的服务配置' },
          { label: '已检查连接', value: checkedProviders, hint: '有最近检查记录' },
          { label: '已配置模型层', value: `${configuredTiers}/2`, hint: 'Flash / Advanced' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="模型层与供应商状态"
          description="模型层显示路由配置，供应商列表显示密钥、模型列表和最近一次连接检查。"
          action={(
            <ProviderConfigDialog />
          )}
        />
        <ProviderCapabilityMatrix providers={providers} modelTiers={modelTiers} scenarioTierBindings={scenarioTierBindings} />
      </section>
    </div>
  );
}
