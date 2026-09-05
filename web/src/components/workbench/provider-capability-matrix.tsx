'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, Layers3, Loader2, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { EmptyState } from '@/components/workbench/state-surfaces';
import {
  CapabilityAssignmentDialog,
  HealthCheckButton,
  FetchModelsButton,
  EditProviderDialog,
  DeleteProviderButton,
  HealthBadge,
  type ProviderListItem,
} from '@/components/workbench/provider-actions';
import { saveModelTierBinding, saveScenarioTierBindings, type AdminModelTierStatus, type AdminScenarioTierBinding } from '@/lib/data/admin';
import { ModelCombobox } from '@/components/workbench/model-combobox';
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
  student_chat: '学生会话回答',
  teacher_chat: '教师问答',
  bloom_classification: '学生问题布鲁姆路径判断',
  project_classification: '篇目识别',
  practice_generation: '挑战出题',
  practice_evaluation: '挑战确认评估',
  audit_assist: '核实辅助',
  embedding: '向量嵌入',
};

const SCENARIO_ROWS = [
  { role: '学生 /student', scenario: 'student_chat', defaultTier: 'flash', impact: '学习提问的即时会话回答' },
  { role: '学生 /student', scenario: 'bloom_classification', defaultTier: 'flash', impact: '学生问题的布鲁姆认知路径最高层判断' },
  { role: '学生 /student', scenario: 'project_classification', defaultTier: 'flash', impact: '首问篇目识别与项目归属' },
  { role: '学生 /student/challenge', scenario: 'practice_generation', defaultTier: 'flash', impact: '低成本挑战生成' },
  { role: '教师 /teacher', scenario: 'teacher_chat', defaultTier: 'advanced', impact: '教师问答高质量回答' },
  { role: '挑战确认', scenario: 'practice_evaluation', defaultTier: 'advanced', impact: '挑战确认强判断评估' },
  { role: '教师 /teacher/audit', scenario: 'audit_assist', defaultTier: 'advanced', impact: '教学正确性核实辅助' },
] as const satisfies ReadonlyArray<{ role: string; scenario: AdminScenarioTierBinding['scenario']; defaultTier: ModelTier; impact: string }>;

const EMBEDDING_ROW = { role: 'RAG /student', scenario: 'embedding', impact: '项目检索的独立向量嵌入配置' } as const;


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
    intent: '面向学习提问、学生问题布鲁姆认知路径判断、篇目归属与挑战生成，优先响应速度和单位成本。',
    tone: 'from-primary/15 via-background to-background',
    icon: <Zap className="size-5" />,
  },
  advanced: {
    title: 'Advanced Model',
    subtitle: '更强推理、更高质量',
    intent: '面向教师问答、挑战确认评估与教学正确性核实辅助，优先复杂推理和输出质量。',
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

function getTierView(tier: ModelTier, providers: ProviderListItem[], modelTiers: Record<ModelTier, AdminModelTierStatus>, scenarioTierBindings: AdminScenarioTierBinding[]): TierView {
  const status = modelTiers[tier];
  const provider = status.providerId ? providers.find((item) => item.id === status.providerId) : undefined;
  const scenarios = scenarioTierBindings.filter((binding) => binding.tier === tier).map((binding) => binding.scenario);

  if (status.ready) return { tier, status, provider, viewStatus: 'ready', statusText: '可用', scenarios };
  if (status.providerId || status.modelId || status.blockedReason) return { tier, status, provider, viewStatus: 'blocked', statusText: '不可用', scenarios };
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
            items={providers.map((provider) => ({
              value: provider.id,
              label: `${provider.name} · ${provider.healthStatus === 'healthy' ? '健康' : provider.healthStatus === 'unchecked' ? '未测速' : provider.healthStatus}`,
            }))}
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
          <ModelCombobox
            id={`tier-model-${tierView.tier}`}
            value={modelId}
            onValueChange={setModelId}
            models={selectedProvider?.apiModels ?? []}
            placeholder="输入或选择模型 ID（如 gpt-4o-mini）"
          />
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
              <span className="rounded-lg border bg-background/80 p-2 text-primary">{copy.icon}</span>
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
        <span className="text-xs text-muted-foreground">场景映射可单独调整；保存模型层后会按当前映射同步。</span>
        <TierAssignmentDialog tierView={tierView} providers={providers} />
      </CardFooter>
    </Card>
  );
}

