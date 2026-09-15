import { notFound } from 'next/navigation';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { ProjectCatalogPanel } from '@/components/workbench/project-catalog-panel';
import { SectionHeader } from '@/components/workbench/workspace-hero';
import { getOrgSchoolDetail } from '@/lib/data/org';
import { listProjectCatalog } from '@/lib/data/project-catalog';
import { SchoolDetailClient } from './detail-client';

export default async function OrgSchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getOrgSchoolDetail(id);
  if (!result.ok) {
    if (result.reason === 'forbidden') notFound();
    return <div className="p-6"><ErrorState title="学校详情加载失败" description={result.message} /></div>;
  }

  // 该校的项目归属目录。org_admin 可借此为不同学校开不同系统的科目/年级体系。
  const catalog = await listProjectCatalog({ schoolId: id });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2 border-b border-border/60 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">公司管理 / 学校详情</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{result.data.school.name}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          在这里供给学校管理员账号（初始密码 = 工号，首次登录强制改密），并为该校配置项目归属目录（学科 / 年级 / 类别）；师生名册与班级的日常管理由学校管理员在本校后台完成。
        </p>
      </header>
      <SchoolDetailClient school={result.data.school} users={result.data.users} classes={result.data.classes} />

      <section className="space-y-4">
        <SectionHeader
          title="该校的项目归属目录"
          description="为这所学校单独下发目录，决定它的项目怎么归类——不同学校可以开不同的科目与年级体系。"
        />
        <Card>
          <CardHeader>
            <CardTitle>目录清单</CardTitle>
          </CardHeader>
          <CardContent>
            {catalog.ok ? (
              <ProjectCatalogPanel
                targetSchoolId={id}
                scopeLabel="该校"
                nodes={catalog.data.map((node) => ({ id: node.id, name: node.name, kind: node.kind, path: node.path, schoolId: node.schoolId }))}
              />
            ) : (
              <ErrorState title="目录加载失败" description={catalog.message} />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
