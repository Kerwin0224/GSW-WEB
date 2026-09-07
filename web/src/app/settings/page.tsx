import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { AccountSettings } from '@/components/workbench/account-settings';
import { requireProfile } from '@/lib/auth';

export const metadata: Metadata = {
  title: '账号设置 | 文韵智途',
  description: '管理文韵智途学校账号的头像和登录密码。',
};

export default async function SettingsPage() {
  const profile = await requireProfile();

  return (
    <AppShell
      role={profile.role}
      displayName={profile.display_name}
      avatarKey={profile.avatar_key}
      breadcrumbs={[{ label: '账号设置' }]}
      chrome={profile.role === 'student' ? 'top' : 'sidebar'}
    >
      <AccountSettings
        accountRole={profile.role}
        avatarKey={profile.avatar_key}
        displayName={profile.display_name}
        loginId={profile.login_id ?? ''}
      />
    </AppShell>
  );
}
