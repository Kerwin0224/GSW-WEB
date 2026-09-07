'use client';

import { useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clock3, Copy, Info, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  buildDeveloperReport,
  type LogExecutionResult,
  type PresentedLogEvent,
} from '@/lib/observability/admin-log-presentation';

const RESULT_APPEARANCE = {
  started: { variant: 'secondary', icon: Clock3 },
  succeeded: { variant: 'secondary', icon: CheckCircle2 },
  not_completed: { variant: 'outline', icon: AlertTriangle },
  failed: { variant: 'destructive', icon: XCircle },
  attention: { variant: 'outline', icon: AlertTriangle },
  recorded: { variant: 'outline', icon: Info },
} as const satisfies Record<LogExecutionResult, { readonly variant: 'secondary' | 'outline' | 'destructive'; readonly icon: typeof Info }>;

const EVENT_TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function adminLogEventKey(event: PresentedLogEvent): string {
  return `${event.timestamp}-${event.eventCode}-${event.requestId ?? ''}-${event.digest ?? ''}`;
}

function formatEventTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : EVENT_TIME_FORMAT.format(date);
}

export function AdminLogEventCard({ event }: { readonly event: PresentedLogEvent }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const appearance = RESULT_APPEARANCE[event.result];
  const ResultIcon = appearance.icon;
  const report = buildDeveloperReport(event);

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopyState('copied');
    } catch (error) {
      if (error instanceof Error) {
        setCopyState('failed');
        return;
      }
      throw error;
    }
  }

  return (
    <Card size="sm" className="border-border/70 bg-card">
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h3 className="font-sans text-base font-semibold text-foreground">{event.functionLabel}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{event.outcome}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant={appearance.variant}><ResultIcon className="size-3" aria-hidden="true" />{event.resultLabel}</Badge>
            <time dateTime={event.timestamp} className="text-xs tabular-nums text-muted-foreground">{formatEventTime(event.timestamp)}</time>
          </div>
        </div>

        <dl className="grid gap-3 border-y border-border/65 py-3 text-sm md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">影响对象</dt>
            <dd className="text-foreground">{event.affectedUsers}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">处理建议</dt>
            <dd className="leading-6 text-foreground">{event.remediation}</dd>
          </div>
        </dl>

        <details className="rounded-lg bg-muted/35 px-4 py-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-foreground">技术排查信息</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">以下报告保留请求与错误线索，用户标识和密钥字段已脱敏，可直接转交开发人员。</p>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border/65 bg-background p-3 font-mono text-xs leading-5 text-foreground">{report}</pre>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={copyReport} className="min-h-11">
                {copyState === 'copied' ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copyState === 'copied' ? '已复制' : '复制技术报告'}
              </Button>
              {copyState === 'failed' ? <p role="alert" className="text-sm text-destructive">复制失败，请手动选择报告文本。</p> : null}
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
