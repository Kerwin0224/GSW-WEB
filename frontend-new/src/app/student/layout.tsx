import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getProfile } from '@/lib/auth';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'student') redirect('/login?error=role_denied');
  if (profile.status !== 'active') redirect('/login?error=account_disabled');

  return (
    <AppShell role="student" displayName={profile.display_name ?? '同学'} breadcrumbs={[{ label: '学生工作台' }]}>
      {children}
    </AppShell>
  );
}
