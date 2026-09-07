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
        title="学习记录"
        description="按篇目查看提问记录、挑战练习和已经通过的层级。"
        primaryAction={{ label: '学习提问', href: '/student' }}
        secondaryAction={{ label: '挑战练习', href: '/student/challenge' }}
        metrics={[
          { label: '篇目', value: projects.length, hint: '有学习记录的篇目' },
          { label: '提问记录', value: totalQuestions, hint: '累计提问次数' },
          { label: '挑战记录', value: totalChallenges, hint: '累计生成的挑战题' },
          { label: '尚未通过', value: awaitingChallengeCount, hint: '还没有通过挑战的篇目' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="我的篇目"
          description="选择篇目，开始新的学习提问。"
        />
        {projects.length === 0 ? (
          <EmptyState
            title="还没有篇目记录"
            description="提出第一个古诗文问题后，学习记录会按识别到的篇目保存。"
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
          <CardTitle>篇目挑战进度</CardTitle>
          <CardDescription>每一行对应一个篇目，显示 L1 到 L6 的挑战通过情况。</CardDescription>
        </CardHeader>
        <CardContent>
          {hasRecords ? null : (
            <EmptyState
              title="等待第一次挑战"
              description="完成第一次挑战后，这里会出现各层级的通过情况。"
              action={<Button nativeButton={false} render={<Link href="/student/challenge">去挑战</Link>} />}
            />
          )}
          {hasRecords ? <CognitiveProfileMatrix rows={projectBloomMatrix} /> : null}
          <div className="mt-6 rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">已通过层级分布</p>
              <p className="text-xs text-muted-foreground">按各篇目最高通过层级统计</p>
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
        </CardContent>
      </Card>
    </div>
  );
}
