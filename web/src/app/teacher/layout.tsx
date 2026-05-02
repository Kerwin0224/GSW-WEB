import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getProfile } from '@/lib/auth';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'teacher') redirect('/login?error=role_denied');
  if (profile.status !== 'active') redirect('/login?error=account_disabled');

  return (
    <AppShell role="teacher" displayName={profile.display_name ?? '老师'} breadcrumbs={[{ label: '教师工作台' }]}>
      {children}
    </AppShell>
  );
}
