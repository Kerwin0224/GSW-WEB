import { AlertTriangle, ClipboardCheck, FileSearch } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { ClassRulePanel } from '@/components/workbench/class-rule-panel';
import { buildAuditHref } from '@/components/workbench/audit/presentation';
import { WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getTeacherAnalytics, getTeacherAuditQueue, getTeacherClassRules } from '@/lib/data/teacher';

export default async function TeacherChatPage() {
  const [analyticsResult, auditResult, classRulesResult] = await Promise.all([
    getTeacherAnalytics(),
    getTeacherAuditQueue(),
    getTeacherClassRules(),
  ]);

  if (!analyticsResult.ok) {
    return (
      <div className="p-6">
        <ErrorState title="教师看板加载失败" description={analyticsResult.message} />
      </div>
    );
  }

  const analytics = analyticsResult.data;
  // 看板只要"待办概览"，取第一页即可；精确的待核实总数用队列返回的 pendingTotal，
  // 不受分页影响——这修掉了此前"只看得到 30 条、其余静默丢失"的问题。
  const groups = auditResult.ok ? auditResult.data.groups : [];
  const auditWorkload = auditResult.ok ? auditResult.data.pendingTotal : analytics.auditWorkload;
  const reviewedCount = analytics.reviewedCount;

  // 分组在服务端已经算好，看板直接复用——此前这一页自己又推了一遍三层嵌套。
  type Row = { classLabel: string; projectName: string; sessionLabel: string; conversationId: string; issueLabels: string[] };
  const rows: Row[] = groups.flatMap((group) => group.students.flatMap((student) => student.projects.flatMap((project) => project.sessions
    .filter((session) => session.issueLabels.length > 0)
    .map((session) => ({ classLabel: group.classLabel, projectName: project.projectName, sessionLabel: session.sessionLabel, conversationId: session.conversationId, issueLabels: session.issueLabels })))));
  const highRiskRows = rows.slice(0, 3);

  const classSummaries = groups.map((group) => {
    const sessions = group.students.flatMap((student) => student.projects.flatMap((project) => project.sessions));
    return {
      classId: group.classId ?? group.classLabel,
      classLabel: group.classLabel,
      pending: sessions.length,
      risk: sessions.filter((session) => session.issueLabels.length > 0).length,
      latest: sessions.reduce((max, session) => (session.updatedAt > max ? session.updatedAt : max), ''),
    };
  }).sort((left, right) => {
    if (right.risk !== left.risk) return right.risk - left.risk;
    return right.latest.localeCompare(left.latest);
  }).slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="教学总览"
        description="查看班级待办，核实 AI 回答。"
        primaryAction={{ label: '学习记录核实', href: '/teacher/audit' }}
        secondaryAction={{ label: '开始备课', href: '/teacher/chat' }}
        metrics={[
          { label: '负责班级', value: analytics.assignedClasses, hint: '你任课的班级' },
          { label: '待核实会话', value: auditWorkload, hint: '等待查看和提交' },
          { label: '已核实会话', value: reviewedCount, hint: '已完成最终提交' },
        ]}
      />

      {!auditResult.ok ? <ErrorState title="学习记录核实队列加载失败" description={auditResult.message} /> : null}

      {auditResult.ok ? <section>
        <Card flushHeader className="overflow-hidden border-destructive/20 bg-card/92 shadow-soft backdrop-blur-xl">
          <CardHeader className="border-b border-destructive/15 bg-destructive/5">
            <CardTitle className="flex items-center gap-2 font-heading">
              <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
              需优先核实
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            {highRiskRows.length === 0 ? <EmptyState title="暂无已标记疑点" description="AI 预审可能漏判，回答仍需教师核实。" /> : null}
            {highRiskRows.map((row) => (
              // 深链到具体会话：此前指向裸 /teacher/audit，教师点进去落在未选中的列表页，等于没点。
              <a key={row.conversationId} href={buildAuditHref({ session: row.conversationId })} className="group block rounded-lg border border-destructive/25 bg-destructive/5 p-4 shadow-soft transition-[border-color,background-color,box-shadow] duration-200 hover:border-destructive/45 hover:bg-destructive/8 hover:shadow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.classLabel} · {row.sessionLabel}</p>
                    <p className="mt-1 text-xs text-muted-foreground">《{row.projectName}》</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground">{row.issueLabels.length} 处疑点</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-destructive/90">{row.issueLabels.join('、')}</p>
              </a>
            ))}
          </CardContent>
        </Card>
      </section> : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {auditResult.ok ? <Card className="border-border/70 bg-card/88 shadow-soft">
          <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><FileSearch className="size-5 text-primary" aria-hidden="true" />班级核实队列</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {classSummaries.length === 0 ? <EmptyState title="暂无待核实会话" description="有待核实会话时，会按疑点数量和时间排在这里。" /> : null}
            {classSummaries.map((summary) => (
              <a key={summary.classId} href="/teacher/audit" className="block rounded-lg border border-border/65 bg-background/78 p-4 shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-background/95 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{summary.classLabel}</p>
                  <Badge variant={summary.risk > 0 ? 'destructive' : 'outline'}>{summary.risk} 条会话有疑点</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">待核实 {summary.pending} 条会话{summary.latest ? ` · 最近学习 ${new Date(summary.latest).toLocaleString('zh-CN')}` : ''}</p>
              </a>
            ))}
          </CardContent>
        </Card> : null}

        <Card className="border-border/70 bg-card/88 shadow-soft">
          <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><ClipboardCheck className="size-5 text-primary" aria-hidden="true" />近 7 天新增会话核实</CardTitle></CardHeader>
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

      <section className="space-y-4">
        {classRulesResult.ok ? (
          <ClassRulePanel classes={classRulesResult.data} />
        ) : (
          <ErrorState title="归类规则加载失败" description={classRulesResult.message} />
        )}
      </section>
    </div>
  );
}
