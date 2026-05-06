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
        eyebrow="挑战确认"
        title="挑战才真正确认你是否学会。"
        description="会话只能形成布鲁姆认知路径；挑战才负责确认项目当前层级，并决定下一步该继续挑战还是回到项目提问。"
        primaryAction={{ label: '回到项目提问', href: '/student' }}
        secondaryAction={{ label: '查看篇目项目', href: '/student/projects' }}
        metrics={[
          { label: '项目', value: projects.length, hint: '可挑战篇目' },
          { label: '挑战尝试', value: projects.reduce((sum, project) => sum + project.challengeProgress.attemptedCount, 0), hint: '真实挑战记录' },
          { label: '已确认层级', value: projects.filter((project) => project.challengeProgress.confirmedLevel).length, hint: '已有确认结果的项目' },
        ]}
      />

      {workspace.data.challengeBlocked ? (
        <BlockedState title="挑战生成与评估被阻塞" description={workspace.data.challengeBlocked} />
      ) : null}

      <section className="space-y-4">
        <SectionHeader eyebrow="项目挑战卡片墙" title="项目挑战卡片墙" description="选择一个篇目进入认知攀登路线。卡片展示当前确认层级、下一挑战层级和项目状态。" />
        {projects.length === 0 ? (
          <EmptyState title="暂无可挑战项目" description="先在学习提问中产生真实篇目项目，再进入挑战确认认知水平。" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Card key={project.id} className={selectedProject?.id === project.id ? 'border-primary/60 bg-primary/5' : undefined}>
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-3 font-heading">
                    <span>《{project.title}》</span>
                    {project.challengeProgress.confirmedLevel ? <BloomBadge level={project.challengeProgress.confirmedLevel} /> : <Badge variant="outline">等待挑战确认</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <p>{project.questionCount} 个历史问题 · {project.challengeProgress.statusLabel}</p>
                  <p>下一挑战建议：L{project.challengeProgress.nextLevel ?? nextLevel(project.highestLevel)} {project.challengeProgress.isComplete ? '已完成全部确认' : '继续向上攀登'}</p>
                  <Button nativeButton={false} render={<a href={`/student/challenge/${project.id}`}><Swords className="mr-2 size-4" />{project.challengeProgress.isComplete ? '查看挑战结果' : '继续挑战'}</a>} className="w-full" variant="outline" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {selectedProject ? (
        <section className="space-y-4">
          <SectionHeader eyebrow="认知攀登路线" title={`《${selectedProject.title}》认知攀登路线`} description="从低到高展示完整六层路线。没有确认结果时，看板显示“等待挑战确认”；未通过时项目状态显示为“待巩固”。" />
          <Card>
            <CardContent className="grid gap-3 p-6 lg:grid-cols-6">
              {([1, 2, 3, 4, 5, 6] as BloomLevel[]).map((level) => {
                const summary = selectedProject.levelSummary.find((item) => item.level === level);
                const achieved = selectedProject.challengeProgress.confirmedLevel ? level <= selectedProject.challengeProgress.confirmedLevel : false;
                const current = !selectedProject.challengeProgress.isComplete && level === selectedProject.challengeProgress.currentLevel;
                return (
                  <div key={level} className="rounded-lg border bg-background/70 p-4">
                    <BloomBadge level={level} className={!achieved && !current ? 'opacity-70' : undefined} />
                    <p className="mt-3 text-sm text-muted-foreground">历史问题 {summary?.questionCount ?? 0}</p>
                    <p className="text-sm text-muted-foreground">挑战达成 {summary?.achievedChallengeCount ?? 0}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{achieved ? '已确认' : current ? '下一挑战' : '未解锁'}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Route className="size-5 text-primary" />下一步</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>挑战结果只展示通过与否、对应布鲁姆层级和下一步行动；如果当前层级仍待巩固，就回到项目会话继续学习后再挑战。</span>
              <Button nativeButton={false} render={<a href={`/student/challenge/${selectedProject.id}`}><Swords className="mr-2 size-4" />{selectedProject.challengeProgress.isComplete ? '查看结果' : '继续挑战'}</a>} />
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
