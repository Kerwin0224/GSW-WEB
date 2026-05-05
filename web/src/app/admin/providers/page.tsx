import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

  const { providers, modelTiers } = result.data;
  const flashStatus = modelTiers.flash.ready ? 'ready' : modelTiers.flash.blockedReason ? 'blocked' : 'missing';
  const advancedStatus = modelTiers.advanced.ready ? 'ready' : modelTiers.advanced.blockedReason ? 'blocked' : 'missing';

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="模型路由控制台"
        title="两个模型层，统一驱动全部 AI 场景"
        description="管理员只需要维护 Flash Model 与 Advanced Model；Provider 仍可独立创建、测速、拉取模型、编辑与删除。"
        metrics={[
          { label: 'Flash Model', value: flashStatus, hint: modelTiers.flash.blockedReason ?? '学生与快速任务' },
          { label: 'Advanced Model', value: advancedStatus, hint: modelTiers.advanced.blockedReason ?? '教师与评估审计' },
          { label: 'Provider', value: providers.length, hint: '已注册基础设施' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="模型层设置"
          description="先选择 Flash / Advanced 两个全局模型层；下方 Provider 表只负责运维动作与使用情况。"
          action={(
            <ProviderConfigDialog
              trigger={
                <Button>
                  <Plus className="mr-2 size-4" />添加 Provider
                </Button>
              }
            />
          )}
        />
        <ProviderCapabilityMatrix providers={providers} modelTiers={modelTiers} />
      </section>
    </div>
  );
}
