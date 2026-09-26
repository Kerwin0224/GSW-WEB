'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Copy, Info, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  buildDeveloperReport,
  logEventIdentity,
  type LogExecutionResult,
  type PresentedLogEvent,
  type PresentedLogExecution,
} from '@/lib/observability/admin-log-presentation';

const RESULT_APPEARANCE = {
  started: { variant: 'secondary', icon: Clock3 },
  succeeded: { variant: 'secondary', icon: CheckCircle2 },
  not_completed: { variant: 'outline', icon: AlertTriangle },
  failed: { variant: 'destructive', icon: XCircle },
  attention: { variant: 'outline', icon: AlertTriangle },
  recorded: { variant: 'outline', icon: Info },
} as const satisfies Record<LogExecutionResult, { readonly variant: 'secondary' | 'outline' | 'destructive'; readonly icon: typeof Info }>;

/** 严重度色轨：一行里最先被看到的东西就是"这条要不要处理"。 */
const RESULT_RAIL: Readonly<Record<LogExecutionResult, string>> = {
  failed: 'border-l-destructive',
  not_completed: 'border-l-accent',
  attention: 'border-l-accent',
  succeeded: 'border-l-primary/70',
  recorded: 'border-l-border',
  started: 'border-l-border',
};

const EVENT_TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function adminLogExecutionKey(execution: PresentedLogExecution): string {
  return `${execution.lastAt}-${logEventIdentity(execution.primary)}`;
}

function formatEventTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : EVENT_TIME_FORMAT.format(date);
}

function routeLabel(event: PresentedLogEvent): string | undefined {
  if (!event.route) return undefined;
  return event.status === undefined
    ? `${event.method ?? ''} ${event.route}`.trim()
    : `${event.method ?? ''} ${event.route} → ${event.status}`.trim();
}

/** 紧凑行：一行读完"什么功能、什么结果、什么时候、影响谁"，细节交给详情面板。 */
export function AdminLogEventRow({
  execution,
  selected,
  onSelect,
}: {
  readonly execution: PresentedLogExecution;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const { primary } = execution;
  const ResultIcon = RESULT_APPEARANCE[primary.result].icon;
  const route = routeLabel(primary);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full flex-col gap-1.5 border border-border/70 border-l-4 bg-card px-4 py-3 text-left transition-colors hover:bg-primary/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${RESULT_RAIL[primary.result]} ${selected ? 'bg-primary/10' : ''}`}
    >
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant={RESULT_APPEARANCE[primary.result].variant}>
          <ResultIcon aria-hidden="true" />
          {primary.resultLabel}
        </Badge>
        <span className="font-sans text-sm font-semibold text-foreground">{primary.functionLabel}</span>
        {execution.mergedCount > 1 ? (
          <span className="rounded-4xl border border-border px-2 py-0.5 text-xs text-muted-foreground">
            合并 {execution.mergedCount} 条
          </span>
        ) : null}
        <time dateTime={execution.lastAt} className="ml-auto text-xs tabular-nums text-muted-foreground">
          {formatEventTime(execution.lastAt)}
        </time>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {route ? <span className="font-mono">{route}</span> : null}
        <span>{primary.affectedUsers}</span>
        <span className="truncate">{primary.outcome}</span>
      </span>
    </button>
  );
}

export function AdminLogEventDetail({ execution }: { readonly execution: PresentedLogExecution }) {
  const [copyState, setCopyState] = useState<'idle' | 'failed'>('idle');
  const { primary } = execution;
  const ResultIcon = RESULT_APPEARANCE[primary.result].icon;
  const report = buildDeveloperReport(primary, execution.timeline);
  const route = routeLabel(primary);

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopyState('idle');
      toast.success('技术报告已复制，可直接转交开发人员');
    } catch (error) {
      if (error instanceof Error) {
        setCopyState('failed');
        return;
      }
      throw error;
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={RESULT_APPEARANCE[primary.result].variant}>
            <ResultIcon aria-hidden="true" />
            {primary.resultLabel}
          </Badge>
          <span className="text-xs text-muted-foreground">{primary.level}</span>
          <time dateTime={execution.lastAt} className="ml-auto text-xs tabular-nums text-muted-foreground">
            {formatEventTime(execution.lastAt)}
          </time>
        </div>
        <h3 className="font-sans text-lg font-semibold text-foreground">{primary.functionLabel}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{primary.outcome}</p>
      </div>

      <dl className="grid gap-3 border-y border-border/65 py-3 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">影响对象</dt>
          <dd className="text-foreground">{primary.affectedUsers}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">处理建议</dt>
          <dd className="leading-6 text-foreground">{primary.remediation}</dd>
        </div>
        {route ? (
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">请求</dt>
            <dd className="break-all font-mono text-xs leading-5 text-foreground">{route}</dd>
          </div>
        ) : null}
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">时间</dt>
          <dd className="text-foreground">
            {execution.mergedCount > 1
              ? `${formatEventTime(execution.startedAt)} 起，共 ${execution.mergedCount} 条记录`
              : formatEventTime(execution.startedAt)}
          </dd>
        </div>
      </dl>

      {execution.mergedCount > 1 ? (
        <section className="space-y-2" aria-label="生命周期轨迹">
          <h4 className="text-sm font-semibold text-foreground">生命周期轨迹（{execution.mergedCount} 条）</h4>
          <ol className="space-y-1 rounded-lg bg-muted/40 px-4 py-3 font-mono text-xs leading-5 text-muted-foreground">
            {execution.timeline.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <details className="rounded-lg border border-border/65 bg-muted/30 px-4 py-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-foreground">
          技术排查信息（交接报告）
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-5 text-muted-foreground">
            报告以请求 ID 为主键，用户标识和密钥字段已脱敏，可直接转交开发人员。
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border/65 bg-background p-3 font-mono text-xs leading-5 text-foreground">
            {report}
          </pre>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={copyReport} className="min-h-11">
              <Copy className="size-4" aria-hidden="true" />
              复制技术报告
            </Button>
            {copyState === 'failed' ? (
              <p role="alert" className="text-sm text-destructive">复制失败，请手动选择报告文本。</p>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}
