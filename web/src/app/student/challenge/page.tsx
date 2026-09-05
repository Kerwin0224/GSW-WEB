import Link from 'next/link';
import { BookOpenText, Search, SlidersHorizontal, Swords } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BloomBadge } from '@/components/workbench/bloom-badge';
import { ChallengeClient } from '@/components/workbench/challenge-client';
import { BlockedState, EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader } from '@/components/workbench/workspace-hero';
import { getStudentProject, getStudentProjects, getStudentWorkspace, type ProjectDetail, type ProjectSummary } from '@/lib/data/student';
import { cn } from '@/lib/utils';

type ChallengeFilter = 'all' | 'waiting' | 'active' | 'reinforce' | 'complete';
type ChallengePageSearchParams = { projectId?: string | string[]; q?: string | string[]; status?: string | string[] };

const challengeFilters: Array<{ value: ChallengeFilter; label: string; description: string }> = [
  { value: 'all', label: '全部', description: '所有可挑战项目' },
  { value: 'waiting', label: '等待挑战', description: '尚未开始确认' },
  { value: 'active', label: '进行中', description: '已有挑战记录' },
  { value: 'reinforce', label: '待巩固', description: '最近挑战未通过' },
  { value: 'complete', label: '已完成', description: '六层均已确认' },
];

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeFilter(value: string | undefined): ChallengeFilter {
  return challengeFilters.some((filter) => filter.value === value) ? (value as ChallengeFilter) : 'all';
}

