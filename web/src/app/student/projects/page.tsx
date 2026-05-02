import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { ProjectCard } from '@/components/workbench/project-card';
import { getStudentProjects } from '@/lib/data/student';

export default async function StudentProjectsPage() {
  const result = await getStudentProjects();
  if (!result.ok) return <div className="p-6"><ErrorState title="项目加载失败" description={result.message} /></div>;
  const projects = result.data;
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="font-heading text-3xl">篇目项目</h1><p className="mt-1 text-sm text-muted-foreground">按诗文篇目沉淀问题、练习与布鲁姆认知路径。</p></div><Select defaultValue="recent"><SelectTrigger className="w-44"><SelectValue aria-label="项目排序" /></SelectTrigger><SelectContent><SelectItem value="recent">最近学习</SelectItem><SelectItem value="depth">认知深度</SelectItem><SelectItem value="count">问题数量</SelectItem></SelectContent></Select></div>{projects.length === 0 ? <EmptyState title="还没有篇目项目" description="提出第一个古诗文问题后，系统会自动归入对应篇目；没有真实记录时不会显示示例项目。" action={<Button render={<a href="/student">开始提问</a>} />} /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div>}</div>;
}
