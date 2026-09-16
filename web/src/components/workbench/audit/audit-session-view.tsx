import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { AuditTranscript } from '@/components/workbench/audit/audit-transcript';
import { FinalizeAction, PreReviewAction } from '@/components/workbench/audit/audit-actions';
import { preReviewSummaryLabel, reviewStateLabel } from '@/components/workbench/audit/presentation';
import type { AuditSessionDetail } from '@/lib/data/teacher';
import { cn } from '@/lib/utils';

/**
 * 单条会话的完整核实视图：会话头 + 计数 + AI 预审状态 + 逐条会话 + 底部动作条。
 *
 * 动作条放在底部而非顶部：核实的动作顺序是「通读完整会话 → 提交」，
 * 把提交按钮放在读完之前，等于鼓励教师不看就点。
 */
export function AuditSessionHeader({ session }: { session: AuditSessionDetail }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-lg">{session.classLabel} · {session.studentName}</h1>
        <Badge variant={session.conversationFinalized ? 'secondary' : 'outline'}>{reviewStateLabel(session.reviewState)}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        《{session.projectName}》 · {session.sessionLabel} · 最近一条 AI 回答 {new Date(session.createdAt).toLocaleString('zh-CN')}
      </p>
    </>
  );
}

/** AI 预审状态面板：说清「覆盖了几条、发现几处、还是压根没跑成」。 */
function PreReviewStatusPanel({ session }: { session: AuditSessionDetail }) {
  if (session.preReviewState === 'not_run') return null;

  const hasIssues = session.preReviewIssues.length > 0;
  const isProblemState = session.preReviewState === 'partial' || session.preReviewState === 'failed' || session.preReviewState === 'blocked' || hasIssues;
  const Icon = isProblemState ? AlertTriangle : CheckCircle2;
  const message = (() => {
    switch (session.preReviewState) {
      case 'ready':
        return hasIssues
          ? `AI 预审已完成，覆盖 ${session.preReviewCoveredMessageCount}/${session.assistantCount} 条 AI 回答，发现 ${session.preReviewIssues.length} 处需教师核实的疑点。`
          : `AI 预审已完成，覆盖 ${session.preReviewCoveredMessageCount}/${session.assistantCount} 条 AI 回答，未发现明显疑点。`;
      case 'partial':
        return `AI 预审已保存，目前覆盖 ${session.preReviewCoveredMessageCount}/${session.assistantCount} 条 AI 回答，请继续补充。`;
      case 'failed':
        return session.preReviewBlocked ?? 'AI 预审失败，请重新运行。';
      default:
        return session.preReviewBlocked ?? 'AI 预审暂不可用。';
    }
  })();

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border p-3 text-sm',
        isProblemState ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-primary/25 bg-primary/6 text-primary',
      )}
      role={session.preReviewState === 'failed' ? 'alert' : 'status'}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="leading-6">{message}</p>
    </div>
  );
}

export function AuditSessionBody({ session }: { session: AuditSessionDetail }) {
  const summary = preReviewSummaryLabel({
    preReviewState: session.preReviewState,
    coveredCount: session.preReviewCoveredMessageCount,
    assistantCount: session.assistantCount,
    issueCount: session.preReviewIssues.length,
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border/65 bg-background/78 p-3"><span className="text-muted-foreground">AI 回答</span><p className="mt-1 text-2xl font-semibold">{session.assistantCount}</p></div>
        <div className="rounded-lg border border-primary/20 bg-primary/6 p-3"><span className="text-muted-foreground">待最终提交</span><p className="mt-1 text-2xl font-semibold text-primary">{session.pendingAssistantCount}</p></div>
        <div className="rounded-lg border border-border/65 bg-background/78 p-3"><span className="text-muted-foreground">已修订</span><p className="mt-1 text-2xl font-semibold">{session.revisedAssistantCount}</p></div>
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3"><span className="text-muted-foreground">有疑点</span><p className="mt-1 text-2xl font-semibold text-destructive">{session.riskAssistantCount}</p></div>
      </div>

      <p className="text-xs text-muted-foreground">{summary}</p>
      <PreReviewStatusPanel session={session} />

      {session.preReviewIssues.length > 0 ? (
        <ul className="space-y-2">
          {session.preReviewIssues.map((issue) => (
            <li key={`${issue.messageId}-${issue.label}-${issue.quote}`} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mr-2 inline size-4 text-destructive" aria-hidden="true" />
              <span className="font-medium">{issue.label}</span>
              <span className="ml-2 text-muted-foreground">{issue.quote}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <AuditTranscript transcript={session.transcript} locked={session.conversationFinalized} preReviewPartial={session.preReviewState === 'partial'} />
    </div>
  );
}

/**
 * 会话级动作条。放在外壳的底部槽 —— 它在滚动区之外，长会话里始终可见。
 * 若放进文档流末尾，「读到底才看得见提交按钮」，且读完想再核一眼就找不着按钮。
 */
export function AuditSessionActions({ session, nextSessionHref }: { session: AuditSessionDetail; nextSessionHref?: string }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <PreReviewAction
        conversationId={session.conversationId}
        preReviewState={session.preReviewState}
        blockedReason={session.preReviewBlocked}
        finalized={session.conversationFinalized}
      />
      <FinalizeAction
        key={session.conversationId}
        conversationId={session.conversationId}
        finalized={session.conversationFinalized}
        assistantCount={session.assistantCount}
        nextSessionHref={nextSessionHref}
      />
    </div>
  );
}
