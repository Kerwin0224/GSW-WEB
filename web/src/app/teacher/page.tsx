import { AlertTriangle, ClipboardCheck, FileSearch, GraduationCap, MessageSquareText } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TeacherChatClient } from '@/components/workbench/teacher-chat-client';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getTeacherAnalytics, getTeacherAuditQueue, getTeacherWorkspace } from '@/lib/data/teacher';

export default async function TeacherChatPage() {
  const [workspace, analyticsResult, auditResult] = await Promise.all([
    getTeacherWorkspace(),
    getTeacherAnalytics(),
    getTeacherAuditQueue(),
  ]);

  if (!workspace.ok) {
    return (
      <div className="p-6">
        <ErrorState title="教师工作台加载失败" description={workspace.message} />
      </div>
    );
  }

  const analytics = analyticsResult.ok ? analyticsResult.data : { assignedClasses: 0, auditWorkload: 0, studentsNeedingReview: 0, reviewedCount: 0 };
  const auditRecords = auditResult.ok ? auditResult.data : [];
  const highRiskRecords = auditRecords.filter((record) => record.preReviewIssues.length > 0).slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="教师看板"
        title="先看学生哪里可能被误导，再决定怎么教。"
        description="看板聚焦学生认知、学习过程纠正与待核实记录。备课不作为任务提醒；需要备课时直接进入教师问答。"
        primaryAction={{ label: '核实学习记录', href: '/teacher/audit' }}
        secondaryAction={{ label: '进入教师问答', href: '#teacher-chat' }}
        metrics={[
          { label: '负责班级', value: analytics.assignedClasses, hint: '只看自己负责范围' },
          { label: '待核实记录', value: auditRecords.length, hint: '完整聊天记录等待确认' },
          { label: '已核实记录', value: analytics.reviewedCount, hint: '教师确认或修订后产生' },
        ]}
      />

      {workspace.data.providerBlocked ? (
        <Alert className="border-destructive/30 bg-destructive/5">
          <GraduationCap className="size-4" aria-hidden="true" />
          <AlertTitle className="font-heading">教学 AI 能力未就绪</AlertTitle>
          <AlertDescription>{workspace.data.providerBlocked}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-5 text-primary" />
              学生认知概览
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p>当前看板以真实学习记录为准，不用装饰性大屏替代证据。</p>
            <p>负责班级：{analytics.assignedClasses} 个；已核实记录：{analytics.reviewedCount} 条。</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="size-5 text-primary" />
              待核实学习记录
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            <p>待核实：{auditRecords.length} 条。教师需要看完整聊天记录后确认无误或保存修订。</p>
            <Button nativeButton={false} render={<a href="/teacher/audit">进入学习记录核实</a>} variant="outline" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              最近高风险记录
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {highRiskRecords.length === 0 ? <EmptyState title="暂无高风险提示" description="AI 预审未发现疑点或预审能力未就绪时，这里保持诚实为空。" /> : null}
            {highRiskRecords.map((record) => (
              <a key={record.id} href="/teacher/audit" className="block rounded-xl border bg-background/70 p-3 hover:border-primary/40">
                <p className="font-medium">{record.studentName} · 《{record.projectTitle}》</p>
                <p className="mt-1 text-xs text-muted-foreground">{record.preReviewIssues.map((issue) => issue.label).join('、')}</p>
              </a>
            ))}
          </CardContent>
        </Card>
      </section>

      <section id="teacher-chat" className="space-y-4 scroll-mt-20">
        <SectionHeader
          eyebrow="teaching Q&A"
          title="教师问答"
          description="需要备课、追问误区或设计课堂引导时，直接进入教师问答。"
        />
        <Card className="overflow-hidden border-primary/20 shadow-sm">
          <CardContent className="p-0">
            <TeacherChatClient presets={workspace.data.presets} providerBlocked={workspace.data.providerBlocked} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquareText className="size-5 text-primary" />课堂提问抓手</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">从“这句什么意思”升级到“为什么这样写、还能怎样表达”。</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileSearch className="size-5 text-primary" />学习过程纠正</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">对可能误导学生的回答，直接在回答气泡中修订，学生侧只看到修订版。</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" />可信闭环</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">确认无误和保存修订都来自真实记录，后台会自然形成可治理数据。</CardContent>
        </Card>
      </section>
    </div>
  );
}
