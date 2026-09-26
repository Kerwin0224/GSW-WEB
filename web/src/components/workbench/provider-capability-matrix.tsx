'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, Layers3, Loader2, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

/**
 * 场景目录从 teaching_scenarios 表读（见 /api/admin/providers/scenarios）。
 * 这里曾经有第二份 capabilities 常量，于是「加一种教学形态」要改四处代码；
 * 少改一处的症状是静默的：新场景不出现在矩阵页，或后端报 unknown capability。
 */
type ScenarioRow = {
  key: string;
  displayName: string;
  description: string | null;
};

type ScenarioCatalog = {
  rows: readonly ScenarioRow[];
  /** scenario_key → 路由层；查不到的键不在表里。 */
  tiers: Readonly<Record<string, ModelTier>>;
  defaultTier: ModelTier;
  error: string | null;
};

/** 向量嵌入是模型能力而不是教学场景，它没有场景目录行，单独列出来。 */
const EMBEDDING_CAPABILITY = 'embedding';
const EMBEDDING_LABEL = '向量嵌入';
const EMBEDDING_IMPACT = '项目检索的独立向量嵌入配置';


/** 谁能改公司级模板：org_admin 全权；校 admin（admin）只读公司级那一批。 */
export type ViewerRole = 'admin' | 'org_admin';
/** 变更摘要用的层级短名。 */
const TIER_LABEL: Record<ModelTier, string> = { flash: 'Flash Model', advanced: 'Advanced Model' };

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
    intent: '面向学习提问、提问类型判断、项目归属与挑战生成，优先响应速度和单位成本。',
    tone: 'from-primary/15 via-background to-background',
    icon: <Zap className="size-5" />,
  },
  advanced: {
    title: 'Advanced Model',
    subtitle: '更强推理、更高质量',
    intent: '面向备课问答、挑战评阅与 AI 预审，优先复杂推理和输出质量。',
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
  /** 展示用场景名（已从场景目录取 display_name），不是场景键。 */
  scenarios: readonly string[];
};

