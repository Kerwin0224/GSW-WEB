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
  const flashStatus = modelTiers.flash.ready ? 'ready' : modelTiers.flash.blockedReason ? 'blocked' : 'missing';
  const advancedStatus = modelTiers.advanced.ready ? 'ready' : modelTiers.advanced.blockedReason ? 'blocked' : 'missing';

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="模型接入"
        title="模型、能力分层与场景绑定"
        description="在这里维护 AI 模型服务：检查连通性、拉取模型列表，并为 Flash / Advanced 两层模型和 Embedding 分别配置。"
        metrics={[
          { label: '快速模型 (Flash)', value: flashStatus, hint: modelTiers.flash.blockedReason ?? '学习提问、篇目归档与快速分类' },
          { label: '深度模型 (Advanced)', value: advancedStatus, hint: modelTiers.advanced.blockedReason ?? '教师问答、挑战与核实辅助' },
          { label: '模型服务', value: providers.length, hint: '已配置的服务数量' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="模型层与服务状态"
          description="先给 Flash / Advanced 两个模型层选好模型；下面的服务列表负责健康检查、拉取模型和密钥状态。"
          action={(
            <ProviderConfigDialog />
          )}
        />
        <ProviderCapabilityMatrix providers={providers} modelTiers={modelTiers} scenarioTierBindings={scenarioTierBindings} />
      </section>
    </div>
  );
}
