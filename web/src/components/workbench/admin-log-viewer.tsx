import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { StoredLogEvent } from '@/lib/observability/server-log-store';

function levelVariant(level: string) {
  if (level === 'error') return 'destructive' as const;
  if (level === 'warn') return 'secondary' as const;
  return 'outline' as const;
}

export function AdminLogViewer({
  events,
  devLines,
}: {
  events: StoredLogEvent[];
  devLines: string[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>结构化事件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.length === 0 ? <p className="text-sm text-muted-foreground">还没有 app-events.jsonl 记录。触发登录、API 或错误边界后会写入。</p> : null}
          {events.map((event, index) => (
            <article key={`${event.timestamp}-${event.event}-${index}`} className="rounded-xl border bg-background/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={levelVariant(event.level)}>{event.level}</Badge>
                <Badge variant="outline">{event.area}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{event.timestamp}</span>
              </div>
              <h3 className="mt-2 text-sm font-medium">{event.event}</h3>
              {event.message ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{event.message}</p> : null}
              <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {event.requestId ? <><dt>requestId</dt><dd className="font-mono">{event.requestId}</dd></> : null}
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
            <pre className="max-h-[38rem] overflow-auto rounded-xl bg-foreground p-4 text-xs leading-5 text-background">
              {devLines.join('\n')}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
