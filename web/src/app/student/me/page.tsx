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
        eyebrow="学生看板"
        title="看见自己在不同篇目上的挑战确认结果。"
        description="看板主统计只使用挑战确认后的布鲁姆结果；学生问题的布鲁姆认知路径反馈只作为挑战参考。"
        primaryAction={{ label: '继续提问', href: '/student' }}
        secondaryAction={{ label: '进入挑战确认', href: '/student/challenge' }}
        metrics={[
          { label: '项目', value: projects.length, hint: '真实学习项目' },
          { label: '提问记录', value: totalQuestions, hint: '学生提出的问题' },
          { label: '等待挑战确认', value: awaitingChallengeCount, hint: '尚无确认层级的项目' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="我的项目"
          description="项目卡片只展示项目级概览与挑战状态，点击后直接进入该项目的新会话空白状态。"
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
          <CardTitle>布鲁姆认知攀登进度</CardTitle>
          <CardDescription>每行对应一个项目，六列对应 L1 到 L6 的挑战确认状态。</CardDescription>
        </CardHeader>
        <CardContent>
          {hasRecords ? null : (
            <EmptyState
              title="等待挑战确认"
              description="完成挑战后，这里会展示各项目的 L1 到 L6 攀登进度；在此之前，学生问题的布鲁姆认知路径反馈只作为挑战参考。"
              action={<Button nativeButton={false} render={<Link href="/student/challenge">去挑战</Link>} />}
            />
          )}
          {hasRecords ? <CognitiveProfileMatrix rows={projectBloomMatrix} /> : null}
          <div className="mt-6 rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">已确认项目分布</p>
              <p className="text-xs text-muted-foreground">按项目最高确认层级计数</p>
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
          <p className="mt-3 text-xs text-muted-foreground">累计挑战记录 {totalChallenges} 条；矩阵展示项目攀登状态，分布只按项目最高确认层级计数。</p>
        </CardContent>
      </Card>
    </div>
  );
}