function ScenarioMappingTable({ tierViews, embeddingReady, scenarioTierBindings }: { tierViews: Record<ModelTier, TierView>; embeddingReady: boolean; scenarioTierBindings: AdminScenarioTierBinding[] }) {
  const router = useRouter();
  const [draftBindings, setDraftBindings] = useState(scenarioTierBindings);
  const [savedBindings, setSavedBindings] = useState(scenarioTierBindings);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();
  const hasChanges = draftBindings.some((binding) => savedBindings.find((current) => current.scenario === binding.scenario)?.tier !== binding.tier);

  function updateScenarioTier(scenario: AdminScenarioTierBinding['scenario'], tier: ModelTier) {
    setDraftBindings((current) => current.map((binding) => binding.scenario === scenario ? { ...binding, tier } : binding));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveScenarioTierBindings(draftBindings);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSavedBindings(draftBindings);
      router.refresh();
      toast.success(result.message ?? '场景路由映射已保存');
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-card">
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
              const currentTier = draftBindings.find((binding) => binding.scenario === row.scenario)?.tier ?? row.defaultTier;
              const view = tierViews[currentTier];
              const changed = savedBindings.find((binding) => binding.scenario === row.scenario)?.tier !== currentTier;
              return (
                <TableRow key={row.scenario}>
                  <TableCell className="text-sm text-muted-foreground">{row.role}</TableCell>
                  <TableCell>
                    <div className="font-medium">{CAPABILITY_LABELS[row.scenario]}</div>
                    <div className="font-mono text-xs text-muted-foreground">{row.scenario}</div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={currentTier}
                      items={[
                        { value: 'flash', label: 'Flash Model' },
                        { value: 'advanced', label: 'Advanced Model' },
                      ]}
                      onValueChange={(value) => updateScenarioTier(row.scenario, value as ModelTier)}
                    >
                      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flash">Flash Model</SelectItem>
                        <SelectItem value="advanced">Advanced Model</SelectItem>
                      </SelectContent>
                    </Select>
                    {changed ? <div className="mt-1 text-[10px] text-primary">待保存</div> : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(view.viewStatus)}>{view.statusText}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.impact}</TableCell>
                </TableRow>
              );
            })}
            <TableRow>
              <TableCell className="text-sm text-muted-foreground">{EMBEDDING_ROW.role}</TableCell>
              <TableCell>
                <div className="font-medium">{CAPABILITY_LABELS[EMBEDDING_ROW.scenario]}</div>
                <div className="font-mono text-xs text-muted-foreground">{EMBEDDING_ROW.scenario}</div>
              </TableCell>
              <TableCell><Badge variant="outline">Embedding</Badge></TableCell>
              <TableCell>
                <Badge variant={embeddingReady ? 'default' : 'outline'}>{embeddingReady ? '可用' : '需单独配置'}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{EMBEDDING_ROW.impact}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={submitting || !hasChanges}>
          {submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />保存中…</> : '保存场景映射'}
        </Button>
      </div>
    </div>
  );
}

function ProviderOperationsTable({ providers, modelTiers }: { providers: ProviderListItem[]; modelTiers: Record<ModelTier, AdminModelTierStatus> }) {
  if (providers.length === 0) {
    return (
      <EmptyState
        title="尚未配置模型 Provider"
        description="先在“模型接入”里添加服务；然后做健康检查、拉取模型，并在 Flash / Advanced 卡片中绑定模型。"
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
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
                    <CapabilityAssignmentDialog provider={provider} />
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

export function ProviderCapabilityMatrix({ providers, modelTiers, scenarioTierBindings }: { providers: ProviderListItem[]; modelTiers: Record<ModelTier, AdminModelTierStatus>; scenarioTierBindings: AdminScenarioTierBinding[] }) {
  const tierViews = useMemo(() => ({
    flash: getTierView('flash', providers, modelTiers, scenarioTierBindings),
    advanced: getTierView('advanced', providers, modelTiers, scenarioTierBindings),
  }), [providers, modelTiers, scenarioTierBindings]);
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
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Layers3 className="size-5" />AI 场景路由映射</h2>
            <p className="text-sm text-muted-foreground">按 AI 场景选择 Flash / Advanced 路由层；保存后会同步到运行时能力配置。Embedding 保持独立能力路径。</p>
          </div>
          <Badge variant={tierViews.flash.viewStatus === 'ready' && tierViews.advanced.viewStatus === 'ready' ? 'default' : 'destructive'}>
            <Sparkles className="mr-1 size-3" />模型路由状态
          </Badge>
        </div>
        <ScenarioMappingTable tierViews={tierViews} embeddingReady={embeddingReady} scenarioTierBindings={scenarioTierBindings} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Provider / MCP 运维诊断</h2>
          <p className="text-sm text-muted-foreground">保留健康检查、拉取模型、密钥状态、编辑与删除；用途列展示哪些模型层或 Embedding 能力正在使用该 Provider。</p>
        </div>
        <ProviderOperationsTable providers={providers} modelTiers={modelTiers} />
      </section>
    </div>
  );
}
