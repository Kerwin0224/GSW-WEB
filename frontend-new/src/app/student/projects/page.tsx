'use client';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BlockedState, EmptyState, ErrorState, LoadingSurface, PermissionState, SuccessState } from '@/components/workbench/state-surfaces';
import { ProjectCard, type ProjectCardData } from '@/components/workbench/project-card';

const projects: ProjectCardData[] = [];
const loading = false;
const error: string | null = null;
const permissionDenied = false;
const projectWriteBlocked = false;
const lastUpdateCommitted = false;

export default function StudentProjectsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl">篇目项目</h1>
          <p className="mt-1 text-sm text-muted-foreground">按诗文篇目沉淀问题、练习与布鲁姆认知路径。</p>
        </div>
        <Select defaultValue="recent">
          <SelectTrigger className="w-44"><SelectValue aria-label="项目排序" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">最近学习</SelectItem>
            <SelectItem value="depth">认知深度</SelectItem>
            <SelectItem value="count">问题数量</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingSurface label="正在加载篇目项目" /> : null}
      {permissionDenied ? <PermissionState title="无法查看篇目项目" description="当前账号缺少学生资料或项目访问范围。" /> : null}
      {projectWriteBlocked ? <BlockedState title="篇目归档暂不可用" description="缺少 project_classification 能力配置；系统不会把问题伪造归入示例项目。" /> : null}
      {lastUpdateCommitted ? <SuccessState title="项目更新已提交" description="真实 Supabase 写入成功后才会显示此状态。" /> : null}
      {error ? <ErrorState title="项目加载失败" description={error} /> : null}
      {!loading && !error && projects.length === 0 ? (
        <EmptyState title="还没有篇目项目" description="提出第一个古诗文问题后，系统会自动归入对应篇目；没有真实记录时不会显示示例项目。" action={<Button render={<a href="/student">开始提问</a>} />} />
      ) : null}
      {projects.length > 0 ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div> : null}
    </div>
  );
}
