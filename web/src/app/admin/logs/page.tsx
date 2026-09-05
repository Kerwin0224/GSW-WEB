import { Activity, FileJson, TerminalSquare } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLogViewer } from '@/components/workbench/admin-log-viewer';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getLogFileStatus, readFilteredAppEvents, readRecentDevLogLines, type AppEventFilters } from '@/lib/observability/server-log-store';

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const level = pick('level');
  const filters: AppEventFilters = {
    level: level === 'debug' || level === 'info' || level === 'warn' || level === 'error' ? level : undefined,
    traceId: pick('trace_id'),
    userId: pick('user_id'),
    search: pick('q'),
  };
  const [status, events, devLines] = await Promise.all([
    getLogFileStatus(),
    readFilteredAppEvents(filters, 120),
    readRecentDevLogLines(120),
  ]);
  const errorCount = events.filter((event) => event.level === 'error').length;
  const warnCount = events.filter((event) => event.level === 'warn').length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="运行日志"
        title="出了问题，这里有迹可循。"
        description="集中查看登录、API、渲染错误和开发日志。日志只记录摘要，密码、cookie、token、密钥等敏感字段会脱敏。"
        metrics={[
          { label: '结构化事件', value: events.length, hint: status.appLogPath },
          { label: '错误', value: errorCount, hint: '需要优先处理的错误' },
          { label: '警告', value: warnCount, hint: '值得留意的警告' },
        ]}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileJson className="size-5 text-primary" />结构化日志</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <Badge variant="outline">app_log_events 表</Badge>
            <p>生产环境持久写入 Supabase；本地开发同时落盘 .logs。</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TerminalSquare className="size-5 text-primary" />Dev 原始日志</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <Badge variant="outline">{status.devLogBytes} bytes</Badge>
            <p>更新：{status.devLogUpdatedAt ?? '尚未创建'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="size-5 text-primary" />运行建议</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            本地开发用 <code className="rounded bg-muted px-1 py-0.5">npm run dev:logged</code>，同时写入 .logs/next-dev.log。
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeader title="最近日志" description="先看结构化事件定位 requestId，再看原始 dev 日志确认框架级 panic 或编译错误。" />
        <AdminLogViewer events={events} devLines={devLines} filters={filters} />
      </section>
    </div>
  );
}
