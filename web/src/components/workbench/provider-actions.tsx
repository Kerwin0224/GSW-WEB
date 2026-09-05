'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Activity, Download, SlidersHorizontal, Pencil, Trash2, CheckCircle2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AdminDialogShell, AdminDialogCancelButton } from '@/components/workbench/admin-dialog-shell';
import { ModelCombobox } from '@/components/workbench/model-combobox';
import { PROVIDER_PROTOCOLS, PROVIDER_PROTOCOL_LABELS, DEFAULT_BASE_URLS, toProviderProtocol, type ProviderProtocol } from '@/lib/provider-protocol';
import { toast } from 'sonner';
import {
  updateProviderConfig,
  updateProviderCapabilities,
  deleteProvider,
  type ProviderActionResult,
} from '@/lib/data/admin';

const EMBEDDING_CAPABILITY = 'embedding';

export type ProviderListItem = {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string | null;
  secretLastFour: string | null;
  secretCreatedAt: string | null;
  secretLastUsedAt: string | null;
  secretRotatedAt: string | null;
  isEnabled: boolean;
  healthStatus: string;
  lastHealthCheckAt: string | null;
  lastHealthLatencyMs: number | null;
  apiModels: Array<{ id: string; ownedBy?: string }>;
  capabilities: Array<{ capability: string; modelId: string }>;
};

/**
 * 独立的"测速"按钮 — 点击立即调用 health-check API。
 */
export function HealthCheckButton({ provider }: { provider: ProviderListItem }) {
  const [pending, startTransition] = useTransition();

  function ping() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/providers/health-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: provider.id }),
        });
        const data = await res.json();
        if (data.healthy) {
          toast.success(`✓ ${provider.name} 连接正常 · ${data.latencyMs}ms`);
        } else {
          toast.error(`✗ ${provider.name}：${data.message ?? data.error ?? '连接失败'}`);
        }
      } catch (error) {
        toast.error(`测速失败：${error instanceof Error ? error.message : '未知错误'}`);
      }
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={ping} disabled={pending} title="Provider 健康检查">
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />}
    </Button>
  );
}

/**
 * 独立的"拉取模型"按钮 — 点击立即调用 list-models API，成功后就地刷新页面数据，
 * 使能力配置对话框中的候选模型立即可见。
 */
export function FetchModelsButton({ provider }: { provider: ProviderListItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function fetchModels() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/providers/list-models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: provider.id }),
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.models)) {
          toast.success(`✓ ${provider.name}：发现 ${data.count} 个模型`);
          router.refresh();
        } else {
          toast.error(data.error ?? '拉取失败');
        }
      } catch (error) {
        toast.error(`拉取失败：${error instanceof Error ? error.message : '未知错误'}`);
      }
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={fetchModels} disabled={pending} title="拉取模型列表">
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
    </Button>
  );
}

/**
 * 配置能力 Dialog — 把 capability 与 modelId 关联起来。
 * 模型可从 api_models 选择，也可手动输入自定义。
 */
export function CapabilityAssignmentDialog({ provider }: { provider: ProviderListItem }) {
  const [open, setOpen] = useState(false);
  const [modelId, setModelId] = useState(provider.capabilities.find((capability) => capability.capability === EMBEDDING_CAPABILITY)?.modelId ?? '');
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!modelId.trim()) {
      setError('请填写 Embedding 模型 ID。');
      return;
    }
    startTransition(async () => {
      const result: ProviderActionResult = await updateProviderCapabilities(provider.id, [{ capability: EMBEDDING_CAPABILITY, modelId: modelId.trim() }]);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(result.message ?? 'Embedding 能力已保存');
      setOpen(false);
    });
  }

  return (
    <AdminDialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="icon-sm" title="配置 Embedding 能力">
          <SlidersHorizontal className="size-3.5" />
        </Button>
      }
      title={`配置 Embedding — ${provider.name}`}
      description="学生会话、教师问答、挑战和核实辅助由场景路由映射统一管理；这里仅配置向量嵌入模型，不提供学生会话内容浏览。"
      icon={<SlidersHorizontal className="size-5" />}
      footer={(
        <Button onClick={submit} disabled={submitting || !modelId.trim()} type="button">
          {submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />保存中…</> : '保存 Embedding 能力'}
        </Button>
      )}
    >
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-6 text-primary">
            Flash / Advanced 场景能力请在“AI 场景路由映射”中配置；Embedding 保持独立能力路径。
          </div>
          <div className="space-y-2">
            <Label htmlFor={`embedding-model-${provider.id}`}>Embedding 模型 ID</Label>
            {toProviderProtocol(provider.providerType) === 'anthropic' ? (
              <Alert>
                <AlertDescription className="text-xs">
                  Anthropic 协议不提供 Embedding API；请使用 OpenAI Compatible 协议的 Provider 配置向量嵌入。
                </AlertDescription>
              </Alert>
            ) : (
              <ModelCombobox
                id={`embedding-model-${provider.id}`}
                value={modelId}
                onValueChange={setModelId}
                models={provider.apiModels}
                placeholder="输入或选择 Embedding 模型 ID"
              />
            )}
          </div>

          {provider.apiModels.length === 0 ? (
            <Alert>
              <AlertDescription className="text-xs">
                当前还没有拉取到模型列表。可以点击列表行的“拉取模型”按钮自动获取，或直接手动输入模型 ID。
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
    </AdminDialogShell>
  );
}

