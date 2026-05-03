import { Activity, FileJson, TerminalSquare } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLogViewer } from '@/components/workbench/admin-log-viewer';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getLogFileStatus, readRecentAppEvents, readRecentDevLogLines } from '@/lib/observability/server-log-store';

export default async function AdminLogsPage() {
  const [status, events, devLines] = await Promise.all([
    getLogFileStatus(),
    readRecentAppEvents(80),
    readRecentDevLogLines(120),
  ]);
  const errorCount = events.filter((event) => event.level === 'error').length;
  const warnCount = events.filter((event) => event.level === 'warn').length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="observability"
        title="后台再崩，也要留下证据。"
        description="本页集中查看登录、API、渲染错误和 Next dev 原始日志。日志只写结构化摘要，密码、cookie、token、密钥字段会脱敏。"
        metrics={[
          { label: '结构化事件', value: events.length, hint: status.appLogPath },
          { label: '错误', value: errorCount, hint: 'error level' },
          { label: '警告', value: warnCount, hint: 'warn level' },
        ]}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileJson className="size-5 text-primary" />结构化日志</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <Badge variant="outline">{status.appLogBytes} bytes</Badge>
            <p>更新：{status.appLogUpdatedAt ?? '尚未创建'}</p>
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
        <AdminLogViewer events={events} devLines={devLines} />
      </section>
    </div>
  );
}
