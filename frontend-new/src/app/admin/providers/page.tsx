'use client';

import type React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BlockedState, ErrorState, LoadingSurface, PermissionState, SuccessState } from '@/components/workbench/state-surfaces';
import { ProviderCapabilityMatrix } from '@/components/workbench/provider-capability-matrix';

export default function AdminProvidersPage() {
  const providers: React.ComponentProps<typeof ProviderCapabilityMatrix>['providers'] = [];
  const loading = false;
  const error: string | null = null;
  const permissionDenied = false;
  const validationBlocked = false;
  const providerCommitted = false;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="font-heading text-3xl">模型 Provider</h1><p className="mt-1 text-sm text-muted-foreground">按能力配置真实模型；密钥保存后只显示掩码，不在浏览器展示完整值。</p></div><Dialog><DialogTrigger render={<Button><Plus className="mr-2 size-4" />添加 Provider</Button>} /><DialogContent><DialogHeader><DialogTitle>添加 Provider</DialogTitle><DialogDescription>不会创建 demo provider；请填写真实服务端配置。</DialogDescription></DialogHeader><div className="space-y-4 py-4"><div className="space-y-2"><Label>名称</Label><Input placeholder="OpenAI / DeepSeek / 自建网关" /></div><div className="space-y-2"><Label>类型</Label><Select><SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger><SelectContent><SelectItem value="openai-compatible">OpenAI compatible</SelectItem><SelectItem value="local">本地</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Base URL</Label><Input placeholder="https://api.example.com/v1" /></div><div className="space-y-2"><Label>API Key replacement</Label><Input type="password" placeholder="保存后仅显示 sk-••••1234" /></div><div className="space-y-2"><Label>模型列表</Label><Input placeholder="model-a, model-b" /></div></div><DialogFooter><Button variant="outline">取消</Button><Button>保存配置</Button></DialogFooter></DialogContent></Dialog></div>
      {loading ? <LoadingSurface label="正在加载 Provider 能力" /> : null}
      {permissionDenied ? <PermissionState title="无权配置模型 Provider" description="当前账号缺少管理员角色。" /> : null}
      {validationBlocked ? <BlockedState title="Provider 校验未通过" description="Base URL、密钥或模型能力未通过健康检查时，不会标记为可用。" /> : null}
      {providerCommitted ? <SuccessState title="Provider 配置已保存" description="保存后仅显示掩码密钥，依赖能力会解除阻塞。" /> : null}
      {error ? <ErrorState title="Provider 能力加载失败" description={error} /> : null}
      <ProviderCapabilityMatrix providers={providers} />
    </div>
  );
}
