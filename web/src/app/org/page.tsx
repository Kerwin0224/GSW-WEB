import Link from 'next/link';

import { ErrorState } from '@/components/workbench/state-surfaces';
import { getProfile } from '@/lib/auth';
import { listOrgSchools } from '@/lib/data/org';
import { OrgSchoolsClient } from './schools-client';

export default async function OrgHomePage() {
  const profile = await getProfile();
  if (!profile) return null;
  if (profile.role !== 'org_admin') return <div className="p-6"><ErrorState title="无权访问" description="公司学校总览仅限公司管理员使用。" /></div>;

  const result = await listOrgSchools();
  if (!result.ok) return <div className="p-6"><ErrorState title="学校列表加载失败" description={result.message} /></div>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2 border-b border-border/60 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">公司管理</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">学校总览</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          公司管校、校管人：在这里创建和停用学校、供给各校管理员账号；师生与班级的日常管理由各校管理员完成。
        </p>
      </header>
      <OrgSchoolsClient
        schools={result.data}
        organizationName="本公司"
        operatorName={profile.display_name}
      />
      <p className="text-xs text-muted-foreground">
        需要进入某所学校的师生与班级详情？打开对应学校卡片即可。
        <Link href="/settings" className="ml-1 text-primary hover:underline">账号设置</Link>
      </p>
    </div>
  );
}
