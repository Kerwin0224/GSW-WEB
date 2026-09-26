import { Activity, Gauge } from 'lucide-react';

import { AdminLogViewer, type AdminLogLoadState } from '@/components/workbench/admin-log-viewer';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireProfile } from '@/lib/auth';
import {
  buildAdminLogHref,
  filterPresentedLogExecutions,
  logRangeStartIso,
  LOG_TIME_RANGE_OPTIONS,
  mergePresentedLogExecutions,
  parseAdminLogQuery,
  presentLogEvent,
  summarizeLogExecutions,
  type AdminLogQuery,
} from '@/lib/observability/admin-log-presentation';
import {
  listLogTenants,
  readRecentAppEvents,
  type AppEventReadResult,
  summarizeAppEventLatency,
  type AppEventFilters,
  type LogLatencySummary,
  type LogTenantOption,
} from '@/lib/observability/server-log-store';
import { parsePageParam } from '@/lib/pagination';

/** 单次读取的原始事件上限。超出后页面必须说明统计口径，不能把上限说成"全部"。 */
const LOG_SCAN_LIMIT = 300;
const LOG_PAGE_SIZE = 25;

function millis(value: number | null): string {
  if (value === null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value} ms`;
}

/**
 * 租户筛选用原生 GET 表单：这一层没有交互状态需要维护，
 * 引入一个客户端组件换来的只是多一份 hydration。
 * 其余筛选条件以隐藏字段原样带上，改租户不会把用户已经选好的级别和关键字冲掉。
 */
function TenantFilterForm({ query, tenants }: { query: AdminLogQuery; tenants: readonly LogTenantOption[] }) {
  const hiddenNames = Object.entries({
    range: query.range,
    level: query.level,
    function: query.functionKey,
    result: query.result,
    q: query.search,
    trace_id: query.traceId,
    user_id: query.userId,
  }).filter(([, value]) => value && value !== 'all');

  return (
    <form method="get" action="/admin/logs" className="flex flex-wrap items-end gap-2">
      {hiddenNames.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        租户（学校）
        <select
          name="school"
          defaultValue={query.schoolId}
          className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm text-foreground"
        >
          <option value="">全部可见学校</option>
          {tenants.map((tenant) => (
            <option key={tenant.schoolId} value={tenant.schoolId}>{tenant.schoolName}</option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline" size="sm">按租户筛选</Button>
      {query.schoolId ? (
        <Button nativeButton={false} variant="ghost" size="sm" render={<a href={buildAdminLogHref(query, { schoolId: '' })}>清除</a>} />
      ) : null}
    </form>
  );
}

function LatencySection({ latency }: { latency: LogLatencySummary }) {
  const hasSamples = latency.samples > 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base"><Gauge className="size-4" />调用延迟</CardTitle>
          <Badge variant={latency.source === 'database' ? 'outline' : 'secondary'}>
            {latency.source === 'database' ? '数据库通道' : '本地文件回落通道'}
          </Badge>
        </div>
        <CardDescription>
          {hasSamples
            ? `取最近 ${latency.samples} 条带耗时的记录计算；p95 表示 95% 的调用快于该值。`
            : '当前筛选范围内没有带耗时的记录。请求级耗时在 withApiLogging 收口后才会入库。'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[['p50', latency.p50], ['p95', latency.p95], ['p99', latency.p99], ['最慢', latency.max]].map(([label, value]) => (
            <div key={label as string} className="space-y-1">
              <dt className="text-xs text-muted-foreground">{label as string}</dt>
              <dd className="font-mono text-lg">{millis(value as number | null)}</dd>
            </div>
          ))}
        </dl>
        {latency.slowestByEvent.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="px-3 py-2 text-left text-xs text-muted-foreground">按 event 分组的慢调用榜（按 p95 倒序）</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">event</th>
                  <th className="px-3 py-2 font-medium">次数</th>
                  <th className="px-3 py-2 font-medium">p95</th>
                  <th className="px-3 py-2 font-medium">最慢</th>
                </tr>
              </thead>
              <tbody>
                {latency.slowestByEvent.map((row) => (
                  <tr key={row.event} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs">{row.event}</td>
                    <td className="px-3 py-2">{row.calls}</td>
                    <td className="px-3 py-2">{millis(row.p95)}</td>
                    <td className="px-3 py-2">{millis(row.max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function buildLogLoadState(result: AppEventReadResult, query: AdminLogQuery, page: number): AdminLogLoadState {
  // 功能与结果筛选在服务端合并之后判定：同一请求的 started/completed/failed
  // 先合并成一次执行，「待处理」才不会把一次失败算成开始+失败两条。
  const merged = mergePresentedLogExecutions(result.events.map(presentLogEvent));
  const scoped = filterPresentedLogExecutions(merged, query.functionKey, 'all');
  const filtered = filterPresentedLogExecutions(scoped, 'all', query.result);
  const pageCount = Math.max(1, Math.ceil(filtered.length / LOG_PAGE_SIZE));
  return {
    kind: 'loaded',
    query,
    source: result.source,
    summary: summarizeLogExecutions(scoped),
    executions: filtered.slice((Math.min(page, pageCount) - 1) * LOG_PAGE_SIZE, Math.min(page, pageCount) * LOG_PAGE_SIZE),
    total: filtered.length,
    page: Math.min(page, pageCount),
    pageSize: LOG_PAGE_SIZE,
    rawEventCount: result.events.length,
    scanLimit: LOG_SCAN_LIMIT,
  };
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 页面侧守卫：本页直读服务端日志，是全仓唯一绕过 requireRole 的页面级数据读取。
  // 只靠 /admin/layout 不够——layout 在客户端软导航时不重渲染，待改密管理员从
  // /admin 软跳到本页仍能读到日志。
  await requireProfile('admin');

  const params = await searchParams;
  const query = parseAdminLogQuery(params);
  const rangeLabel = LOG_TIME_RANGE_OPTIONS.find((option) => option.value === query.range)?.label ?? query.range;
  const page = parsePageParam(params.page);
  const storeFilters: AppEventFilters = {
    level: query.level === 'all' ? undefined : query.level,
    traceId: query.traceId || undefined,
    userId: query.userId || undefined,
    search: query.search || undefined,
    schoolId: query.schoolId || undefined,
    since: logRangeStartIso(query.range),
  };

  // 三路读并行：租户清单、事件列表、延迟统计互不依赖，串起来会让首屏多等两个往返。
  const [tenants, readResult, latency] = await Promise.all([
    listLogTenants().catch((): LogTenantOption[] => []),
    // 读失败统一走 null 分支：AppLogReadError 之外还有鉴权、网络等异常，
    // 页面文案对管理员是同一句，不值得为每种原因写一套。
    readRecentAppEvents(LOG_SCAN_LIMIT, storeFilters).catch((): null => null),
    summarizeAppEventLatency(storeFilters),
  ]);

  const state: AdminLogLoadState = readResult === null ? {
    kind: 'error',
    query,
    message: '运行记录暂时无法读取。请稍后重试；如持续失败，请联系技术人员检查日志读取链路。',
  } : buildLogLoadState(readResult, query, page);

  const summary = state.kind === 'loaded' ? state.summary : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="运行日志"
        description={`按功能、执行结果和时间范围排查问题，数字只统计${rangeLabel}内服务端筛选到的记录。`}
        primaryAction={{ label: '查看待处理', href: buildAdminLogHref(query, { result: 'pending', level: 'all' }) }}
        secondaryAction={{ label: '查看失败', href: buildAdminLogHref(query, { result: 'failed', level: 'all' }) }}
        metrics={summary ? [
          { label: '待处理', value: summary.pending, hint: '失败、未完成或需关注的执行次数' },
          { label: '失败', value: summary.failed, hint: '需要复制报告转交开发人员' },
          { label: '警告', value: summary.warning, hint: '系统记录到需关注情况的执行次数' },
          { label: '执行记录', value: summary.executions, hint: summary.lastAt ? `最近一次 ${summary.lastAt}` : `${rangeLabel}内没有匹配记录` },
        ] : [
          { label: '待处理', value: '不可用', hint: '运行记录读取失败' },
          { label: '失败', value: '不可用', hint: '运行记录读取失败' },
          { label: '警告', value: '不可用', hint: '运行记录读取失败' },
          { label: '执行记录', value: '不可用', hint: '运行记录读取失败' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="租户与延迟"
          description="多租户下日志按学校收敛；延迟取真实入库的耗时，不是估算。"
        />
        <TenantFilterForm query={query} tenants={tenants} />
        <LatencySection latency={latency} />
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="功能执行记录"
          description="先看功能、执行结果、影响对象和处理建议；点开任意一条可查看生命周期轨迹与可交接的技术报告。"
        />
        <AdminLogViewer loadState={state} />
      </section>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Activity className="size-3.5" aria-hidden="true" />
        数据来源：{state.kind === 'loaded' && state.source === 'database' ? '数据库' : '本地文件回落通道'}。
        <a href="/admin/usage" className="underline underline-offset-4">按学校 × 天查看 AI 用量</a>
      </p>
    </div>
  );
}
