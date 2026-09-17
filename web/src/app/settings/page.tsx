import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { AccountSettings } from '@/components/workbench/account-settings';
import { requireProfileForPasswordChange } from '@/lib/auth';

export const metadata: Metadata = {
  title: '账号设置 | 文韵智途',
  description: '管理文韵智途学校账号的头像和登录密码。',
};

export default async function SettingsPage() {
  const profile = await requireProfileForPasswordChange();
  // 强制改密时收掉全部导航（chrome="none"）：此刻任何导航项都会被 requireProfile
  // 弹回本页，摆出来只会让用户看到一圈点了原地打转的入口。
  const chrome = profile.must_change_password ? 'none' : profile.role === 'student' ? 'top' : 'sidebar';

  return (
    <AppShell
      role={profile.role}
      displayName={profile.display_name}
      loginId={profile.login_id}
      avatarKey={profile.avatar_key}
      breadcrumbs={[{ label: '账号设置' }]}
      chrome={chrome}
    >
      <AccountSettings
        accountRole={profile.role}
        avatarKey={profile.avatar_key}
        displayName={profile.display_name}
        loginId={profile.login_id ?? ''}
        mustChangePassword={profile.must_change_password}
      />
    </AppShell>
  );
}
