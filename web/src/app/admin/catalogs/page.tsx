import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { ProjectCatalogPanel } from '@/components/workbench/project-catalog-panel';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { listProjectCatalog } from '@/lib/data/project-catalog';

export default async function AdminCatalogsPage() {
  const result = await listProjectCatalog();
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="项目归属目录加载失败" description={result.message} />
      </div>
    );
  }

  const nodes = result.data;
  const subjectCount = nodes.filter((node) => node.kind === 'subject').length;
  const schoolScopedCount = nodes.filter((node) => node.schoolId !== null).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="项目归属目录"
        description="用可导入的层级目录决定项目归到什么，让系统服务各学科、各年级，而不局限于古诗文。"
        metrics={[
          { label: '目录节点', value: nodes.length, hint: '全部层级节点' },
          { label: '学科', value: subjectCount, hint: '顶层学科数' },
          { label: '本校目录', value: schoolScopedCount, hint: '公司模板之外的校有节点' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="归属规则配置"
          description="导入目录后，学生项目可按学科 / 年级 / 类别 / 专题归属；教师核实页据此组织待办。"
        />
        <Card>
          <CardHeader>
            <CardTitle>目录清单</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectCatalogPanel nodes={nodes.map((node) => ({ id: node.id, name: node.name, kind: node.kind, path: node.path, schoolId: node.schoolId }))} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
