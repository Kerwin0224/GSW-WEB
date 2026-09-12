import { notFound } from 'next/navigation';

import { ErrorState } from '@/components/workbench/state-surfaces';
import { getOrgSchoolDetail } from '@/lib/data/org';
import { SchoolDetailClient } from './detail-client';

export default async function OrgSchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getOrgSchoolDetail(id);
  if (!result.ok) {
    if (result.reason === 'forbidden') notFound();
    return <div className="p-6"><ErrorState title="学校详情加载失败" description={result.message} /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2 border-b border-border/60 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">公司管理 / 学校详情</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{result.data.school.name}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          在这里供给学校管理员账号（初始密码 = 工号，首次登录强制改密）；师生名册与班级的日常管理由学校管理员在本校后台完成。
        </p>
      </header>
      <SchoolDetailClient school={result.data.school} users={result.data.users} classes={result.data.classes} />
    </div>
  );
}
