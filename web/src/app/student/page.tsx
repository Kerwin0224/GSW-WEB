import { BookOpen, Brain, MessageSquareText, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StudentChatClient } from '@/components/workbench/student-chat-client';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { PrincipleCard, SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getStudentProjects, getStudentProfileSummary, getStudentWorkspace } from '@/lib/data/student';

export default async function StudentChatPage() {
  const [workspace, projectsResult, profileResult] = await Promise.all([
    getStudentWorkspace(),
    getStudentProjects(),
    getStudentProfileSummary(),
  ]);

  if (!workspace.ok) {
    return (
      <div className="p-6">
        <ErrorState title="学生工作台加载失败" description={workspace.message} />
      </div>
    );
  }

  const projects = projectsResult.ok ? projectsResult.data : [];
  const distribution = profileResult.ok ? profileResult.data.distribution : [];
  const totalBloomRecords = distribution.reduce((sum, item) => sum + item.count, 0);
  const blockedReasons = [workspace.data.providerBlocked, workspace.data.classificationBlocked].filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="学生主线"
        title="把一首诗、一篇文，读到真正懂。"
        description="这里不是刷题大厅，也不是聊天玩具。先提出你卡住的句子，再沉淀成篇目项目，最后沿布鲁姆层级练到能解释、能分析、能表达。"
        primaryAction={{ label: '开始提问', href: '#student-chat' }}
        secondaryAction={{ label: '查看篇目项目', href: '/student/projects' }}
        metrics={[
          { label: '篇目项目', value: projects.length, hint: '只统计真实创建的篇目' },
          { label: '认知记录', value: totalBloomRecords, hint: '来自真实问题与练习' },
          { label: '学习路径', value: '6 层', hint: '记忆到创造，不靠颜色暗示' },
        ]}
      />

      {blockedReasons.length > 0 ? (
        <Alert className="border-destructive/30 bg-destructive/5">
          <Sparkles className="size-4" aria-hidden="true" />
          <AlertTitle className="font-heading">AI 学习链路还没有完全就绪</AlertTitle>
          <AlertDescription>{blockedReasons.join('；')}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <PrincipleCard index="1" title="先问明白" description="学生入口只围绕古诗文疑问展开：字词、句意、手法、情感、迁移表达。" />
        <PrincipleCard index="2" title="归入篇目" description="每次学习都要回到具体诗文，形成可继续追问和练习的项目。" accent="gold" />
        <PrincipleCard index="3" title="练到会用" description="不是给答案就结束，而是沿认知层级推动复述、解释、分析、评价和创作。" accent="cinnabar" />
      </section>

      <section id="student-chat" className="space-y-4 scroll-mt-20">
        <SectionHeader
          eyebrow="learning workspace"
          title="古诗文学习对话"
          description="输入篇目和问题，保留真实对话与学习证据；缺少模型或分类能力时只显示阻塞原因，不伪造结果。"
        />
        <Card className="overflow-hidden border-primary/20 shadow-sm">
          <CardContent className="p-0">
            <StudentChatClient
              providerBlocked={workspace.data.providerBlocked}
              classificationBlocked={workspace.data.classificationBlocked}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5 text-primary" />
              最近篇目
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {projects.slice(0, 3).map((project) => (
              <a key={project.id} href={`/student/projects/${project.id}`} className="block rounded-xl border bg-background/70 p-4 transition hover:border-primary/40 hover:bg-primary/5">
                <p className="font-heading text-lg">{project.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{project.questionCount} 个问题 · {project.practiceCount} 次练习</p>
              </a>
            ))}
            {projects.length === 0 ? (
              <div className="rounded-xl border border-dashed p-5 text-sm leading-6 text-muted-foreground">
                还没有篇目项目。先在上方提出第一个真实问题，系统才会创建项目。
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="size-5 text-primary" />
              下一步怎么学
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/70 p-4">
              <MessageSquareText className="mb-3 size-5 text-primary" />
              <p className="font-medium">把不懂说清楚</p>
              <p className="mt-1 text-sm text-muted-foreground">从一句话、一个典故、一个手法开始。</p>
            </div>
            <div className="rounded-xl bg-muted/70 p-4">
              <BookOpen className="mb-3 size-5 text-primary" />
              <p className="font-medium">回到文本证据</p>
              <p className="mt-1 text-sm text-muted-foreground">每次解释都要能指回原文。</p>
            </div>
            <div className="rounded-xl bg-muted/70 p-4">
              <Sparkles className="mb-3 size-5 text-primary" />
              <p className="font-medium">完成一次表达</p>
              <p className="mt-1 text-sm text-muted-foreground">用自己的话讲明白，才算真正学会。</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
