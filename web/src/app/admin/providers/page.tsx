import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProviderCapabilityMatrix, capabilities } from '@/components/workbench/provider-capability-matrix';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getAdminProviders, saveProviderConfig } from '@/lib/data/admin';

export default async function AdminProvidersPage() {
  const result = await getAdminProviders();
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="Provider 能力加载失败" description={result.message} />
      </div>
    );
  }

  const providers = (result.data as Array<{
    name: string;
    secret_last_four: string | null;
    provider_capabilities?: Array<{ model_id: string; capability: string; is_enabled: boolean }>;
  }>).map((provider) => ({
    name: provider.name,
    model: provider.provider_capabilities?.[0]?.model_id ?? '未配置模型',
    maskedKey: provider.secret_last_four ? `••••${provider.secret_last_four}` : '未保存服务端密钥',
    enabled: Object.fromEntries((provider.provider_capabilities ?? []).map((capability) => [capability.capability, capability.is_enabled])),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="模型 Provider"
        title="AI 能力必须明确配置，不能偷偷兜底。"
        description="Supabase 只保存 secret_ref、末四位和能力矩阵；真实密钥只存在服务端环境。缺能力就阻塞学生和教师端。"
        metrics={[
          { label: 'Provider', value: providers.length, hint: '真实配置数量' },
          { label: '能力项', value: capabilities.length, hint: 'student / teacher / classify / practice' },
          { label: '密钥', value: 'masked', hint: '只显示引用与末四位' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="能力矩阵"
          description="按能力配置真实模型，不允许浏览器读取 Provider 密钥。"
          action={(
            <Dialog>
              <DialogTrigger render={<Button><Plus className="mr-2 size-4" />添加 Provider</Button>} />
              <DialogContent>
                <form action={saveProviderConfig}>
                  <DialogHeader>
                    <DialogTitle>添加 Provider</DialogTitle>
                    <DialogDescription>不要粘贴完整 API Key。先把密钥放入服务端 env，再登记 env:KEY_NAME。</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label htmlFor="name">名称</Label><Input id="name" name="name" placeholder="学校 AI 网关" /></div>
                    <div className="space-y-2"><Label htmlFor="provider_type">类型</Label><Input id="provider_type" name="provider_type" placeholder="openai / gateway / openai-compatible" /></div>
                    <div className="space-y-2"><Label htmlFor="base_url">Base URL</Label><Input id="base_url" name="base_url" placeholder="服务端可访问 URL" /></div>
                    <div className="space-y-2"><Label htmlFor="secret_ref">Secret Ref</Label><Input id="secret_ref" name="secret_ref" placeholder="env:OPENAI_API_KEY" /></div>
                    <div className="space-y-2"><Label htmlFor="secret_last_four">密钥末四位</Label><Input id="secret_last_four" name="secret_last_four" placeholder="1234" maxLength={12} /></div>
                    <div className="space-y-2"><Label htmlFor="model_id">模型 ID</Label><Input id="model_id" name="model_id" placeholder="真实模型 ID" /></div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {capabilities.map((capability) => (
                        <label key={capability} className="flex items-center gap-2 text-sm">
                          <Checkbox name={capability} />{capability}
                        </label>
                      ))}
                    </div>
                  </div>
                  <DialogFooter><Button type="submit">保存配置</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        />
        <ProviderCapabilityMatrix providers={providers} />
      </section>
    </div>
  );
}
