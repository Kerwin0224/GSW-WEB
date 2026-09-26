import { AppShell } from '@/components/app-shell';
import { requireProfile } from '@/lib/auth';

/**
 * 公司管理台外壳。
 *
 * 此前 /org 的每个页面各自手绘 header，结果是没有统一导航：公司管理员
 * 只能在页面里找到"进入某所学校"，看不到模型与工具，也没有移动端菜单。
 * 与 /admin/layout.tsx 同款：守卫一次 + AppShell 提供侧边栏、面包屑、退出登录。
 */
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile('org_admin');

  return (
    <AppShell
      role="org_admin"
      displayName={profile.display_name ?? '公司管理员'}
      loginId={profile.login_id}
      avatarKey={profile.avatar_key}
      breadcrumbs={[{ label: '公司管理' }]}
    >
      {children}
    </AppShell>
  );
}
