'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileWarning, RotateCw, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AdminLogEventDetail, AdminLogEventRow, adminLogExecutionKey } from '@/components/workbench/admin-log-event-card';
import { Pagination } from '@/components/workbench/pagination';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import {
  buildAdminLogHref,
  DEFAULT_LOG_QUERY,
  LOG_FUNCTION_OPTIONS,
  LOG_LEVEL_OPTIONS,
  LOG_QUICK_VIEWS,
  LOG_RESULT_OPTIONS,
  LOG_TIME_RANGE_OPTIONS,
  type AdminLogQuery,
  type AdminLogSummary,
  type LogSource,
  type PresentedLogExecution,
} from '@/lib/observability/admin-log-presentation';

export type AdminLogLoadState =
  | {
    readonly kind: 'loaded';
    readonly query: AdminLogQuery;
    readonly source: LogSource;
    readonly summary: AdminLogSummary;
    readonly executions: readonly PresentedLogExecution[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly rawEventCount: number;
    readonly scanLimit: number;
  }
  | { readonly kind: 'error'; readonly query: AdminLogQuery; readonly message: string };

const CLEAR_FILTER_OVERRIDES: Partial<AdminLogQuery> = {
  range: '24h',
  level: 'all',
  functionKey: 'all',
  result: 'all',
  search: '',
  traceId: '',
  userId: '',
};

function labelOf(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** 当前生效的筛选标签：每一条都能单独去掉，管理员不必先猜 URL 里塞了什么。 */
function activeFilterChips(query: AdminLogQuery) {
  const chips: { key: string; label: string; href: string }[] = [];
  if (query.range !== CLEAR_FILTER_OVERRIDES.range) {
    chips.push({
      key: 'range',
      label: `时间：${labelOf(LOG_TIME_RANGE_OPTIONS, query.range)}`,
      href: buildAdminLogHref(query, { range: CLEAR_FILTER_OVERRIDES.range }),
    });
  }
  if (query.level !== 'all') {
    chips.push({ key: 'level', label: `级别：${labelOf(LOG_LEVEL_OPTIONS, query.level)}`, href: buildAdminLogHref(query, { level: 'all' }) });
  }
  if (query.functionKey !== 'all') {
    chips.push({
      key: 'function',
      label: `功能：${labelOf(LOG_FUNCTION_OPTIONS, query.functionKey)}`,
      href: buildAdminLogHref(query, { functionKey: 'all' }),
    });
  }
  if (query.result !== 'all') {
    chips.push({ key: 'result', label: `结果：${labelOf(LOG_RESULT_OPTIONS, query.result)}`, href: buildAdminLogHref(query, { result: 'all' }) });
  }
  if (query.search) chips.push({ key: 'q', label: `关键字：${query.search}`, href: buildAdminLogHref(query, { search: '' }) });
  if (query.traceId) chips.push({ key: 'trace', label: `Trace：${query.traceId}`, href: buildAdminLogHref(query, { traceId: '' }) });
  if (query.userId) chips.push({ key: 'user', label: `用户：${query.userId}`, href: buildAdminLogHref(query, { userId: '' }) });
  return chips;
}

export function AdminLogViewer({ loadState }: { readonly loadState: AdminLogLoadState }) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { query } = loadState;
  const loaded = loadState.kind === 'loaded' ? loadState : null;
  const chips = activeFilterChips(query);
  const selected = loaded?.executions.find((execution) => adminLogExecutionKey(execution) === selectedKey) ?? null;

  function applyFilters(formData: FormData) {
    const params = new URLSearchParams();
    // range 的 'all' 是"全部时间"，不能像 level/result 那样当成"不过滤"丢掉。
    const range = String(formData.get('range') ?? '').trim();
    if (range && range !== DEFAULT_LOG_QUERY.range) params.set('range', range);
    for (const key of ['level', 'function', 'result', 'q', 'trace_id', 'user_id']) {
      const value = String(formData.get(key) ?? '').trim();
      if (value && value !== 'all') params.set(key, value);
    }
    router.push(`/admin/logs${params.size ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>快捷视图</CardTitle>
          <CardDescription>待处理、失败、警告各自是一个可直接分享的链接，其余筛选条件会一起带上。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {LOG_QUICK_VIEWS.map((view) => (
            <Button
              key={view.id}
              nativeButton={false}
              render={<Link href={buildAdminLogHref(query, view.overrides)} />}
              variant={query.result === (view.overrides.result ?? 'all') && query.level === (view.overrides.level ?? query.level) ? 'default' : 'outline'}
              className="min-h-11"
            >
              {view.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>筛选记录</CardTitle>
          <CardDescription>时间范围、级别、功能、结果、关键字与技术标识全部提交到服务端并写进 URL，刷新和返回都不会丢。</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={applyFilters} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2 xl:col-span-2">
                <Label htmlFor="q">事件代码、路由或错误关键字</Label>
                <Input id="q" name="q" defaultValue={query.search} placeholder="例如：school_login、/api/auth/login" className="min-h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="log-range">时间范围</Label>
                <Select key={query.range} items={LOG_TIME_RANGE_OPTIONS} name="range" defaultValue={query.range}>
                  <SelectTrigger id="log-range" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOG_TIME_RANGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="log-level">执行级别</Label>
                <Select key={query.level} items={LOG_LEVEL_OPTIONS} name="level" defaultValue={query.level}>
                  <SelectTrigger id="log-level" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOG_LEVEL_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="log-function">功能</Label>
                <Select key={query.functionKey} items={LOG_FUNCTION_OPTIONS} name="function" defaultValue={query.functionKey}>
                  <SelectTrigger id="log-function" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOG_FUNCTION_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="log-result">执行结果</Label>
                <Select key={query.result} items={LOG_RESULT_OPTIONS} name="result" defaultValue={query.result}>
                  <SelectTrigger id="log-result" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOG_RESULT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" className="min-h-11">
                  <Search className="size-4" aria-hidden="true" />
                  查询
                </Button>
                <Button nativeButton={false} render={<Link href={buildAdminLogHref({ ...DEFAULT_LOG_QUERY, ...CLEAR_FILTER_OVERRIDES })} />} variant="ghost" className="min-h-11">
                  重置
                </Button>
              </div>
            </div>
            <details className="rounded-lg border border-border/65 bg-muted/30 px-4 py-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-foreground">按技术标识筛选</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="trace_id">Trace ID / 请求 ID</Label>
                  <Input id="trace_id" name="trace_id" defaultValue={query.traceId} autoComplete="off" className="min-h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_id">用户 ID</Label>
                  <Input id="user_id" name="user_id" defaultValue={query.userId} autoComplete="off" className="min-h-11" />
                </div>
              </div>
            </details>
          </form>

          {chips.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">当前筛选</span>
              {chips.map((chip) => (
                <Button
                  key={chip.key}
                  nativeButton={false}
                  render={<Link href={chip.href} />}
                  variant="outline"
                  className="min-h-9 gap-1"
                >
                  {chip.label}
                  <X className="size-3" aria-hidden="true" />
                </Button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {loadState.kind === 'error' ? (
        <ErrorState
          title="运行记录加载失败"
          description={loadState.message}
          action={<Button type="button" variant="outline" onClick={() => router.refresh()}><RotateCw className="size-4" />重新加载</Button>}
        />
      ) : (
        <section className="space-y-4" aria-labelledby="log-results-heading">
          <div className="space-y-2">
            <h2 id="log-results-heading" className="font-sans text-lg font-semibold">执行记录</h2>
            <p className="text-sm text-muted-foreground">
              口径：{labelOf(LOG_TIME_RANGE_OPTIONS, query.range)}内服务端匹配 {loaded?.rawEventCount ?? 0} 条原始事件
              {loaded && loaded.rawEventCount >= loaded.scanLimit ? `（已达单次读取上限 ${loaded.scanLimit} 条，更早的记录未纳入本次统计）` : ''}
              ，合并为 {loaded?.summary.executions ?? 0} 次执行；当前结果筛选后共 {loaded?.total ?? 0} 次执行。
            </p>
          </div>

          {loaded?.source === 'file' ? (
            <p className="flex items-start gap-2 rounded-lg border border-accent/45 bg-accent/10 px-4 py-3 text-sm text-foreground">
              <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                当前读的是本机文件回落通道（source=file），只包含这台机器写入的记录，租户边界不适用；生产环境应通过数据库通道读取。
              </span>
            </p>
          ) : null}

          {loaded && loaded.executions.length === 0 ? (
            <EmptyState
              title="当前条件下没有执行记录"
              description={
                loaded.rawEventCount === 0
                  ? '服务端在该时间范围内没有匹配记录。放宽时间范围或清除筛选后再看；没有记录不等于系统一定正常。'
                  : `服务端匹配到 ${loaded.rawEventCount} 条原始记录，合并与结果筛选后没有可展示的执行。调整结果或功能筛选即可看到其余执行。`
              }
            />
          ) : (
            <div className="space-y-2">
              {loaded?.executions.map((execution) => (
                <AdminLogEventRow
                  selected={selectedKey === adminLogExecutionKey(execution)}
                  execution={execution}
                  onSelect={() => setSelectedKey(adminLogExecutionKey(execution))}
                />
              ))}
            </div>
          )}

          {loaded ? (
            <Pagination
              page={loaded.page}
              pageSize={loaded.pageSize}
              total={loaded.total}
              itemLabel="次执行"
              buildHref={(target) => buildAdminLogHref(query, {}, target)}
            />
          ) : null}
        </section>
      )}

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedKey(null);
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected ? selected.primary.functionLabel : '执行详情'}</SheetTitle>
            <SheetDescription>
              {selected
                ? `${selected.primary.resultLabel} · ${selected.primary.eventCode}`
                : '选择一条执行记录查看影响对象、处理建议与技术报告。'}
            </SheetDescription>
          </SheetHeader>
          {selected ? <AdminLogEventDetail execution={selected} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
