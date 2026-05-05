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
        description="这里保留这篇文本的真实问题、练习与认知路径。没有真实分类时，就明确显示尚未分类。"
        primaryAction={{ label: '继续提问', href: '/student' }}
        secondaryAction={{ label: '返回项目列表', href: '/student/projects' }}
        metrics={[
          { label: '最高层级', value: project.highest_bloom_level ? `L${project.highest_bloom_level}` : '未分类', hint: '来自真实 Bloom 分类' },
          { label: '问题记录', value: questions.length, hint: '学生真实提问' },
          { label: '练习记录', value: practices.length, hint: `挑战已达标 ${challengeProgress.completedLevels}/6` },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>对话画像</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p>问题记录来自学生在本项目下的真实提问，用来观察认知路径和层级分布。</p>
            <p>它说明“提问触达过哪些 Bloom 层级”，不是最终能力证明。</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>挑战核查与攀升</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">挑战按 L1→L6 出题核查，当前解锁 L{challengeProgress.currentLevel}；未达标会停留当前层，达标后才进入下一层。</p>
            <div className="grid grid-cols-6 gap-2" aria-label="挑战攀升进度">
              {challengeProgress.levels.map((levelProgress) => {
                const level = levelProgress.level as BloomLevel;
                return (
                  <div key={level} className="rounded-lg border bg-background/60 p-2 text-center text-xs">
                    <BloomBadge level={level} />
                    <p className="mt-2 text-muted-foreground">
                      {levelProgress.state === 'achieved' ? '已达标' : levelProgress.state === 'current' ? '当前' : '未解锁'}
                    </p>
                  </div>
                );
              })}
            </div>
            <Button nativeButton={false} render={<Link href={`/student/challenge/${projectId}`}>进入 L{challengeProgress.currentLevel} 挑战</Link>} disabled={challengeProgress.isComplete} />
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
          <TabsTrigger value="practice">练习记录</TabsTrigger>
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
            <CardHeader><CardTitle>练习记录</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {practices.length === 0 ? <p className="text-sm text-muted-foreground">暂无真实练习记录。</p> : null}
              {practices.map((practice) => (
                <p key={practice.id} className="rounded-lg border bg-background/60 p-3 text-sm">
                  L{practice.target_bloom_level} · {practice.evaluation_state}
                </p>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
