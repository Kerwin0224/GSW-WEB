import Link from 'next/link';
import { AlertTriangle, BarChart3, ClipboardCheck, UsersRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getTeacherAnalytics } from '@/lib/data/teacher';

export default async function TeacherAnalyticsPage() {
  const result = await getTeacherAnalytics();
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="学情线索加载失败" description={result.message} />
      </div>
    );
  }

  const { weeklyAuditCoverage, stuckStudents, weakProjects } = result.data;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="可行动学情"
        title="下一节课先看哪里卡住。"
        description="教师看板只呈现能行动的班级线索：低阶卡住的学生、薄弱篇目和本周审计覆盖。v1 不做热力图。"
        primaryAction={{ label: '处理审计队列', href: '/teacher/audit' }}
        secondaryAction={{ label: '回到备课对话', href: '/teacher#teacher-chat' }}
        metrics={[
          { label: '负责班级', value: result.data.assignedClasses, hint: '由班级关系决定' },
          { label: '审计待办', value: result.data.auditWorkload, hint: 'pending audit_records' },
          { label: '需复盘学生', value: result.data.studentsNeedingReview, hint: 'L1-L2 未达成排行' },
        ]}
      />

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr_24rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading">
              <UsersRound className="size-5 text-primary" />
              Top 5 卡住学生
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stuckStudents.length === 0 ? (
              <EmptyState title="暂无低阶卡住学生" description="只有真实练习记录显示 L1-L2 未达成后，这里才会出现复盘对象。" />
            ) : stuckStudents.map((student, index) => (
              <div key={student.studentId} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{index + 1}</Badge>
                    <p className="truncate font-medium">{student.studentName}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{student.className} · L1-L2 未达成 {student.lowLevelAttempts}/{student.attempts}</p>
                </div>
                <Button nativeButton={false} render={<Link href={student.auditHref}>看对话</Link>} variant="outline" size="sm" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading">
              <AlertTriangle className="size-5 text-destructive" />
              Top 5 薄弱篇目
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {weakProjects.length === 0 ? (
              <EmptyState title="暂无薄弱篇目排行" description="当真实练习出现未达成或失败评估后，这里按薄弱率排序。" />
            ) : weakProjects.map((project, index) => (
              <div key={project.projectId} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">#{index + 1}</Badge>
                      <p className="truncate font-medium">{project.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{project.className} · 未达成 {project.notAchieved}/{project.attempts}</p>
                  </div>
                  <Button nativeButton={false} render={<Link href={project.auditHref}>定位</Link>} variant="outline" size="sm" />
                </div>
                <Progress value={project.weakRate} className="mt-3" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading">
              <ClipboardCheck className="size-5 text-primary" />
              本周审计覆盖
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-5xl font-semibold tracking-tight">{weeklyAuditCoverage.coveragePercent}%</p>
              <p className="mt-2 text-sm text-muted-foreground">已处理 / 本周候选 assistant 回答</p>
            </div>
            <Progress value={weeklyAuditCoverage.coveragePercent} />
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg border p-2"><p className="font-semibold">{weeklyAuditCoverage.audited}</p><p className="text-xs text-muted-foreground">已审</p></div>
              <div className="rounded-lg border p-2"><p className="font-semibold">{weeklyAuditCoverage.pending}</p><p className="text-xs text-muted-foreground">待办</p></div>
              <div className="rounded-lg border p-2"><p className="font-semibold">{weeklyAuditCoverage.eligible}</p><p className="text-xs text-muted-foreground">候选</p></div>
            </div>
            <Button nativeButton={false} render={<Link href="/teacher/audit">进入审计三栏</Link>} className="w-full" />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="跨页行动"
          description="从学情进入具体审计筛选，从审计回到备课对话，保持教师的下一课准备闭环。"
          action={<Button nativeButton={false} render={<Link href="/teacher/instructions"><BarChart3 />编辑教学预设</Link>} variant="outline" />}
        />
      </section>
    </div>
  );
}
