import { ClipboardCheck, FileSearch, GraduationCap, MessageSquareText } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TeacherChatClient } from '@/components/workbench/teacher-chat-client';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { PrincipleCard, SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
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

  const analytics = analyticsResult.ok ? analyticsResult.data : { assignedClasses: 0, auditWorkload: 0, studentsNeedingReview: 0 };
  const auditCount = auditResult.ok ? auditResult.data.length : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="教师主线"
        title="把古诗文课，教到学生真的会。"
        description="教师端只服务三件事：备好一堂课、追问一个误区、沉淀一条可审计的高质量教学样本。少一点系统黑话，多一点课堂可用。"
        primaryAction={{ label: '开始备课对话', href: '#teacher-chat' }}
        secondaryAction={{ label: '查看审计队列', href: '/teacher/audit' }}
        metrics={[
          { label: '已发布预设', value: workspace.data.presets.length, hint: '管理员发布后可用于课堂' },
          { label: '班级范围', value: analytics.assignedClasses, hint: '只看自己负责的班级' },
          { label: '待审样本', value: auditCount, hint: '用于 SFT / DPO 质量闭环' },
        ]}
      />

      {workspace.data.providerBlocked ? (
        <Alert className="border-destructive/30 bg-destructive/5">
          <GraduationCap className="size-4" aria-hidden="true" />
          <AlertTitle className="font-heading">教学 AI 能力未就绪</AlertTitle>
          <AlertDescription>{workspace.data.providerBlocked}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <PrincipleCard index="备" title="备课先定目标" description="围绕一篇文本、一节课、一类学生误区，生成可直接用于课堂的引导。" />
        <PrincipleCard index="问" title="追问要有层级" description="教师不是要标准答案，而是要能把学生从会背带到会分析。" accent="gold" />
        <PrincipleCard index="审" title="好样本要沉淀" description="课堂中真正有价值的 AI 输出，进入审计与数据集闭环。" accent="cinnabar" />
      </section>

      <section id="teacher-chat" className="space-y-4 scroll-mt-20">
        <SectionHeader
          eyebrow="teaching workspace"
          title="教学对话"
          description="先选择学校发布的教学预设，再围绕篇目、年级、误区或练习目标发起对话。"
        />
        <Card className="overflow-hidden border-primary/20 shadow-sm">
          <CardContent className="p-0">
            <TeacherChatClient presets={workspace.data.presets} providerBlocked={workspace.data.providerBlocked} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareText className="size-5 text-primary" />
              课堂提问抓手
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">
            从“这句什么意思”升级到“为什么这样写、还能怎样表达”。教师端默认服务课堂追问，而不是泛泛聊天。
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="size-5 text-primary" />
              审计闭环
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">
            待审计回答：{auditCount} 条。只有教师认可的样本才进入导出，避免把垃圾答案训练进系统。
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-5 text-primary" />
              学情行动
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">
            已绑定班级：{analytics.assignedClasses} 个。后续学情只展示可行动线索，不做装饰性大屏。
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
