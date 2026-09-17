import { AppShell } from '@/components/app-shell';
import { requireProfile } from '@/lib/auth';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile('teacher');

  return (
    <AppShell role="teacher" displayName={profile.display_name ?? '老师'} loginId={profile.login_id} avatarKey={profile.avatar_key} breadcrumbs={[{ label: '教学总览' }]}>
      {children}
    </AppShell>
  );
}