function matchesQuery(project: ProjectSummary, query: string) {
  if (!query) return true;
  const haystack = `${project.title} ${project.author ?? ''}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function isReinforceProject(project: ProjectSummary) {
  return project.challengeProgress.statusLabel === '待巩固' || project.challengeProgress.statusLabel === '需要巩固';
}

function matchesFilter(project: ProjectSummary, filter: ChallengeFilter) {
  if (filter === 'all') return true;
  if (filter === 'waiting') return project.challengeProgress.attemptedCount === 0;
  if (filter === 'reinforce') return isReinforceProject(project);
  if (filter === 'complete') return project.challengeProgress.isComplete;
  return project.challengeProgress.attemptedCount > 0 && !project.challengeProgress.isComplete && !isReinforceProject(project);
}

function getLatestActionablePractice(practices: ProjectDetail['practices']) {
  return practices.find((practice) => practice.evaluation_state !== 'evaluated') ?? practices.find((practice) => practice.evaluation_state === 'evaluated' && practice.achieved === false);
}

export default async function ChallengePage({ searchParams }: { searchParams?: Promise<ChallengePageSearchParams> }) {
  const params = await searchParams;
  const [workspace, projectsResult] = await Promise.all([getStudentWorkspace(), getStudentProjects()]);
  if (!workspace.ok) return <div className="p-6"><ErrorState title="挑战入口加载失败" description={workspace.message} /></div>;
  if (!projectsResult.ok) return <div className="p-6"><ErrorState title="项目挑战加载失败" description={projectsResult.message} /></div>;

  const projects = projectsResult.data;
  const query = (singleParam(params?.q) ?? '').trim();
  const activeFilter = normalizeFilter(singleParam(params?.status));
  const requestedProjectId = singleParam(params?.projectId);
  const queryMatchedProjects = projects.filter((project) => matchesQuery(project, query));
  const filteredProjects = queryMatchedProjects.filter((project) => matchesFilter(project, activeFilter));
  const requestedProject = requestedProjectId ? projects.find((project) => project.id === requestedProjectId) : undefined;
  const selectedProject = requestedProject && matchesQuery(requestedProject, query) && matchesFilter(requestedProject, activeFilter)
    ? requestedProject
    : filteredProjects[0];
  const selectedProjectResult = selectedProject ? await getStudentProject(selectedProject.id) : null;
  const selectedProjectDetail = selectedProjectResult?.ok ? selectedProjectResult.data : null;
  const selectedProgress = selectedProjectDetail?.challengeProgress ?? selectedProject?.challengeProgress;
  const initialPractice = selectedProjectDetail ? getLatestActionablePractice(selectedProjectDetail.practices) : undefined;

  const buildHref = (projectId?: string, overrides?: { status?: ChallengeFilter; q?: string }) => {
    const search = new URLSearchParams();
    const nextQuery = overrides?.q ?? query;
    const nextStatus = overrides?.status ?? activeFilter;
    if (projectId) search.set('projectId', projectId);
    if (nextQuery) search.set('q', nextQuery);
    if (nextStatus !== 'all') search.set('status', nextStatus);
    const suffix = search.toString();
    return `/student/challenge${suffix ? `?${suffix}` : ''}`;
  };

  const filterCounts = challengeFilters.map((filter) => ({
    ...filter,
    count: queryMatchedProjects.filter((project) => matchesFilter(project, filter.value)).length,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-lg border bg-background/80 p-5 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader
          eyebrow="挑战"
          title="选择篇目，发起挑战"
          description="选一篇学过的文章，检验自己学到了第几层。"
        />
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/student/me" />} variant="outline">
            学习情况
          </Button>
        </div>
      </header>

      {workspace.data.challengeBlocked ? (
        <BlockedState title="挑战功能暂不可用" description={workspace.data.challengeBlocked} />
      ) : null}

      {projects.length === 0 ? (
        <EmptyState title="还没有可挑战的篇目" description="先在学习提问里形成项目，再来发起挑战。" />
      ) : (
        <section className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-heading text-lg">
                  <SlidersHorizontal className="size-5 text-primary" />
                  筛选项目
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form action="/student/challenge" className="flex gap-2">
                  {activeFilter !== 'all' ? <input type="hidden" name="status" value={activeFilter} /> : null}
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input name="q" defaultValue={query} placeholder="搜索篇目或作者" className="pl-8" />
                  </div>
                  <Button type="submit" size="sm" aria-label="筛选项目">
                    <Search className="size-4" />
                  </Button>
                </form>

                <div className="flex flex-wrap gap-2">
                  {filterCounts.map((filter) => (
                    <Button
                      key={filter.value}
                      nativeButton={false}
                      render={<Link href={buildHref(undefined, { status: filter.value })} />}
                      size="sm"
                      variant={activeFilter === filter.value ? 'default' : 'outline'}
                      aria-label={`${filter.label}：${filter.description}`}
                    >
                      {filter.label}
                      <Badge variant={activeFilter === filter.value ? 'secondary' : 'outline'}>{filter.count}</Badge>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="border-b px-4 py-3">
                <p className="font-heading text-base">项目列表</p>
                <p className="text-xs text-muted-foreground">点击项目后，右侧挑战区立即切换。</p>
              </div>
              {filteredProjects.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">没有匹配项目。清空搜索词或切换筛选条件后再试。</div>
              ) : (
                <div className="divide-y">
                  {filteredProjects.map((project) => {
                    const selected = selectedProject?.id === project.id;
                    return (
                      <Link
                        key={project.id}
                        href={buildHref(project.id)}
                        aria-current={selected ? 'page' : undefined}
                        className={cn('block px-4 py-3 outline-none transition hover:bg-muted/70 focus-visible:bg-muted/70', selected && 'bg-primary/5')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">《{project.title}》</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{project.author ?? '作者未标注'} · {project.questionCount} 个项目问题</p>
                          </div>
                          {project.challengeProgress.confirmedLevel ? <BloomBadge level={project.challengeProgress.confirmedLevel} /> : <Badge variant="outline">待确认</Badge>}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={isReinforceProject(project) ? 'secondary' : 'outline'}>{project.challengeProgress.statusLabel}</Badge>
                          <span>下一挑战 L{project.challengeProgress.nextLevel}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className="min-w-0 space-y-5">
            {selectedProject && selectedProgress ? (
              <>
                <div className="rounded-lg border bg-background/80 p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <SectionHeader
                      eyebrow="当前挑战项目"
                      title={`《${selectedProject.title}》挑战`}
                      description="挑战会告诉你通过与否、达到了哪一层。没通过就先回去再读一读，再来挑战。"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button nativeButton={false} render={<Link href={`/student?projectId=${selectedProject.id}`} />} variant="outline">
                        <BookOpenText className="mr-2 size-4" />
                        项目提问
                      </Button>
                      <Button nativeButton={false} render={<Link href={buildHref(selectedProject.id)} />}>
                        <Swords className="mr-2 size-4" />
                        当前挑战
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-card/60 p-4">
                      <p className="text-xs text-muted-foreground">当前已确认层级</p>
                      <div className="mt-2">{selectedProgress.confirmedLevel ? <BloomBadge level={selectedProgress.confirmedLevel} /> : <Badge variant="outline">等待挑战</Badge>}</div>
                    </div>
                    <div className="rounded-lg border bg-card/60 p-4">
                      <p className="text-xs text-muted-foreground">下一挑战</p>
                      <p className="mt-2 font-heading text-lg">L{selectedProgress.nextLevel}</p>
                    </div>
                    <div className="rounded-lg border bg-card/60 p-4">
                      <p className="text-xs text-muted-foreground">项目状态</p>
                      <p className="mt-2 text-sm">{selectedProgress.statusLabel}</p>
                    </div>
                  </div>
                </div>
                {selectedProjectResult && !selectedProjectResult.ok ? (
                  <ErrorState title="篇目挑战加载失败" description={selectedProjectResult.message} />
                ) : selectedProjectDetail ? (
                  <ChallengeClient
                    key={selectedProject.id}
                    projectId={selectedProject.id}
                    projectTitle={selectedProject.title}
                    projectAuthor={selectedProject.author}
                    confirmedLevel={selectedProgress.confirmedLevel}
                    initialPractice={initialPractice}
                    challengeBlocked={workspace.data.challengeBlocked}
                    challengeStatusLabel={selectedProgress.statusLabel}
                    isComplete={selectedProgress.isComplete}
                  />
                ) : (
                  <EmptyState title="未找到真实项目" description="当前项目不再可访问。请从左侧项目列表重新选择。" />
                )}
              </>
            ) : (
              <EmptyState title="没有可挑战项目" description="当前筛选条件下没有可挑战项目。" />
            )}
          </section>
        </section>
      )}
    </div>
  );
}
