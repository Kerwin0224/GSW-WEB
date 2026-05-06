'use client';

import { useState, useTransition } from 'react';
import { Loader2, Activity, Download, SlidersHorizontal, Pencil, Trash2, CheckCircle2, XCircle, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AdminDialogShell, AdminDialogCancelButton } from '@/components/workbench/admin-dialog-shell';
import { toast } from 'sonner';
import {
  updateProviderConfig,
  updateProviderCapabilities,
  deleteProvider,
  type ProviderActionResult,
} from '@/lib/data/admin';

const CAPABILITY_LABELS: Record<string, string> = {
  student_chat: '学生会话回答',
  teacher_chat: '教师问答',
  bloom_classification: '布鲁姆分类',
  project_classification: '篇目识别',
  practice_generation: '挑战出题',
  practice_evaluation: '挑战确认评估',
  audit_assist: '核实辅助',
  embedding: '向量嵌入',
};

const ALL_CAPABILITIES = Object.keys(CAPABILITY_LABELS);

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
    <Button variant="ghost" size="icon-sm" onClick={ping} disabled={pending} title="测速 / 健康检查">
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />}
    </Button>
  );
}

/**
 * 独立的"拉取模型"按钮 — 点击立即调用 list-models API。
 */
export function FetchModelsButton({ provider }: { provider: ProviderListItem }) {
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
  const [rows, setRows] = useState(
    provider.capabilities.length > 0
      ? provider.capabilities
      : [{ capability: 'student_chat', modelId: '' }]
  );
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function addRow() {
    const used = new Set(rows.map((r) => r.capability));
    const next = ALL_CAPABILITIES.find((c) => !used.has(c));
    if (next) setRows([...rows, { capability: next, modelId: '' }]);
  }

  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, key: 'capability' | 'modelId', value: string) {
    setRows(rows.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  }

  function submit() {
    setError(null);
    const valid = rows.filter((r) => r.capability && r.modelId.trim());
    if (valid.length === 0) {
      setError('请至少为一个能力分配模型');
      return;
    }
    startTransition(async () => {
      const result: ProviderActionResult = await updateProviderCapabilities(provider.id, valid);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success('能力配置已保存');
      setOpen(false);
    });
  }

  return (
    <AdminDialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="icon-sm" title="配置能力 → 模型映射">
          <SlidersHorizontal className="size-3.5" />
        </Button>
      }
      title={`配置能力 — ${provider.name}`}
      description={`为每个系统能力分配模型 ID。可从已拉取的 ${provider.apiModels.length} 个模型中选择，也可手动输入。`}
      icon={<SlidersHorizontal className="size-5" />}
      footer={(
        <Button onClick={submit} disabled={submitting} type="button">
          {submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />保存中…</> : '保存能力配置'}
        </Button>
      )}
    >
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <Select value={row.capability} onValueChange={(v) => updateRow(idx, 'capability', v ?? '')}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_CAPABILITIES.map((c) => (
                    <SelectItem key={c} value={c}>{CAPABILITY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex-1">
                <Input
                  value={row.modelId}
                  onChange={(e) => updateRow(idx, 'modelId', e.target.value)}
                  placeholder="输入或选择模型 ID（如 gpt-4o-mini）"
                  list={`models-list-${provider.id}-${idx}`}
                />
                <datalist id={`models-list-${provider.id}-${idx}`}>
                  {provider.apiModels.map((m) => <option key={m.id} value={m.id} />)}
                </datalist>
              </div>
              <Button variant="ghost" size="icon" type="button" onClick={() => removeRow(idx)} disabled={rows.length === 1}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" type="button" onClick={addRow} disabled={rows.length >= ALL_CAPABILITIES.length}>
            <Plus className="mr-1 size-4" />添加能力
          </Button>
        </div>

        {provider.apiModels.length === 0 ? (
          <Alert>
            <AlertDescription className="text-xs">
              提示：当前还没有拉取到模型列表。可以点击列表行的「拉取模型」按钮自动获取，或直接在上方手动输入模型 ID。
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <XCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

    </AdminDialogShell>
  );
}

/**
 * 编辑 Provider 基础信息 Dialog。
 */
export function EditProviderDialog({ provider }: { provider: ProviderListItem }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(provider.name);
  const [providerType, setProviderType] = useState(provider.providerType);
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
      description="更新 Provider 基础信息。API Key 留空会保留现有密钥。"
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
            <Label htmlFor={`edit-type-${provider.id}`}>类型</Label>
            <Select value={providerType} onValueChange={(v) => setProviderType(v ?? 'openai-compatible')}>
              <SelectTrigger id={`edit-type-${provider.id}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cloud">Cloud</SelectItem>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="proxy">Proxy</SelectItem>
                <SelectItem value="openai-compatible">OpenAI Compatible</SelectItem>
                <SelectItem value="openai">OpenAI 官方</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="ollama">Ollama</SelectItem>
                <SelectItem value="azure">Azure</SelectItem>
                <SelectItem value="gateway">Gateway</SelectItem>
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
      description="此操作会移除 Provider 及关联能力配置，保存后无法在界面内恢复。"
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
          下游能力链路会在删除后重新计算；如果这是唯一绑定，学生或教师功能会显示断链。
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
    label = status === 'blocked' ? '已阻塞' : '失败';
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