/**
 * 编辑 Provider 基础信息 Dialog。
 */
export function EditProviderDialog({ provider }: { provider: ProviderListItem }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(provider.name);
  const [providerType, setProviderType] = useState<ProviderProtocol>(toProviderProtocol(provider.providerType));
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const patch: Parameters<typeof updateProviderConfig>[1] = {
        name,
        providerType,
        baseUrl,
      };
      if (apiKey.trim()) patch.apiKey = apiKey.trim();
      const result = await updateProviderConfig(provider.id, patch);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success('Provider 信息已更新');
      setOpen(false);
    });
  }

  return (
    <AdminDialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="icon-sm" title="编辑">
          <Pencil className="size-3.5" />
        </Button>
      }
      title={`编辑 — ${provider.name}`}
      description="更新模型服务的基础信息。API Key 留空会保留现有密钥。"
      icon={<Pencil className="size-5" />}
      className="max-w-lg"
      footer={(
        <Button onClick={submit} disabled={submitting} type="button">
          {submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />保存中…</> : '保存修改'}
        </Button>
      )}
    >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`edit-name-${provider.id}`}>名称</Label>
            <Input id={`edit-name-${provider.id}`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-type-${provider.id}`}>协议</Label>
            <Select
              value={providerType}
              items={PROVIDER_PROTOCOLS.map((protocol) => ({ value: protocol, label: PROVIDER_PROTOCOL_LABELS[protocol] }))}
              onValueChange={(v) => {
                const nextType = toProviderProtocol(v);
                setProviderType(nextType);
                // 切换协议时若 base_url 还是上一个协议的官方默认值，一并切换，减少手工修改。
                if (Object.values(DEFAULT_BASE_URLS).includes(baseUrl)) setBaseUrl(DEFAULT_BASE_URLS[nextType]);
              }}
            >
              <SelectTrigger id={`edit-type-${provider.id}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDER_PROTOCOLS.map((protocol) => (
                  <SelectItem key={protocol} value={protocol}>{PROVIDER_PROTOCOL_LABELS[protocol]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-baseurl-${provider.id}`}>Base URL</Label>
            <Input id={`edit-baseurl-${provider.id}`} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-apikey-${provider.id}`}>API Key</Label>
            <Input
              id={`edit-apikey-${provider.id}`}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider.secretLastFour ? `已保存（末四位 ${provider.secretLastFour}），留空保持不变` : '粘贴 API Key'}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              创建：{provider.secretCreatedAt ? new Date(provider.secretCreatedAt).toLocaleString('zh-CN') : '未知'} ·
              最近使用：{provider.secretLastUsedAt ? new Date(provider.secretLastUsedAt).toLocaleString('zh-CN') : '尚未使用'} ·
              最近轮换：{provider.secretRotatedAt ? new Date(provider.secretRotatedAt).toLocaleString('zh-CN') : '未知'}
            </p>
          </div>
          {error ? (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
    </AdminDialogShell>
  );
}

/**
 * 删除按钮（带二次确认）。
 */
export function DeleteProviderButton({ provider }: { provider: ProviderListItem }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteProvider(provider.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`已删除 ${provider.name}`);
      setOpen(false);
    });
  }

  return (
    <AdminDialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="icon-sm" disabled={pending} title="删除">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      }
      title={`删除 Provider「${provider.name}」`}
      description="此操作会移除 Provider 及关联能力配置，保存后无法在界面内恢复；不会删除教学导出批次或教师审阅元数据。"
      icon={<Trash2 className="size-5" />}
      className="max-w-md"
      footer={(
        <>
          <AdminDialogCancelButton onClick={() => setOpen(false)} />
          <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
            {pending ? <><Loader2 className="mr-2 size-4 animate-spin" />删除中…</> : '确认删除'}
          </Button>
        </>
      )}
    >
      <Alert variant="destructive">
        <XCircle className="size-4" />
        <AlertDescription>
          删除后会重新计算能力绑定；如果这是唯一绑定，学生提问、教师问答或挑战功能会显示不可用。
        </AlertDescription>
      </Alert>
    </AdminDialogShell>
  );
}

/**
 * 健康状态 + 时间戳的小标签。
 */
export function HealthBadge({ provider }: { provider: ProviderListItem }) {
  const status = provider.healthStatus;
  const lastAt = provider.lastHealthCheckAt;
  const latency = provider.lastHealthLatencyMs;

  let variant: 'default' | 'destructive' | 'secondary' = 'secondary';
  let icon: React.ReactNode = null;
  let label = '未测速';

  if (status === 'healthy') {
    variant = 'default';
    icon = <CheckCircle2 className="size-3" />;
    label = latency ? `健康 · ${latency}ms` : '健康';
  } else if (status === 'failed' || status === 'blocked') {
    variant = 'destructive';
    icon = <XCircle className="size-3" />;
    label = status === 'blocked' ? '不可用' : '失败';
  }

  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={variant} className="gap-1 w-fit">
        {icon}
        {label}
      </Badge>
      {lastAt ? (
        <span className="text-[10px] text-muted-foreground">{new Date(lastAt).toLocaleString('zh-CN')}</span>
      ) : null}
    </div>
  );
}
