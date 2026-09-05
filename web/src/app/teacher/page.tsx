import { AlertTriangle, ClipboardCheck, FileSearch } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
        eyebrow="教学总览"
        title="先看今天要核实什么。"
        description="各班的待核实会话和风险提示都汇总在这里；具体的核实与批注在“学习记录核实”里完成。"
        primaryAction={{ label: '进入学习记录核实', href: '/teacher/audit' }}
        metrics={[
          { label: '负责班级', value: analytics.assignedClasses, hint: '你任课的班级' },
          { label: '待核实会话', value: auditWorkload, hint: '等待你查看和提交' },
          { label: '已核实会话', value: reviewedCount, hint: '已完成最终提交' },
        ]}
      />

      <section className="grid gap-4 lg:grid-cols-[1.05fr_1.05fr_0.9fr]">
        <Card className="gap-0 overflow-hidden py-0 border-primary/15 bg-card/92 shadow-soft backdrop-blur-xl">
          <CardHeader className="border-b border-border/60 bg-primary/6">
            <CardTitle className="flex items-center gap-2 font-heading">
              <ClipboardCheck className="size-5 text-primary" aria-hidden="true" />
              班级学情
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-primary/20 bg-primary/6 p-4">
                <p className="text-xs text-muted-foreground">负责班级</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{analytics.assignedClasses}</p>
              </div>
              <div className="rounded-lg border border-border/65 bg-background/78 p-4">
                <p className="text-xs text-muted-foreground">还没确认层级的学生</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{analytics.studentsWaitingChallenge}</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">数字来自学生完成的挑战，不由 AI 推断。</p>
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0 border-primary/20 bg-card/95 shadow-ink backdrop-blur-xl">
          <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_12%,transparent),transparent)]">
            <CardTitle className="flex items-center gap-2 font-heading">
              <FileSearch className="size-5 text-primary" aria-hidden="true" />
              待核实学习记录
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-end justify-between gap-4 rounded-lg border border-primary/20 bg-primary/6 p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">待核实</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-primary">{auditWorkload}</p>
              </div>
              <p className="max-w-44 text-right text-xs leading-5 text-muted-foreground">从班级点进去，逐个学生会话核实</p>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">逐条查看 AI 回答，需要时直接修订，最后一次性提交。</p>
            <Button nativeButton={false} render={<a href="/teacher/audit">打开核实工作台</a>} className="min-h-11 w-full cursor-pointer rounded-lg shadow-ink" />
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0 border-destructive/20 bg-card/92 shadow-soft backdrop-blur-xl">
          <CardHeader className="border-b border-destructive/15 bg-destructive/5">
            <CardTitle className="flex items-center gap-2 font-heading">
              <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
              需优先核实
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            {highRiskRecords.length === 0 ? <EmptyState title="暂无高风险提示" description="AI 预审没有发现疑点。发现后会第一时间列在这里。" /> : null}
            {highRiskRecords.map((record) => (
              <a key={record.id} href="/teacher/audit" className="group block rounded-lg border border-destructive/25 bg-destructive/5 p-4 shadow-soft transition-[border-color,background-color,box-shadow] duration-200 hover:border-destructive/45 hover:bg-destructive/8 hover:shadow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{record.classLabel} · {record.studentName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">《{record.projectTitle}》 · {record.sessionLabel}</p>
                  </div>
                  <span className="rounded-full bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground">{record.preReviewIssues.length}</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-destructive/90">{record.preReviewIssues.map((issue) => issue.label).join('、')}</p>
              </a>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="border-border/70 bg-card/88 shadow-soft">
          <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><FileSearch className="size-5 text-primary" aria-hidden="true" />班级核实压力</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {classSummaries.length === 0 ? <EmptyState title="暂无班级积压" description="各班有待核实的会话后，会按风险高低排在这里。" /> : null}
            {classSummaries.map((summary) => (
              <a key={summary.classLabel} href="/teacher/audit" className="block rounded-lg border border-border/65 bg-background/78 p-4 shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-background/95 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{summary.classLabel}</p>
                  <Badge variant={summary.risk > 0 ? 'destructive' : 'outline'}>{summary.risk} 条风险</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">待核实 {summary.pending} 条 · 最近学习 {new Date(summary.latest).toLocaleString('zh-CN')}</p>
              </a>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/88 shadow-soft">
          <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><ClipboardCheck className="size-5 text-primary" aria-hidden="true" />本周核实覆盖</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-primary/20 bg-primary/6 p-4">
              <p className="text-xs text-muted-foreground">覆盖率</p>
              <p className="mt-2 text-3xl font-semibold text-primary">{analytics.weeklyAuditCoverage.coveragePercent}%</p>
            </div>
            <div className="rounded-lg border border-border/65 bg-background/78 p-4">
              <p className="text-xs text-muted-foreground">已核实</p>
              <p className="mt-2 text-3xl font-semibold">{analytics.weeklyAuditCoverage.audited}</p>
            </div>
            <div className="rounded-lg border border-border/65 bg-background/78 p-4">
              <p className="text-xs text-muted-foreground">待核实</p>
              <p className="mt-2 text-3xl font-semibold">{analytics.weeklyAuditCoverage.pending}</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
