import Link from 'next/link';
import { AlertTriangle, ChevronRight, ClipboardCheck, Download, FileSearch } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SpacePanel } from '@/components/workbench/space-panel';
import { buildAuditHref } from '@/components/workbench/audit/presentation';
import { WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getProfile } from '@/lib/auth';
import { getTeacherAnalytics, getTeacherAuditQueue, getTeacherClasses } from '@/lib/data/teacher';
import { listTeacherSpaces, listTeacherStudentOptions } from '@/lib/data/spaces';
import { listSpaceSettings, listSubjectOptions } from '@/lib/data/space-settings';
import { listTeacherClassStages } from '@/lib/data/class-stages';

export default async function TeacherChatPage() {
  const [profile, analyticsResult, auditResult, teacherClassesResult, spacesResult, studentOptionsResult, classStagesResult] = await Promise.all([
    getProfile(),
    getTeacherAnalytics(),
    getTeacherAuditQueue(),
    getTeacherClasses(),
    listTeacherSpaces(),
    listTeacherStudentOptions(),
    listTeacherClassStages(),
  ]);
  const spaces = spacesResult.ok ? spacesResult.data : [];
  // 空间级配置（科目词表绑定、首屏追问示例）不在 TeacherSpace 形状里，另读一次窄列。
  const [subjectOptionsResult, spaceSettingsResult] = await Promise.all([
    listSubjectOptions(),
    listSpaceSettings(spaces.map((space) => space.id)),
  ]);

  if (!analyticsResult.ok) {
    return (
      <div className="p-6">
        <ErrorState title="教师看板加载失败" description={analyticsResult.message} />
      </div>
    );
  }

  const analytics = analyticsResult.data;
  const groups = auditResult.ok ? auditResult.data.groups : [];
  // 两个总数都取自队列的精确计数（pendingTotal / finalizedTotal），不受分页影响。
  // 队列加载失败时才回落到 analytics 的采样值，并在界面上写明那是近 500 条样本。
  const auditWorkload = auditResult.ok ? auditResult.data.pendingTotal : analytics.auditWorkload;
  const reviewedCount = auditResult.ok ? auditResult.data.finalizedTotal : analytics.reviewedCount;
  const totalsAreExact = auditResult.ok;
  const totalsNote = totalsAreExact
    ? '「待核实会话」与「已核实会话」是精确总数，不受队列分页影响。'
    : '核实队列加载失败，这两个总数退回到最近 500 条 AI 回答的样本统计，可能小于实际值。';

  // 分组在服务端已经算好，看板直接复用——此前这一页自己又推了一遍三层嵌套。
  type Row = { classLabel: string; projectName: string; sessionLabel: string; conversationId: string; issueLabels: string[] };
  const rows: Row[] = groups.flatMap((group) => group.students.flatMap((student) => student.projects.flatMap((project) => project.sessions
    .filter((session) => session.issueLabels.length > 0)
    .map((session) => ({ classLabel: group.classLabel, projectName: project.projectName, sessionLabel: session.sessionLabel, conversationId: session.conversationId, issueLabels: session.issueLabels })))));
  const highRiskRows = rows.slice(0, 3);

  // 疑点与班级卡只吃队列第一页（pageSize 20），「共 N 条」必须说清是哪一段。
  const pagedSessionCount = groups.reduce((sum, group) => sum + group.students.reduce((studentSum, student) => studentSum + student.projects.reduce((projectSum, project) => projectSum + project.sessions.length, 0), 0), 0);
  const pageCaliberNote = auditResult.ok ? `疑点与班级卡统计自待核实队列的第一页（共 ${pagedSessionCount} 条会话）。` : '';

  // 学段分组：跨学段任教时班名会撞（「高一(3)班」与「初三(3)班」都叫 (3) 班），
  // 没有行政班的会话也必须有自己的分组，不能从看板上消失。
  const stageByClassId = new Map((classStagesResult.ok ? classStagesResult.data : []).map((klass) => [klass.classId, klass.stage ?? '未标学段']));
  const classSummaries = groups.map((group) => {
    const sessions = group.students.flatMap((student) => student.projects.flatMap((project) => project.sessions));
    return {
      classId: group.classId ?? group.classLabel,
      classLabel: group.classLabel,
      stage: group.classId ? (stageByClassId.get(group.classId) ?? '未标学段') : '无行政班',
      pending: sessions.length,
      risk: sessions.filter((session) => session.issueLabels.length > 0).length,
      latest: sessions.reduce((max, session) => (session.updatedAt > max ? session.updatedAt : max), ''),
    };
  }).sort((left, right) => {
    if (right.risk !== left.risk) return right.risk - left.risk;
    return right.latest.localeCompare(left.latest);
  });
  const classSummaryTotal = groups.length;
  const visibleClassSummaries = classSummaries.slice(0, 4);
  const stageSummaries = [...new Set(classSummaries.map((summary) => summary.stage))].map((stage) => ({
    stage,
    classes: classSummaries.filter((summary) => summary.stage === stage).length,
    pending: classSummaries.filter((summary) => summary.stage === stage).reduce((sum, summary) => sum + summary.pending, 0),
    risk: classSummaries.filter((summary) => summary.stage === stage).reduce((sum, summary) => sum + summary.risk, 0),
  })).sort((left, right) => right.pending - left.pending);

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

      <p className="text-xs leading-5 text-muted-foreground">{totalsNote}</p>

      {!auditResult.ok ? <ErrorState title="学习记录核实队列加载失败" description={auditResult.message} /> : null}

      {auditResult.ok ? <section>
        <Card flushHeader className="overflow-hidden border-destructive/20 bg-card/92 shadow-soft backdrop-blur-xl">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b border-destructive/15 bg-destructive/5">
            <CardTitle className="flex items-center gap-2 font-heading">
              <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
              需优先核实
            </CardTitle>
            {rows.length > highRiskRows.length ? (
              <Link href="/teacher/audit" className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">
                进核实队列继续处理
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            {highRiskRows.length === 0 ? <EmptyState title="暂无已标记疑点" description="AI 预审可能漏判，回答仍需教师核实。" /> : null}
            {highRiskRows.map((row) => (
              // 深链到具体会话：此前指向裸 /teacher/audit，教师点进去落在未选中的列表页，等于没点。
              <Link key={row.conversationId} href={buildAuditHref({ session: row.conversationId })} className="group block rounded-lg border border-destructive/25 bg-destructive/5 p-4 shadow-soft transition-[border-color,background-color,box-shadow] duration-200 hover:border-destructive/45 hover:bg-destructive/8 hover:shadow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.classLabel} · {row.sessionLabel}</p>
                    <p className="mt-1 text-xs text-muted-foreground">《{row.projectName}》</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground">{row.issueLabels.length} 处疑点</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-destructive/90">{row.issueLabels.join('、')}</p>
              </Link>
            ))}
            {rows.length > highRiskRows.length ? <p className="text-xs leading-5 text-muted-foreground">共 {rows.length} 条带疑点的会话，这里显示最近 {highRiskRows.length} 条。</p> : null}
          </CardContent>
        </Card>
      </section> : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {auditResult.ok ? <Card className="border-border/70 bg-card/88 shadow-soft">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 font-heading"><FileSearch className="size-5 text-primary" aria-hidden="true" />班级核实队列</CardTitle>
            {classSummaryTotal > visibleClassSummaries.length ? (
              <Link href="/teacher/audit" className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">
                本班之外还有 {classSummaryTotal - visibleClassSummaries.length} 个班级，进队列查看
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {stageSummaries.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {stageSummaries.map((summary) => (
                  <Badge key={summary.stage} variant="outline">
                    {summary.stage}：{summary.classes} 个班级 · 待核实 {summary.pending} 条{summary.risk > 0 ? ` · 疑点 ${summary.risk}` : ''}
                  </Badge>
                ))}
              </div>
            ) : null}
            {classSummaries.length === 0 ? <EmptyState title="暂无待核实会话" description="有待核实会话时，会按疑点数量和时间排在这里。" /> : null}
            {visibleClassSummaries.map((summary) => (
              <Link key={summary.classId} href="/teacher/audit" className="block rounded-lg border border-border/65 bg-background/78 p-4 transition-[border-color,background-color] duration-200 hover:border-primary/35 hover:bg-background/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{summary.classLabel}</p>
                  <Badge variant={summary.risk > 0 ? 'destructive' : 'outline'}>{summary.risk} 条会话有疑点</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="mr-2 rounded bg-muted/60 px-1.5 py-0.5">{summary.stage}</span>
                  待核实 {summary.pending} 条会话{summary.latest ? ` · 最近学习 ${new Date(summary.latest).toLocaleString('zh-CN')}` : ''}
                </p>
              </Link>
            ))}
            {classSummaryTotal > visibleClassSummaries.length ? <p className="text-xs leading-5 text-muted-foreground">共 {classSummaryTotal} 个有待核实会话的分组，这里显示前 {visibleClassSummaries.length} 个。</p> : null}
          </CardContent>
        </Card> : null}

        <Card className="border-border/70 bg-card/88 shadow-soft">
          <CardHeader><CardTitle className="flex items-center gap-2 font-heading"><ClipboardCheck className="size-5 text-primary" aria-hidden="true" />近 7 天新增会话核实</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-primary/20 bg-primary/6 p-4">
              <p className="text-xs text-muted-foreground">近 7 天新增会话已核实占比</p>
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
            <p className="text-xs leading-5 text-muted-foreground sm:col-span-3">
              {pageCaliberNote}
              {' '}这三项按「最近 500 条 AI 回答」统计：一周内新增超过 500 条回答时，早于样本的会话不计入。
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <Card className="border-border/70 bg-card/88 shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading"><Download className="size-5 text-primary" aria-hidden="true" />导出我核实过的记录</CardTitle>
            <CardDescription>
              导出范围：你任教班级与自己拥有的空间里，教师已最终确认的回答。含班级、学生、项目、会话、结论、修订前后正文、核实时间与评价维度键；不含尚未核实的会话，也不含其他教师的核实记录。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* 纯 GET 表单：不引客户端状态，选完班级直接下载。 */}
            <form method="get" action="/api/exports/portability/teacher" className="flex flex-wrap items-center gap-2">
              <label htmlFor="teacher-export-class" className="text-xs text-muted-foreground">范围</label>
              <select id="teacher-export-class" name="classId" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">全部范围</option>
                {(classStagesResult.ok ? classStagesResult.data : []).map((klass) => (
                  <option key={klass.classId} value={klass.classId}>{klass.stage ? `${klass.stage} · ` : ''}{klass.className}</option>
                ))}
              </select>
              <Button type="submit" variant="outline" size="sm" className="cursor-pointer">
                <Download className="mr-1.5 size-3.5" aria-hidden="true" />下载 CSV
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">无行政班的学生（1v1、成人学习等）不在班级下拉里，但只要会话落在你拥有的空间里，就包含在「全部范围」中。</p>
          </CardContent>
        </Card>

        {spacesResult.ok ? (
          <SpacePanel
            spaces={spacesResult.data}
            classes={teacherClassesResult.ok ? teacherClassesResult.data : []}
            studentOptions={studentOptionsResult.ok ? studentOptionsResult.data : []}
            defaultSubject={profile?.subject ?? ''}
            subjectOptions={subjectOptionsResult.ok ? subjectOptionsResult.data : []}
            spaceSettings={spaceSettingsResult.ok ? spaceSettingsResult.data : {}}
          />
        ) : (
          <ErrorState title="学习空间加载失败" description={spacesResult.message} />
        )}
      </section>
    </div>
  );
}
