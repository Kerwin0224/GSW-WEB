import { Route, Swords } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BloomBadge, type BloomLevel } from '@/components/workbench/bloom-badge';
import { BlockedState, EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getStudentProjects, getStudentWorkspace } from '@/lib/data/student';

function nextLevel(level?: BloomLevel): BloomLevel {
  if (!level) return 1;
  return Math.min(level + 1, 6) as BloomLevel;
}

export default async function ChallengePage({ searchParams }: { searchParams?: Promise<{ projectId?: string }> }) {
  const params = await searchParams;
  const [workspace, projectsResult] = await Promise.all([getStudentWorkspace(), getStudentProjects()]);
  if (!workspace.ok) return <div className="p-6"><ErrorState title="挑战入口加载失败" description={workspace.message} /></div>;
  if (!projectsResult.ok) return <div className="p-6"><ErrorState title="项目挑战加载失败" description={projectsResult.message} /></div>;

  const projects = projectsResult.data;
  const selectedProject = projects.find((project) => project.id === params?.projectId) ?? projects[0];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="层级挑战"
        title="挑战才真正确认你是否学会。"
        description="对话只能初步判断认知；挑战基于真实篇目项目与历史问题，沿布鲁姆层级从低到高攀登。"
        primaryAction={{ label: '回到学习提问', href: '/student' }}
        secondaryAction={{ label: '查看篇目项目', href: '/student/projects' }}
        metrics={[
          { label: '项目', value: projects.length, hint: '可挑战篇目' },
          { label: '已尝试挑战', value: projects.reduce((sum, project) => sum + project.challengeProgress.attemptedCount, 0), hint: 'practice_records' },
          { label: '已达成', value: projects.reduce((sum, project) => sum + project.challengeProgress.achievedCount, 0), hint: '真实评估结果' },
        ]}
      />

      {workspace.data.challengeBlocked ? (
        <BlockedState title="练习生成与评估被阻塞" description={workspace.data.challengeBlocked} />
      ) : null}

      <section className="space-y-4">
        <SectionHeader eyebrow="project challenge wall" title="项目挑战卡片墙" description="选择一个篇目进入认知攀登路线。每张卡只展示真实问题与挑战计数。" />
        {projects.length === 0 ? (
          <EmptyState title="暂无可挑战项目" description="先在学习提问中产生真实篇目项目，再进入挑战确认认知水平。" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Card key={project.id} className={selectedProject?.id === project.id ? 'border-primary/60 bg-primary/5' : undefined}>
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-3 font-heading">
                    <span>《{project.title}》</span>
                    {project.highestLevel ? <BloomBadge level={project.highestLevel} /> : <Badge variant="outline">未分类</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <p>{project.questionCount} 个历史问题 · 挑战 {project.challengeProgress.achievedCount}/{project.challengeProgress.attemptedCount}</p>
                  <p>下一挑战建议：L{nextLevel(project.highestLevel)} {project.highestLevel ? '继续向上攀登' : '从记忆开始确认'}</p>
                  <Button render={<a href={`/student/challenge/${project.id}`}><Swords className="mr-2 size-4" />进入挑战</a>} className="w-full" variant="outline" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {selectedProject ? (
        <section className="space-y-4">
          <SectionHeader eyebrow="cognitive climbing route" title={`《${selectedProject.title}》认知攀登路线`} description="从低到高展示布鲁姆层级。题目生成和评估必须依赖真实 Provider；能力缺失时只展示路线和阻塞原因。" />
          <Card>
            <CardContent className="grid gap-3 p-6 lg:grid-cols-6">
              {([1, 2, 3, 4, 5, 6] as BloomLevel[]).map((level) => {
                const summary = selectedProject.levelSummary.find((item) => item.level === level);
                const active = Boolean(selectedProject.highestLevel && level <= selectedProject.highestLevel);
                return (
                  <div key={level} className="rounded-xl border bg-background/70 p-4">
                    <BloomBadge level={level} className={active ? undefined : 'opacity-70'} />
                    <p className="mt-3 text-sm text-muted-foreground">历史问题 {summary?.questionCount ?? 0}</p>
                    <p className="text-sm text-muted-foreground">挑战达成 {summary?.achievedChallengeCount ?? 0}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Route className="size-5 text-primary" />下一步</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>进入单篇挑战页后，系统会调用真实 practice_generation / practice_evaluation 能力生成挑战并写入评估结果；能力缺失时会明确阻塞。</span>
              <Button render={<a href={`/student/challenge/${selectedProject.id}`}><Swords className="mr-2 size-4" />开始挑战</a>} />
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
