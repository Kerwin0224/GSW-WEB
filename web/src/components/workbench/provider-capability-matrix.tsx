'use client';

import { useMemo, useState, useTransition } from 'react';
import { Brain, Layers3, Loader2, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { EmptyState } from '@/components/workbench/state-surfaces';
import {
  HealthCheckButton,
  FetchModelsButton,
  EditProviderDialog,
  DeleteProviderButton,
  HealthBadge,
  type ProviderListItem,
} from '@/components/workbench/provider-actions';
import { saveModelTierBinding, type AdminModelTierStatus } from '@/lib/data/admin';
import type { ModelTier } from '@/lib/supabase/database.types';

export const capabilities = [
  'student_chat',
  'teacher_chat',
  'bloom_classification',
  'project_classification',
  'practice_generation',
  'practice_evaluation',
  'audit_assist',
  'embedding',
] as const;

const CAPABILITY_LABELS: Record<string, string> = {
  student_chat: '学生对话',
  teacher_chat: '教师对话',
  bloom_classification: '布鲁姆分类',
  project_classification: '篇目识别',
  practice_generation: '挑战出题',
  practice_evaluation: '挑战评判',
  audit_assist: '核实辅助',
  embedding: '向量嵌入',
};

const SCENARIO_ROWS = [
  { role: 'Student /student', scenario: 'student_chat', tier: 'flash', impact: '快速问答反馈' },
  { role: 'Student /student', scenario: 'bloom_classification', tier: 'flash', impact: '高吞吐 Bloom 标注' },
  { role: 'Student /student/projects', scenario: 'project_classification', tier: 'flash', impact: '篇目与项目识别' },
  { role: 'Student /student/challenge', scenario: 'practice_generation', tier: 'flash', impact: '低成本练习生成' },
  { role: 'Teacher /teacher', scenario: 'teacher_chat', tier: 'advanced', impact: '教师高质量问答' },
  { role: 'Practice evaluation', scenario: 'practice_evaluation', tier: 'advanced', impact: '练习强判断评估' },
  { role: 'Teacher /teacher/audit', scenario: 'audit_assist', tier: 'advanced', impact: '教学正确性核实辅助' },
  { role: 'RAG /student/projects', scenario: 'embedding', tier: 'embedding', impact: '独立向量嵌入配置' },
] as const;

const TIER_COPY: Record<ModelTier, {
  title: string;
  subtitle: string;
  intent: string;
  tone: string;
  icon: React.ReactNode;
}> = {
  flash: {
    title: 'Flash Model',
    subtitle: '快速、低成本、高吞吐',
    intent: '面向学生即时对话、分类与练习生成，优先响应速度和单位成本。',
    tone: 'from-primary/15 via-background to-background',
    icon: <Zap className="size-5" />,
  },
  advanced: {
    title: 'Advanced Model',
    subtitle: '更强推理、更高质量',
    intent: '面向教师问答、练习评判与教学正确性核实辅助，优先复杂推理和输出质量。',
    tone: 'from-accent/25 via-background to-background',
    icon: <Brain className="size-5" />,
  },
};

type TierStatus = 'ready' | 'missing' | 'blocked' | 'unchecked';

type TierView = {
  tier: ModelTier;
  status: AdminModelTierStatus;
  provider: ProviderListItem | undefined;
  viewStatus: TierStatus;
  statusText: string;
  scenarios: readonly string[];
};

function getTierView(tier: ModelTier, providers: ProviderListItem[], modelTiers: Record<ModelTier, AdminModelTierStatus>): TierView {
  const status = modelTiers[tier];
  const provider = status.providerId ? providers.find((item) => item.id === status.providerId) : undefined;
  const scenarios = SCENARIO_ROWS.filter((row) => row.tier === tier).map((row) => row.scenario);

  if (status.ready) return { tier, status, provider, viewStatus: 'ready', statusText: '可用', scenarios };
  if (status.providerId || status.modelId || status.blockedReason) return { tier, status, provider, viewStatus: 'blocked', statusText: '已阻塞', scenarios };
  return { tier, status, provider, viewStatus: 'missing', statusText: '未配置', scenarios };
}

function statusBadgeVariant(status: TierStatus): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (status === 'ready') return 'default';
  if (status === 'blocked') return 'destructive';
  if (status === 'unchecked') return 'secondary';
  return 'outline';
}

