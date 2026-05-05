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
  if (!result.ok) return <div className="p-6"><ErrorState title="学习画像加载失败" description={result.message} /></div>;
  const { distribution, projects } = result.data;
  const hasRecords = distribution.some((item) => item.count > 0);
  const totalQuestions = projects.reduce((sum, p) => sum + p.questionCount, 0);
  const totalPractices = projects.reduce((sum, p) => sum + p.practiceCount, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="个人中心"
        title="看见自己是怎么读懂古诗文的。"
        description="画像只基于真实问题与练习记录生成，不做排名，不做惩罚性评分，只回答下一步应该怎么学。"
        primaryAction={{ label: '继续提问', href: '/student' }}
        secondaryAction={{ label: '查看全部篇目', href: '/student/projects' }}
        metrics={[
          { label: '篇目项目', value: projects.length, hint: '真实学习项目' },
          { label: '提问记录', value: totalQuestions, hint: '学生提出的问题' },
          { label: '练习记录', value: totalPractices, hint: '已保存练习' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="我的篇目"
          description="按最近学习排序，点击卡片查看认知路径详情。"
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
              title="暂无认知画像"
              description="完成真实提问和练习评估后，这里会显示跨项目的层级分布与下一步建议。"
              action={<Button nativeButton={false} render={<Link href="/student">去提问</Link>} />}
            />
          )}
          {hasRecords ? <CognitiveProfileRadar distribution={distribution} /> : null}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
            {distribution.map((item) => (
              <div key={item.level} className="rounded-xl border bg-background/60 p-3 text-center">
                <BloomBadge level={item.level} />
                <p className="mt-2 text-2xl font-semibold">{item.count}</p>
                <p className="text-xs text-muted-foreground">真实记录</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
