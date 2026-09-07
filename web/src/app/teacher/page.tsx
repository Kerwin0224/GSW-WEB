import { AlertTriangle, ClipboardCheck, FileSearch } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getTeacherAnalytics, getTeacherAuditQueue } from '@/lib/data/teacher';

export default async function TeacherChatPage() {
  const [analyticsResult, auditResult] = await Promise.all([
    getTeacherAnalytics(),
    getTeacherAuditQueue(),
  ]);

  if (!analyticsResult.ok) {
    return (
      <div className="p-6">
        <ErrorState title="教师看板加载失败" description={analyticsResult.message} />
      </div>
    );
  }

  const analytics = analyticsResult.data;
  const auditRecords = auditResult.ok ? auditResult.data : [];
  const pendingRecords = auditRecords.filter((record) => !record.conversationFinalized);
  const auditWorkload = auditResult.ok ? pendingRecords.length : analytics.auditWorkload;
  const reviewedCount = auditResult.ok ? auditRecords.filter((record) => record.conversationFinalized).length : analytics.reviewedCount;
  const highRiskRecords = pendingRecords.filter((record) => record.preReviewIssues.length > 0).slice(0, 3);
  const classSummaries = Array.from(pendingRecords.reduce((groups, record) => {
    const current = groups.get(record.classLabel) ?? { classLabel: record.classLabel, pending: 0, risk: 0, latest: record.createdAt };
    current.pending += 1;
    current.risk += record.preReviewIssues.length > 0 ? 1 : 0;
    if (record.createdAt > current.latest) current.latest = record.createdAt;
    groups.set(record.classLabel, current);
    return groups;
  }, new Map<string, { classLabel: string; pending: number; risk: number; latest: string }>()).values()).sort((left, right) => {
    if (right.risk !== left.risk) return right.risk - left.risk;
    return right.latest.localeCompare(left.latest);
  }).slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="教学总览"
        description="查看班级待办，核验 AI 回答。"
        primaryAction={{ label: '审核回答', href: '/teacher/audit' }}
        secondaryAction={{ label: '开始备课', href: '/teacher/chat' }}
        metrics={[
          { label: '负责班级', value: analytics.assignedClasses, hint: '你任课的班级' },
          { label: '待审核会话', value: auditWorkload, hint: '等待查看和提交' },
          { label: '已审核会话', value: reviewedCount, hint: '已完成最终提交' },
        ]}
      />

      {!auditResult.ok ? <ErrorState title="回答审核队列加载失败" description={auditResult.message} /> : null}

      {auditResult.ok ? <section>
        <Card flushHeader className="overflow-hidden border-destructive/20 bg-card/92 shadow-soft backdrop-blur-xl">
          <CardHeader className="border-b border-destructive/15 bg-destructive/5">
            <CardTitle className="flex items-center gap-2 font-heading">
              <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
              需优先审核
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            {highRiskRecords.length === 0 ? <EmptyState title="暂无已标记疑点" description="AI 初筛可能漏判，回答仍需教师审核。" /> : null}
            {highRiskRecords.map((record) => (
              <a key={record.id} href="/teacher/audit" className="group block rounded-lg border border-destructive/25 bg-destructive/5 p-4 shadow-soft transition-[border-color,background-color,box-shadow] duration-200 hover:border-destructive/45 hover:bg-destructive/8 hover:shadow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{record.classLabel} · {record.studentName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">《{record.projectTitle}》 · {record.sessionLabel}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground">{record.preReviewIssues.length} 处疑点</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-destructive/90">{record.preReviewIssues.map((issue) => issue.label).join('、')}</p>
              </a>
            ))}
          </CardContent>
        </Card>
      </section> : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {auditResult.ok ? <Card className="border-border/70 bg-card/88 shadow-soft">
          <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><FileSearch className="size-5 text-primary" aria-hidden="true" />班级审核队列</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {classSummaries.length === 0 ? <EmptyState title="暂无待审核会话" description="有待审核会话时，会按疑点数量和时间排在这里。" /> : null}
            {classSummaries.map((summary) => (
              <a key={summary.classLabel} href="/teacher/audit" className="block rounded-lg border border-border/65 bg-background/78 p-4 shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-background/95 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{summary.classLabel}</p>
                  <Badge variant={summary.risk > 0 ? 'destructive' : 'outline'}>{summary.risk} 个会话有疑点</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">待审核 {summary.pending} 个会话 · 最近学习 {new Date(summary.latest).toLocaleString('zh-CN')}</p>
              </a>
            ))}
          </CardContent>
        </Card> : null}

        <Card className="border-border/70 bg-card/88 shadow-soft">
          <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><ClipboardCheck className="size-5 text-primary" aria-hidden="true" />近 7 天新增会话审核</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-primary/20 bg-primary/6 p-4">
              <p className="text-xs text-muted-foreground">覆盖率</p>
              <p className="mt-2 text-3xl font-semibold text-primary">{analytics.weeklyAuditCoverage.coveragePercent}%</p>
            </div>
            <div className="rounded-lg border border-border/65 bg-background/78 p-4">
              <p className="text-xs text-muted-foreground">已审核</p>
              <p className="mt-2 text-3xl font-semibold">{analytics.weeklyAuditCoverage.audited}</p>
            </div>
            <div className="rounded-lg border border-border/65 bg-background/78 p-4">
              <p className="text-xs text-muted-foreground">待审核</p>
              <p className="mt-2 text-3xl font-semibold">{analytics.weeklyAuditCoverage.pending}</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
