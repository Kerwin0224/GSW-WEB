import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkspaceHero, SectionHeader } from '@/components/workbench/workspace-hero';
import { BloomBadge } from '@/components/workbench/bloom-badge';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { ProjectCard } from '@/components/workbench/project-card';
import { getStudentProfileSummary } from '@/lib/data/student';
import { CognitiveProfileMatrix } from './cognitive-profile-matrix';

export default async function StudentProfilePage() {
  const result = await getStudentProfileSummary();
  if (!result.ok) return <div className="p-6"><ErrorState title="学习看板加载失败" description={result.message} /></div>;
  const { distribution, projectBloomMatrix, projects, awaitingChallengeCount } = result.data;
  const hasRecords = projectBloomMatrix.length > 0;
  const totalQuestions = projects.reduce((sum, p) => sum + p.questionCount, 0);
  const totalChallenges = projects.reduce((sum, p) => sum + p.practiceCount, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="我的学习"
        title="看看自己的学习足迹。"
        description="每个篇目学到了第几层、下一步挑战什么，这里都能看到。层级由挑战确认产生。"
        primaryAction={{ label: '继续提问', href: '/student' }}
        secondaryAction={{ label: '去挑战确认', href: '/student/challenge' }}
        metrics={[
          { label: '项目', value: projects.length, hint: '正在学习的篇目' },
          { label: '提问记录', value: totalQuestions, hint: '累计提问次数' },
          { label: '等待挑战确认', value: awaitingChallengeCount, hint: '还没有确认层级的项目' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="我的项目"
          description="点击项目，直接开始新的提问。"
        />
        {projects.length === 0 ? (
          <EmptyState
            title="还没有项目"
            description="提出第一个古诗文问题后，系统会按真实篇目保存学习记录；没有真实记录时不显示示例项目。"
            action={<Button nativeButton={false} render={<Link href="/student">开始提问</Link>} />}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>认知攀登进度</CardTitle>
          <CardDescription>每一行是一个篇目，从 L1 记忆到 L6 创造，看你登到了第几层。</CardDescription>
        </CardHeader>
        <CardContent>
          {hasRecords ? null : (
            <EmptyState
              title="等待第一次挑战"
              description="完成第一次挑战后，这里会出现你的攀登路线图。"
              action={<Button nativeButton={false} render={<Link href="/student/challenge">去挑战</Link>} />}
            />
          )}
          {hasRecords ? <CognitiveProfileMatrix rows={projectBloomMatrix} /> : null}
          <div className="mt-6 rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">已确认项目分布</p>
              <p className="text-xs text-muted-foreground">按最高确认层级统计</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {distribution.map((item) => (
                <div key={item.level} className="flex flex-col items-center gap-2 rounded-md px-2 py-3 transition-colors hover:bg-muted/40">
                  <BloomBadge level={item.level} />
                  <p className="font-heading text-2xl tabular-nums">{item.count}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">累计挑战 {totalChallenges} 次。</p>
        </CardContent>
      </Card>
    </div>
  );
}
