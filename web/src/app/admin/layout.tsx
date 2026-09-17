import { AppShell } from '@/components/app-shell';
import { requireProfile } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile('admin');

  return (
    <AppShell role="admin" displayName={profile.display_name ?? '管理员'} loginId={profile.login_id} avatarKey={profile.avatar_key} breadcrumbs={[{ label: '管理看板' }]}>
      {children}
    </AppShell>
  );
}
