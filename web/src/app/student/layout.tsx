import { AppShell } from '@/components/app-shell';
import { requireProfile } from '@/lib/auth';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile('student');

  return (
    <AppShell role="student" displayName={profile.display_name ?? '同学'} loginId={profile.login_id} avatarKey={profile.avatar_key} breadcrumbs={[{ label: '学习提问' }]} chrome="top">
      {children}
    </AppShell>
  );
}
