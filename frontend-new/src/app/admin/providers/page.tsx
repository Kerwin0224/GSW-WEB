import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { ProviderCapabilityMatrix, capabilities } from '@/components/workbench/provider-capability-matrix';
import { getAdminProviders, saveProviderConfig } from '@/lib/data/admin';

export default async function AdminProvidersPage() {
  const result = await getAdminProviders();
  if (!result.ok) return <div className="p-6"><ErrorState title="Provider 能力加载失败" description={result.message} /></div>;
  const providers = (result.data as Array<{ name: string; secret_last_four: string | null; provider_capabilities?: Array<{ model_id: string; capability: string; is_enabled: boolean }> }>).map((provider) => ({ name: provider.name, model: provider.provider_capabilities?.[0]?.model_id ?? '未配置模型', maskedKey: provider.secret_last_four ? `••••${provider.secret_last_four}` : '未保存服务端密钥', enabled: Object.fromEntries((provider.provider_capabilities ?? []).map((cap) => [cap.capability, cap.is_enabled])) }));
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="font-heading text-3xl">模型 Provider</h1><p className="mt-1 text-sm text-muted-foreground">按能力配置真实模型；密钥保存后只显示掩码，不在浏览器展示完整值。</p></div><Dialog><DialogTrigger render={<Button><Plus className="mr-2 size-4" />添加 Provider</Button>} /><DialogContent><form action={saveProviderConfig}><DialogHeader><DialogTitle>添加 Provider</DialogTitle><DialogDescription>本地只记录密钥掩码与服务端 secret_ref；生产密钥应放入服务端环境或 Supabase Vault。</DialogDescription></DialogHeader><div className="space-y-4 py-4"><div className="space-y-2"><Label htmlFor="name">名称</Label><Input id="name" name="name" placeholder="OpenAI / DeepSeek / 自建网关" /></div><div className="space-y-2"><Label htmlFor="provider_type">类型</Label><Input id="provider_type" name="provider_type" placeholder="openai-compatible" /></div><div className="space-y-2"><Label htmlFor="base_url">Base URL</Label><Input id="base_url" name="base_url" placeholder="https://api.example.com/v1" /></div><div className="space-y-2"><Label htmlFor="api_key">API Key replacement</Label><Input id="api_key" name="api_key" type="password" placeholder="保存后仅显示末四位" /></div><div className="space-y-2"><Label htmlFor="model_id">模型</Label><Input id="model_id" name="model_id" placeholder="gpt-4o" /></div><div className="grid gap-2 sm:grid-cols-2">{capabilities.map((capability) => <label key={capability} className="flex items-center gap-2 text-sm"><Checkbox name={capability} />{capability}</label>)}</div></div><DialogFooter><Button type="submit">保存配置</Button></DialogFooter></form></DialogContent></Dialog></div><ProviderCapabilityMatrix providers={providers} /></div>;
}
