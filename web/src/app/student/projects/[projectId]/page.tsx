import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BloomBadge, type BloomLevel } from '@/components/workbench/bloom-badge';
import { BloomLadder } from '@/components/workbench/bloom-ladder';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getStudentProject } from '@/lib/data/student';

export default async function StudentProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await getStudentProject(projectId);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <ErrorState title="篇目详情加载失败" description={result.message} />
      </div>
    );
  }

  if (!result.data) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <EmptyState
          title="未找到真实篇目项目"
          description={`项目 ${projectId} 尚未从 Supabase 返回可访问记录。请先在学习提问中创建真实项目。`}
          action={<Button nativeButton={false} render={<Link href="/student/projects">返回篇目项目</Link>} />}
        />
      </div>
    );
  }

  const { project, questions, practices, challengeProgress } = result.data;
  const levels = Object.fromEntries(
    ([1, 2, 3, 4, 5, 6] as BloomLevel[]).map((level) => [
      level,
      {
        questions: questions
          .filter((question) => question.bloom_level === level)
          .map((question) => ({ id: question.id, text: question.content })),
      },
    ]),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="篇目详情"
        title={`《${project.title}》${project.author ? ` · ${project.author}` : ''}`}
        description="这里保留这篇文本下的真实问题、会话与布鲁姆认知路径。项目当前确认层级只以挑战结果为准。"
        primaryAction={{ label: '继续提问', href: `/student?projectId=${project.id}` }}
        secondaryAction={{ label: '返回项目列表', href: '/student/projects' }}
        metrics={[
          { label: '已确认层级', value: challengeProgress.confirmedLevel ? `L${challengeProgress.confirmedLevel}` : '等待挑战确认', hint: '只看挑战确认结果' },
          { label: '问题记录', value: questions.length, hint: '学生真实提问' },
          { label: '挑战记录', value: practices.length, hint: challengeProgress.statusLabel },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>布鲁姆认知路径</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p>这里展示的是这一个项目下，学生在会话里提出过哪些层级的问题。</p>
            <p>它说明“问题触达过哪些层级”，不是最终能力证明；学生看板主统计只使用挑战确认结果。</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>挑战确认状态</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">挑战按 L1→L6 逐层确认。未通过时先标记为待巩固，并引导回到项目继续学习。</p>
            <div className="grid grid-cols-6 gap-2" aria-label="挑战攀登进度">
              {challengeProgress.levels.map((levelProgress) => {
                const level = levelProgress.level as BloomLevel;
                return (
                  <div key={level} className="rounded-lg border bg-background/60 p-2 text-center text-xs">
                    <BloomBadge level={level} />
                    <p className="mt-2 text-muted-foreground">
                      {levelProgress.state === 'achieved' ? '已确认' : levelProgress.state === 'current' ? '下一挑战' : '未解锁'}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">当前状态：{challengeProgress.statusLabel}</p>
              <Button nativeButton={false} render={<Link href={`/student/challenge/${projectId}`}>{challengeProgress.isComplete ? '查看挑战结果' : `继续 L${challengeProgress.nextLevel} 挑战`}</Link>} disabled={false} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button nativeButton={false} render={<Link href={`/cognitive-path/${projectId}`}>查看认知路径详情</Link>} variant="outline" />
      </div>

      <Tabs defaultValue="ladder" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ladder">认知路径</TabsTrigger>
          <TabsTrigger value="questions">问题记录</TabsTrigger>
          <TabsTrigger value="practice">挑战记录</TabsTrigger>
        </TabsList>
        <TabsContent value="ladder">
          <BloomLadder levels={levels} currentMaxLevel={project.highest_bloom_level as BloomLevel | undefined} />
        </TabsContent>
        <TabsContent value="questions">
          <Card>
            <CardHeader><CardTitle>问题记录</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {questions.length === 0 ? <p className="text-sm text-muted-foreground">暂无真实问题记录。</p> : null}
              {questions.map((question) => (
                <p key={question.id} className="rounded-lg border bg-background/60 p-3 text-sm leading-6">{question.content}</p>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="practice">
          <Card>
            <CardHeader><CardTitle>挑战记录</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {practices.length === 0 ? <p className="text-sm text-muted-foreground">暂无挑战记录，先从 L1 开始确认。</p> : null}
              {practices.map((practice) => (
                <p key={practice.id} className="rounded-lg border bg-background/60 p-3 text-sm">
                  L{practice.target_bloom_level} · {practice.evaluation_state}{practice.achieved === true ? ' · 已确认' : practice.achieved === false ? ' · 待巩固' : ''}
                </p>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
