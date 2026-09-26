import Link from 'next/link';

import { ErrorState } from '@/components/workbench/state-surfaces';
import { WorkspaceHero } from '@/components/workbench/workspace-hero';
import { requireProfile } from '@/lib/auth';
import { listOrgSchools } from '@/lib/data/org';
import { OrgSchoolsClient } from './schools-client';

export default async function OrgHomePage() {
  const profile = await requireProfile('org_admin');

  const result = await listOrgSchools();
  if (!result.ok) return <div className="p-6"><ErrorState title="学校列表加载失败" description={result.message} /></div>;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="公司管理"
        title="学校总览"
        description="公司管理员在这里创建和停用学校、发放校管理员账号；师生名册与班级的日常管理由各校校管理员完成。"
        primaryAction={{ label: '模型与工具', href: '/org/platform', variant: 'outline' }}
        metrics={[
          { label: '学校', value: result.data.length, hint: '本公司名下全部学校' },
          { label: '班级', value: result.data.reduce((sum, school) => sum + school.classCount, 0), hint: '各校班级合计' },
          { label: '师生', value: result.data.reduce((sum, school) => sum + school.teacherCount + school.studentCount, 0), hint: '教师 + 学生' },
        ]}
      />
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
