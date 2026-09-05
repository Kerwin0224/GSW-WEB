'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AppEventFilters, StoredLogEvent } from '@/lib/observability/server-log-store';

function levelVariant(level: string) {
  if (level === 'error') return 'destructive' as const;
  if (level === 'warn') return 'secondary' as const;
  return 'outline' as const;
}

export function AdminLogViewer({
  events,
  devLines,
  filters,
}: {
  events: StoredLogEvent[];
  devLines: string[];
  filters: AppEventFilters;
}) {
  const router = useRouter();
  const level = filters.level ?? 'all';

  function applyFilters(formData: FormData) {
    const params = new URLSearchParams();
    for (const key of ['level', 'trace_id', 'user_id', 'q']) {
      const value = String(formData.get(key) ?? '').trim();
      if (value && value !== 'all') params.set(key, value);
    }
    router.push(`/admin/logs${params.size ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={applyFilters} className="grid gap-3 md:grid-cols-[160px_1fr_1fr_1.4fr_auto]">
            <div className="space-y-2">
              <Label>level</Label>
              <Select key={level} name="level" defaultValue={level}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="debug">debug</SelectItem>
                  <SelectItem value="info">info</SelectItem>
                  <SelectItem value="warn">warn</SelectItem>
                  <SelectItem value="error">error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trace_id">trace_id / requestId</Label>
              <Input id="trace_id" name="trace_id" defaultValue={filters.traceId ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user_id">user_id</Label>
              <Input id="user_id" name="user_id" defaultValue={filters.userId ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="q">搜索</Label>
              <Input id="q" name="q" defaultValue={filters.search ?? ''} />
            </div>
            <Button type="submit" className="self-end">
              <Search className="mr-2 size-4" />
              过滤
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>结构化事件</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.length === 0 ? <p className="text-sm text-muted-foreground">还没有 app-events.jsonl 记录。触发登录、API 或错误边界后会写入。</p> : null}
            {events.map((event, index) => (
              <article key={`${event.timestamp}-${event.event}-${index}`} className="rounded-lg border bg-background/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={levelVariant(event.level)}>{event.level}</Badge>
                  <Badge variant="outline">{event.area}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{event.timestamp}</span>
                </div>
                <h3 className="mt-2 text-sm font-medium">{event.event}</h3>
                {event.message ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{event.message}</p> : null}
                <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  {event.requestId ? <><dt>requestId</dt><dd className="font-mono">{event.requestId}</dd></> : null}
                  {event.context?.trace_id || event.context?.traceId ? <><dt>trace_id</dt><dd className="font-mono">{String(event.context.trace_id ?? event.context.traceId)}</dd></> : null}
                  {event.context?.user_id || event.context?.userId ? <><dt>user_id</dt><dd className="font-mono">{String(event.context.user_id ?? event.context.userId)}</dd></> : null}
                  {event.route ? <><dt>route</dt><dd>{event.route}</dd></> : null}
                  {event.status ? <><dt>status</dt><dd>{event.status}</dd></> : null}
                  {event.durationMs ? <><dt>duration</dt><dd>{event.durationMs}ms</dd></> : null}
                </dl>
              </article>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next dev 原始日志</CardTitle>
          </CardHeader>
          <CardContent>
            {devLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">使用 npm run dev:logged 启动后，这里会显示 .logs/next-dev.log 最近 120 行。</p>
            ) : (
              <pre className="max-h-[38rem] overflow-auto rounded-lg bg-foreground p-4 text-xs leading-5 text-background">
                {devLines.join('\n')}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
