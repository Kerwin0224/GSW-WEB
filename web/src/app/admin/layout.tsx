import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getProfile } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin') redirect('/login?error=role_denied');
  if (profile.status !== 'active') redirect('/login?error=account_disabled');

  return (
    <AppShell role="admin" displayName={profile.display_name ?? '管理员'} breadcrumbs={[{ label: '管理控制台' }]}>
      {children}
    </AppShell>
  );
}
