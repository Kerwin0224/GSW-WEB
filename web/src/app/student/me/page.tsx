import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkspaceHero, SectionHeader } from '@/components/workbench/workspace-hero';
import { BloomBadge } from '@/components/workbench/bloom-badge';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { ProjectCard } from '@/components/workbench/project-card';
import { getStudentProfileSummary } from '@/lib/data/student';
import { CognitiveProfileRadar } from './cognitive-profile-radar';

export default async function StudentProfilePage() {
  const result = await getStudentProfileSummary();
  if (!result.ok) return <div className="p-6"><ErrorState title="学习看板加载失败" description={result.message} /></div>;
  const { distribution, projects, awaitingChallengeCount } = result.data;
  const hasRecords = distribution.some((item) => item.count > 0);
  const totalQuestions = projects.reduce((sum, p) => sum + p.questionCount, 0);
  const totalChallenges = projects.reduce((sum, p) => sum + p.practiceCount, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="学生看板"
        title="看见自己在不同篇目上的挑战确认结果。"
        description="看板主统计只使用挑战确认后的布鲁姆结果；会话推断出的认知路径留在项目内作为轻量反馈。"
        primaryAction={{ label: '继续提问', href: '/student' }}
        secondaryAction={{ label: '查看全部篇目', href: '/student/projects' }}
        metrics={[
          { label: '篇目项目', value: projects.length, hint: '真实学习项目' },
          { label: '提问记录', value: totalQuestions, hint: '学生提出的问题' },
          { label: '等待挑战确认', value: awaitingChallengeCount, hint: '尚无确认层级的项目' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="我的篇目项目"
          description="按最近学习排序，点击卡片查看项目内的认知路径与挑战确认状态。"
        />
        {projects.length === 0 ? (
          <EmptyState
            title="还没有篇目项目"
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
        <CardHeader><CardTitle>布鲁姆认知分布</CardTitle></CardHeader>
        <CardContent>
          {hasRecords ? null : (
            <EmptyState
              title="等待挑战确认"
              description="完成挑战后，这里才会把项目计入看板主统计；在此之前，你仍可在项目页查看会话里的认知路径。"
              action={<Button nativeButton={false} render={<Link href="/student/challenge">去挑战</Link>} />}
            />
          )}
          {hasRecords ? <CognitiveProfileRadar distribution={distribution} /> : null}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
            {distribution.map((item) => (
              <div key={item.level} className="rounded-lg border bg-background/60 p-3 text-center">
                <BloomBadge level={item.level} />
                <p className="mt-2 text-2xl font-semibold">{item.count}</p>
                <p className="text-xs text-muted-foreground">已确认项目</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">累计挑战记录 {totalChallenges} 条，但只有通过挑战确认的项目会进入上方主统计。</p>
        </CardContent>
      </Card>
    </div>
  );
}