function TierAssignmentDialog({ tierView, providers }: { tierView: TierView; providers: ProviderListItem[] }) {
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState(tierView.status.providerId ?? providers[0]?.id ?? '');
  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const [modelId, setModelId] = useState(tierView.status.modelId ?? selectedProvider?.apiModels[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();
  const copy = TIER_COPY[tierView.tier];

  function submit() {
    setError(null);
    if (!providerId) {
      setError('请选择 Provider');
      return;
    }
    if (!modelId.trim()) {
      setError('请选择或输入模型 ID');
      return;
    }
    startTransition(async () => {
      const result = await saveModelTierBinding({ tier: tierView.tier, providerId, modelId: modelId.trim() });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(`${copy.title} 已更新`);
      setOpen(false);
    });
  }

  return (
    <AdminDialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={<Button size="sm">{tierView.status.modelId ? '更换模型' : '选择模型'}</Button>}
      title={`配置 ${copy.title}`}
      description="选择一个已配置 Provider，并从已拉取模型中选择或手动输入真实模型 ID。"
      icon={copy.icon}
      className="max-w-xl"
      footer={(
        <Button onClick={submit} disabled={submitting || !providerId || !modelId.trim()} type="button">
          {submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />保存中…</> : '保存模型层'}
        </Button>
      )}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>影响场景</Label>
          <div className="flex flex-wrap gap-1.5">
            {tierView.scenarios.map((scenario) => (
              <Badge key={scenario} variant="secondary" className="gap-1">
                {CAPABILITY_LABELS[scenario]}
                <span className="font-mono text-[10px] opacity-70">{scenario}</span>
              </Badge>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`tier-provider-${tierView.tier}`}>Provider</Label>
          <Select
            value={providerId}
            onValueChange={(value) => {
              setProviderId(value ?? '');
              const nextProvider = providers.find((provider) => provider.id === value);
              setModelId(nextProvider?.apiModels[0]?.id ?? '');
            }}
          >
            <SelectTrigger id={`tier-provider-${tierView.tier}`}><SelectValue placeholder="选择 Provider" /></SelectTrigger>
            <SelectContent>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name} · {provider.healthStatus === 'healthy' ? '健康' : provider.healthStatus === 'unchecked' ? '未测速' : provider.healthStatus}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`tier-model-${tierView.tier}`}>模型 ID</Label>
          <Input
            id={`tier-model-${tierView.tier}`}
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            placeholder="输入或选择模型 ID（如 gpt-4o-mini）"
            list={`tier-model-list-${tierView.tier}`}
          />
          <datalist id={`tier-model-list-${tierView.tier}`}>
            {(selectedProvider?.apiModels ?? []).map((model) => <option key={model.id} value={model.id} />)}
          </datalist>
        </div>
        {selectedProvider && selectedProvider.apiModels.length === 0 ? (
          <Alert>
            <AlertDescription className="text-xs">
              当前 Provider 还没有拉取模型列表。可以在下方 Provider 操作表点击「拉取模型」，也可以先手动输入真实模型 ID。
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </AdminDialogShell>
  );
}

function ModelTierCard({ tierView, providers }: { tierView: TierView; providers: ProviderListItem[] }) {
  const copy = TIER_COPY[tierView.tier];
  return (
    <Card className={`overflow-hidden border shadow-sm bg-gradient-to-br ${copy.tone}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full border bg-background/80 p-2 text-primary">{copy.icon}</span>
              <div>
                <CardTitle className="text-2xl">{copy.title}</CardTitle>
                <CardDescription>{copy.subtitle}</CardDescription>
              </div>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">{copy.intent}</p>
          </div>
          <Badge variant={statusBadgeVariant(tierView.viewStatus)}>{tierView.statusText}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-background/70 p-3">
            <div className="text-xs text-muted-foreground">Provider</div>
            <div className="mt-1 font-medium">{tierView.provider?.name ?? tierView.status.providerName ?? '未选择'}</div>
            <div className="text-xs text-muted-foreground">{tierView.provider?.providerType ?? tierView.status.providerType ?? '需要先绑定 Provider'}</div>
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <div className="text-xs text-muted-foreground">Model</div>
            <div className="mt-1 truncate font-mono text-sm">{tierView.status.modelId ?? '未配置'}</div>
            <div className="text-xs text-muted-foreground">{tierView.provider?.apiModels.length ?? 0} 个已拉取模型</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tierView.provider ? <HealthBadge provider={tierView.provider} /> : <Badge variant="outline">无健康状态</Badge>}
          {tierView.provider?.secretLastFour ? <Badge variant="secondary">密钥 ••••{tierView.provider.secretLastFour}</Badge> : <Badge variant="outline">密钥未保存</Badge>}
        </div>
        {tierView.status.blockedReason ? (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{tierView.status.blockedReason}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">受影响场景</div>
          <div className="flex flex-wrap gap-1.5">
            {tierView.scenarios.map((scenario) => (
              <Badge key={scenario} variant="outline" className="gap-1">
                {CAPABILITY_LABELS[scenario]}
                <span className="font-mono text-[10px] opacity-70">{scenario}</span>
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t bg-background/50 px-6 py-4">
        <span className="text-xs text-muted-foreground">系统默认映射；场景不再单独绑定模型。</span>
        <TierAssignmentDialog tierView={tierView} providers={providers} />
      </CardFooter>
    </Card>
  );
}

function ScenarioMappingTable({ tierViews, embeddingReady }: { tierViews: Record<ModelTier, TierView>; embeddingReady: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>角色 / 页面</TableHead>
            <TableHead>场景</TableHead>
            <TableHead>路由层</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>影响</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SCENARIO_ROWS.map((row) => {
            const isEmbedding = row.tier === 'embedding';
            const view = isEmbedding ? undefined : tierViews[row.tier];
            const status = isEmbedding ? (embeddingReady ? '可用' : '需单独配置') : view?.statusText;
            return (
              <TableRow key={row.scenario}>
                <TableCell className="text-sm text-muted-foreground">{row.role}</TableCell>
                <TableCell>
                  <div className="font-medium">{CAPABILITY_LABELS[row.scenario]}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.scenario}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={row.tier === 'flash' ? 'default' : row.tier === 'advanced' ? 'secondary' : 'outline'}>
                    {row.tier === 'flash' ? 'Flash Model' : row.tier === 'advanced' ? 'Advanced Model' : 'Embedding'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={isEmbedding ? (embeddingReady ? 'default' : 'outline') : statusBadgeVariant(view?.viewStatus ?? 'missing')}>
                    {status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.impact}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ProviderOperationsTable({ providers, modelTiers }: { providers: ProviderListItem[]; modelTiers: Record<ModelTier, AdminModelTierStatus> }) {
  if (providers.length === 0) {
    return (
      <EmptyState
        title="尚未配置模型 Provider"
        description="先添加 Provider；然后测速、拉取模型，并在 Flash / Advanced 卡片中选择模型。"
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead>Base URL</TableHead>
            <TableHead>密钥</TableHead>
            <TableHead>健康</TableHead>
            <TableHead>模型</TableHead>
            <TableHead>用途</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => {
            const usedTiers = (['flash', 'advanced'] as ModelTier[]).filter((tier) => modelTiers[tier].providerId === provider.id && modelTiers[tier].modelId);
            const embeddingModels = provider.capabilities.filter((capability) => capability.capability === 'embedding');
            return (
              <TableRow key={provider.id}>
                <TableCell className="align-top font-medium">
                  <div>{provider.name}</div>
                  <div className="text-xs text-muted-foreground">{provider.providerType}</div>
                </TableCell>
                <TableCell className="max-w-[240px] truncate align-top font-mono text-xs">
                  {provider.baseUrl ?? '—'}
                </TableCell>
                <TableCell className="align-top">
                  {provider.secretLastFour ? `••••${provider.secretLastFour}` : '—'}
                </TableCell>
                <TableCell className="align-top">
                  <HealthBadge provider={provider} />
                </TableCell>
                <TableCell className="align-top">
                  {provider.apiModels.length === 0 ? <span className="text-xs text-muted-foreground">未拉取</span> : <Badge variant="secondary">{provider.apiModels.length} 个</Badge>}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex max-w-[280px] flex-wrap gap-1">
                    {usedTiers.map((tier) => (
                      <Badge key={tier} variant={tier === 'flash' ? 'default' : 'secondary'} title={modelTiers[tier].modelId}>
                        {tier === 'flash' ? 'Flash' : 'Advanced'}
                      </Badge>
                    ))}
                    {embeddingModels.map((capability) => (
                      <Badge key={`${capability.capability}-${capability.modelId}`} variant="outline" title={capability.modelId}>Embedding</Badge>
                    ))}
                    {usedTiers.length === 0 && embeddingModels.length === 0 ? <span className="text-xs text-muted-foreground">未被使用</span> : null}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex items-center justify-end gap-0.5">
                    <HealthCheckButton provider={provider} />
                    <FetchModelsButton provider={provider} />
                    <EditProviderDialog provider={provider} />
                    <DeleteProviderButton provider={provider} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function ProviderCapabilityMatrix({ providers, modelTiers }: { providers: ProviderListItem[]; modelTiers: Record<ModelTier, AdminModelTierStatus> }) {
  const tierViews = useMemo(() => ({
    flash: getTierView('flash', providers, modelTiers),
    advanced: getTierView('advanced', providers, modelTiers),
  }), [providers, modelTiers]);
  const embeddingReady = providers.some((provider) =>
    provider.isEnabled &&
    provider.capabilities.some((capability) => capability.capability === 'embedding' && capability.modelId.trim()) &&
    (provider.healthStatus === 'healthy' || provider.healthStatus === 'unchecked')
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-2">
        <ModelTierCard tierView={tierViews.flash} providers={providers} />
        <ModelTierCard tierView={tierViews.advanced} providers={providers} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Layers3 className="size-5" />场景路由映射</h2>
            <p className="text-sm text-muted-foreground">场景映射由系统定义；管理员只需维护两个模型层。Embedding 保持独立能力路径。</p>
          </div>
          <Badge variant={tierViews.flash.viewStatus === 'ready' && tierViews.advanced.viewStatus === 'ready' ? 'default' : 'destructive'}>
            <Sparkles className="mr-1 size-3" />模型路由状态
          </Badge>
        </div>
        <ScenarioMappingTable tierViews={tierViews} embeddingReady={embeddingReady} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Provider 运维视图</h2>
          <p className="text-sm text-muted-foreground">保留健康检查、拉取模型、编辑、删除；用途列展示哪些模型层正在使用该 Provider。</p>
        </div>
        <ProviderOperationsTable providers={providers} modelTiers={modelTiers} />
      </section>
    </div>
  );
}
