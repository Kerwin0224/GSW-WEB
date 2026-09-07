'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RotateCw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminLogEventCard, adminLogEventKey } from '@/components/workbench/admin-log-event-card';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import {
  filterPresentedLogEvents,
  LOG_FUNCTION_OPTIONS,
  LOG_RESULT_OPTIONS,
  type LogFunctionFilter,
  type LogResultFilter,
  type PresentedLogEvent,
} from '@/lib/observability/admin-log-presentation';
import type { AppEventFilters } from '@/lib/observability/server-log-store';

export type AdminLogLoadState =
  | { readonly kind: 'loaded'; readonly events: readonly PresentedLogEvent[] }
  | { readonly kind: 'error'; readonly message: string };

const LOG_LEVEL_OPTIONS = [
  { value: 'all', label: '全部级别' },
  { value: 'debug', label: '调试记录' },
  { value: 'info', label: '普通记录' },
  { value: 'warn', label: '需关注' },
  { value: 'error', label: '错误' },
] as const;

function isLogFunctionFilter(value: unknown): value is LogFunctionFilter {
  return typeof value === 'string' && LOG_FUNCTION_OPTIONS.some((option) => option.value === value);
}

function isLogResultFilter(value: unknown): value is LogResultFilter {
  return typeof value === 'string' && LOG_RESULT_OPTIONS.some((option) => option.value === value);
}

export function AdminLogViewer({
  loadState,
  filters,
}: {
  readonly loadState: AdminLogLoadState;
  readonly filters: AppEventFilters;
}) {
  const router = useRouter();
  const [functionalArea, setFunctionalArea] = useState<LogFunctionFilter>('all');
  const [resultFilter, setResultFilter] = useState<LogResultFilter>('all');
  const level = filters.level ?? 'all';
  const events = loadState.kind === 'loaded' ? loadState.events : [];
  const visibleEvents = filterPresentedLogEvents(events, functionalArea, resultFilter);
  const hasServerFilters = Boolean(filters.level || filters.traceId || filters.userId || filters.search);

  function applyFilters(formData: FormData) {
    const params = new URLSearchParams();
    for (const key of ['level', 'trace_id', 'user_id', 'q']) {
      const value = String(formData.get(key) ?? '').trim();
      if (value && value !== 'all') params.set(key, value);
    }
    router.push(`/admin/logs${params.size ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>筛选记录</CardTitle>
          <CardDescription>关键字与执行级别会重新查询服务端；功能与结果筛选只作用于当前已返回的样本。</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={applyFilters} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <div className="space-y-2">
                <Label htmlFor="q">事件代码、路由或错误关键字</Label>
                <Input id="q" name="q" defaultValue={filters.search ?? ''} placeholder="例如：school_login、/api/auth/login" className="min-h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="log-level">执行级别</Label>
                <Select key={level} items={LOG_LEVEL_OPTIONS} name="level" defaultValue={level}>
                  <SelectTrigger id="log-level" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOG_LEVEL_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="min-h-11 self-end">
                <Search className="size-4" aria-hidden="true" />
                查询
              </Button>
            </div>
            <details className="rounded-lg border border-border/65 bg-muted/30 px-4 py-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-foreground">按技术标识筛选</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="trace_id">Trace ID / 请求 ID</Label>
                  <Input id="trace_id" name="trace_id" defaultValue={filters.traceId ?? ''} autoComplete="off" className="min-h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_id">用户 ID</Label>
                  <Input id="user_id" name="user_id" defaultValue={filters.userId ?? ''} autoComplete="off" className="min-h-11" />
                </div>
              </div>
            </details>
            {hasServerFilters ? (
              <Button nativeButton={false} render={<Link href="/admin/logs">清除服务端筛选</Link>} variant="ghost" className="min-h-11" />
            ) : null}
          </form>
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h2 id="log-results-heading" className="font-sans text-lg font-semibold">执行结果</h2>
              <p className="text-sm text-muted-foreground">当前服务端样本 {events.length} 条，功能与结果筛选后显示 {visibleEvents.length} 条。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:w-56">
                <Label htmlFor="log-function">功能（当前结果内）</Label>
                <Select items={LOG_FUNCTION_OPTIONS} value={functionalArea} onValueChange={(value) => isLogFunctionFilter(value) && setFunctionalArea(value)}>
                  <SelectTrigger id="log-function" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOG_FUNCTION_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:w-48">
                <Label htmlFor="log-result">结果（当前结果内）</Label>
                <Select items={LOG_RESULT_OPTIONS} value={resultFilter} onValueChange={(value) => isLogResultFilter(value) && setResultFilter(value)}>
                  <SelectTrigger id="log-result" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOG_RESULT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {visibleEvents.length === 0 ? (
            <EmptyState
              title={events.length === 0 ? '当前条件下没有运行记录' : '当前样本中没有匹配记录'}
              description={events.length === 0
                ? '可调整或清除筛选条件。没有记录只表示当前样本为空，不能据此判断系统是否健康。'
                : `服务端已返回 ${events.length} 条记录；调整功能或结果筛选可查看当前样本中的其他操作。`}
            />
          ) : (
            <div className="space-y-3">
              {visibleEvents.map((event) => <AdminLogEventCard key={adminLogEventKey(event)} event={event} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
