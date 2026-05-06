import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { ProjectCard } from '@/components/workbench/project-card';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getStudentProjects } from '@/lib/data/student';

export default async function StudentProjectsPage() {
  const result = await getStudentProjects();
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="项目加载失败" description={result.message} />
      </div>
    );
  }

  const projects = result.data;
  const questionCount = projects.reduce((sum, project) => sum + project.questionCount, 0);
  const challengeAttemptCount = projects.reduce((sum, project) => sum + project.challengeProgress.attemptedCount, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="篇目项目"
        title="每一次提问，都要回到具体篇目。"
        description="项目页沉淀真实学习记录：你问过什么、形成了怎样的布鲁姆认知路径、挑战又确认到了哪一层。"
        primaryAction={{ label: '回到学习提问', href: '/student' }}
        metrics={[
          { label: '篇目', value: projects.length, hint: '真实项目' },
          { label: '问题', value: questionCount, hint: '学生提出的问题' },
          { label: '挑战尝试', value: challengeAttemptCount, hint: '用于确认认知水平' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="我的篇目项目"
          description="按篇目沉淀问题、会话、布鲁姆认知路径与挑战确认结果。"
          action={(
            <Select defaultValue="recent">
              <SelectTrigger className="w-44"><SelectValue aria-label="项目排序" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">最近学习</SelectItem>
                <SelectItem value="depth">已确认层级</SelectItem>
                <SelectItem value="count">问题数量</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {projects.length === 0 ? (
          <EmptyState
            title="还没有篇目项目"
            description="提出第一个古诗文问题后，系统会按真实篇目保存学习记录；没有真实记录时不显示示例项目。"
            action={<Button nativeButton={false} render={<Link href="/student">开始提问</Link>} />}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
          </div>
        )}
      </section>
    </div>
  );
}
