import { notFound } from 'next/navigation';

import { ErrorState } from '@/components/workbench/state-surfaces';
import { WorkspaceHero } from '@/components/workbench/workspace-hero';
import { requireProfile } from '@/lib/auth';
import { getOrgSchoolDetail } from '@/lib/data/org';
import { SchoolDetailClient } from './detail-client';

export default async function OrgSchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // 页面侧守卫：此前只有 getOrgSchoolDetail 内部的 requireRole，must_change_password 时
  // 会被渲染成"加载失败"错误态而不是跳改密页。这里补上。
  await requireProfile('org_admin');

  const { id } = await params;
  const result = await getOrgSchoolDetail(id);
  if (!result.ok) {
    if (result.reason === 'forbidden') notFound();
    return <div className="p-6"><ErrorState title="学校详情加载失败" description={result.message} /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="公司管理 / 学校详情"
        title={result.data.school.name}
        description="在这里供给学校管理员账号（初始密码 = 工号，首次登录强制改密）；师生名册与班级的日常管理由学校管理员在本校后台完成。"
        metrics={[
          { label: '状态', value: result.data.school.status === 'active' ? '运行中' : '已停用', hint: '启用/停用在总览页操作' },
          { label: '成员账号', value: result.data.users.length, hint: '含校管理员、教师与学生' },
          { label: '班级', value: result.data.classes.length, hint: '由校管理员维护' },
        ]}
      />
      <SchoolDetailClient school={result.data.school} users={result.data.users} classes={result.data.classes} />
    </div>
  );
}
