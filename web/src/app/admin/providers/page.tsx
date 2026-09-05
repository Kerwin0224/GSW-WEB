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
        eyebrow="AI 运维 · Provider"
        title="Provider、模型层与场景路由"
        description="AI Native 后台在这里维护模型基础设施：Provider 健康、模型拉取、Flash / Advanced 路由层与 Embedding 能力独立配置。"
        metrics={[
          { label: 'Flash Model', value: flashStatus, hint: modelTiers.flash.blockedReason ?? '学习提问、篇目归属与快速分类' },
          { label: 'Advanced Model', value: advancedStatus, hint: modelTiers.advanced.blockedReason ?? '教师问答、挑战确认与核实辅助' },
          { label: 'Provider', value: providers.length, hint: 'AI 运维基础设施' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="模型层与 Provider 运维"
          description="先选择 Flash / Advanced 两个全局模型层；下方 Provider 表只负责健康检查、模型拉取、密钥状态与使用情况。"
          action={(
            <ProviderConfigDialog />
          )}
        />
        <ProviderCapabilityMatrix providers={providers} modelTiers={modelTiers} scenarioTierBindings={scenarioTierBindings} />
      </section>
    </div>
  );
}