function getTierView(tier: ModelTier, providers: ProviderListItem[], modelTiers: Record<ModelTier, AdminModelTierStatus>, scenarioTierBindings: AdminScenarioTierBinding[], labels: Readonly<Record<string, string>>): TierView {
  const status = modelTiers[tier];
  const provider = status.providerId ? providers.find((item) => item.id === status.providerId) : undefined;
  const scenarios = scenarioTierBindings
    .filter((binding) => binding.tier === tier)
    .map((binding) => labels[binding.scenario] ?? binding.scenario);

  if (status.ready) return { tier, status, provider, viewStatus: 'ready', statusText: '可路由', scenarios };
  if (status.providerId || status.modelId || status.blockedReason) return { tier, status, provider, viewStatus: 'blocked', statusText: '不可路由', scenarios };
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
              <Badge key={scenario} variant="secondary">{scenario}</Badge>
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
    <Card className={`overflow-hidden border bg-gradient-to-br ${copy.tone}`}>
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
              <Badge key={scenario} variant="outline">{scenario}</Badge>
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

function ScenarioMappingTable({ tierViews, embeddingConfigured, scenarioTierBindings, catalog, canEdit }: { tierViews: Record<ModelTier, TierView>; embeddingConfigured: boolean; scenarioTierBindings: AdminScenarioTierBinding[]; catalog: ScenarioCatalog; canEdit: boolean }) {
  const router = useRouter();
  const [draftBindings, setDraftBindings] = useState(scenarioTierBindings);
  const [savedBindings, setSavedBindings] = useState(scenarioTierBindings);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();
  const changes = draftBindings
    .map((binding) => {
      const savedTier = savedBindings.find((current) => current.scenario === binding.scenario)?.tier;
      return savedTier && savedTier !== binding.tier
        ? { scenario: binding.scenario, from: savedTier, to: binding.tier }
        : null;
    })
    .filter((change): change is { scenario: AdminScenarioTierBinding['scenario']; from: ModelTier; to: ModelTier } => change !== null);
  const hasChanges = changes.length > 0;
  const labelOf = (key: string) => catalog.rows.find((row) => row.key === key)?.displayName ?? key;

  function discard() {
    setDraftBindings(savedBindings);
    setError(null);
  }

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
      {catalog.error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>教学场景目录读取失败</AlertTitle>
          <AlertDescription>
            {catalog.error} 下表只剩已保存的路由映射。场景目录来自 teaching_scenarios 表，
            读不到就看不到新增的教学形态——请刷新页面重试。
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>教学场景</TableHead>
              <TableHead>路由层</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>说明</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalog.rows.map((row) => {
              const saved = savedBindings.find((binding) => binding.scenario === row.key);
              // 目录里出现、但后端还写不了映射的场景（新加的教学形态）先只读展示：
              // 写入口 save_scenario_tier_bindings_and_sync 目前只接受模型能力枚举里的键。
              const editable = canEdit && saved !== undefined;
              const mappedTier = catalog.tiers[row.key];
              const currentTier = draftBindings.find((binding) => binding.scenario === row.key)?.tier
                ?? mappedTier
                ?? catalog.defaultTier;
              const view = tierViews[currentTier];
              const changed = saved !== undefined && saved.tier !== currentTier;
              // 只有既没有保存值、场景映射表里也没有记录时才是真的「没配」；
              // 校管理员只是改不了，不该被告知这个场景没配。
              const unmapped = saved === undefined && mappedTier === undefined;
              return (
                <TableRow key={row.key}>
                  <TableCell>
                    <div className="font-medium">{row.displayName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{row.key}</div>
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <Select
                        value={currentTier}
                        items={[
                          { value: 'flash', label: TIER_LABEL.flash },
                          { value: 'advanced', label: TIER_LABEL.advanced },
                        ]}
                        onValueChange={(value) => updateScenarioTier(row.key as AdminScenarioTierBinding['scenario'], value as ModelTier)}
                      >
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="flash">{TIER_LABEL.flash}</SelectItem>
                          <SelectItem value="advanced">{TIER_LABEL.advanced}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{TIER_LABEL[currentTier]}</Badge>
                    )}
                    {changed ? <div className="mt-1 text-[10px] text-primary">待保存</div> : null}
                    {unmapped ? <div className="mt-1 text-[10px] text-muted-foreground">未配置映射，按租户默认档位</div> : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(view.viewStatus)}>{view.statusText}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.description ?? '—'}</TableCell>
                </TableRow>
              );
            })}
            <TableRow>
              <TableCell>
                <div className="font-medium">{EMBEDDING_LABEL}</div>
                <div className="font-mono text-xs text-muted-foreground">{EMBEDDING_CAPABILITY}</div>
              </TableCell>
              <TableCell><Badge variant="outline">Embedding</Badge></TableCell>
              <TableCell>
                <Badge variant={embeddingConfigured ? 'default' : 'outline'}>{embeddingConfigured ? '已配置' : '需单独配置'}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{EMBEDDING_IMPACT}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {hasChanges && canEdit ? (
        <Alert>
          <AlertTitle>保存前请确认这 {changes.length} 处变更</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {changes.map((change) => (
                <li key={change.scenario}>
                  {labelOf(change.scenario)}：{TIER_LABEL[change.from]} → {TIER_LABEL[change.to]}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* 校管理员看得到路由结果（它决定本校模型怎么走），但改不了——那是公司级资产。
            与其让他点了再收到「仅公司管理员可改」的报错，不如直接不给入口。 */}
        {canEdit ? (
          <>
            <Button type="button" variant="outline" onClick={discard} disabled={submitting || !hasChanges}>
              放弃修改
            </Button>
            <Button type="button" onClick={save} disabled={submitting || !hasChanges}>
              {submitting ? <><Loader2 className="mr-2 size-4 animate-spin" />保存中…</> : '保存场景映射'}
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">场景路由映射是公司级配置，仅公司管理员可改；本校只决定各路由层绑到哪个 Provider。</p>
        )}
      </div>
    </div>
  );
}
/**
 * 场景目录走一次接口取，不随页面 props 下发：教学场景是数据不是代码，
 * 页面侧再维护一份 props 就等于把刚拆掉的那份常量又建回来。
 */
function useScenarioCatalog(): ScenarioCatalog {
  const [catalog, setCatalog] = useState<ScenarioCatalog>({ rows: [], tiers: {}, defaultTier: 'flash', error: null });

  useEffect(() => {
    let active = true;
    fetch('/api/admin/providers/scenarios')
      .then(async (response) => {
        const body = await response.json() as { scenarios?: ScenarioRow[]; tiers?: Record<string, ModelTier>; defaultTier?: ModelTier; error?: string };
        if (!active) return;
        if (!response.ok) {
          setCatalog((current) => ({ ...current, error: body.error ?? `场景目录读取失败（HTTP ${response.status}）。` }));
          return;
        }
        setCatalog({
          rows: body.scenarios ?? [],
          tiers: body.tiers ?? {},
          defaultTier: body.defaultTier ?? 'flash',
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (active) setCatalog((current) => ({ ...current, error: error instanceof Error ? error.message : '场景目录读取失败' }));
      });
    return () => { active = false; };
  }, []);

  return catalog;
}


function ProviderOperationsTable({ providers, modelTiers, viewerRole }: { providers: ProviderListItem[]; modelTiers: Record<ModelTier, AdminModelTierStatus>; viewerRole: ViewerRole }) {

  if (providers.length === 0) {
    return (
      <EmptyState
        title="尚未配置模型 Provider"
        description="先在「模型供应商」页添加服务；然后做连接检查、拉取模型，并在基础 / 高阶模型卡片中绑定模型。"
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
            <TableHead>最近检查</TableHead>
            <TableHead>模型</TableHead>
            <TableHead>用途</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => {
            const usedTiers = (['flash', 'advanced'] as ModelTier[]).filter((tier) => modelTiers[tier].providerId === provider.id && modelTiers[tier].modelId);
            const embeddingModels = provider.capabilities.filter((capability) => capability.capability === 'embedding');
            // 公司级模板归公司管：校管理员只读，按钮禁用并说明原因，免得点了只换来一句 RLS 拒绝。
            const gate = provider.schoolId || viewerRole === 'org_admin'
              ? { canEdit: true }
              : { canEdit: false, readOnlyReason: '公司级模板由公司管理员维护，本校账号只读' };
            return (
              <TableRow key={provider.id}>
                <TableCell className="align-top font-medium">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {provider.name}
                    {/* 作用域必须显示：同一张列表里既有本公司下发的模板，也有本校自发配置的，
                        不标出来就分不清「这条我能改吗」。null = 公司级模板。 */}
                    <Badge variant={provider.schoolId ? 'default' : 'outline'} className="text-[10px]">
                      {provider.schoolId ? '学校自配' : '公司级模板'}
                    </Badge>
                  </div>
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
                    <HealthCheckButton provider={provider} gate={gate} />
                    <FetchModelsButton provider={provider} gate={gate} />
                    <CapabilityAssignmentDialog provider={provider} gate={gate} />
                    <EditProviderDialog provider={provider} gate={gate} />
                    <DeleteProviderButton provider={provider} gate={gate} />
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

export function ProviderCapabilityMatrix({ providers, modelTiers, scenarioTierBindings, canEditScenarioRouting = false, viewerRole }: { providers: ProviderListItem[]; modelTiers: Record<ModelTier, AdminModelTierStatus>; scenarioTierBindings: AdminScenarioTierBinding[]; /** 场景→tier 是公司级资产，只有 org_admin 能改（见 saveScenarioTierBindings）。 */ canEditScenarioRouting?: boolean; /** 决定公司级模板是否只读。 */ viewerRole: ViewerRole }) {
  const catalog = useScenarioCatalog();
  const labels = useMemo(
    () => Object.fromEntries(catalog.rows.map((row) => [row.key, row.displayName])),
    [catalog.rows],
  );
  const tierViews = useMemo(() => ({
    flash: getTierView('flash', providers, modelTiers, scenarioTierBindings, labels),
    advanced: getTierView('advanced', providers, modelTiers, scenarioTierBindings, labels),
  }), [providers, modelTiers, scenarioTierBindings, labels]);
  const embeddingConfigured = providers.some((provider) =>
    provider.isEnabled &&
    provider.capabilities.some((capability) => capability.capability === 'embedding' && capability.modelId.trim())
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
        <ScenarioMappingTable tierViews={tierViews} embeddingConfigured={embeddingConfigured} scenarioTierBindings={scenarioTierBindings} catalog={catalog} canEdit={canEditScenarioRouting} />

      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">模型供应商</h2>
          <p className="text-sm text-muted-foreground">查看最近连接检查、已拉取模型、密钥状态和当前用途。</p>
        </div>
        <ProviderOperationsTable providers={providers} modelTiers={modelTiers} viewerRole={viewerRole} />
      </section>
    </div>
  );
}
