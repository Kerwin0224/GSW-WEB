import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user || user.role !== 'admin') redirect('/login');

  const supabase = await createClient();
  const { data } = await supabase.rpc('get_profile', { p_user_id: user.sub });

  const profile = (data as Array<{ display_name?: string }> | null)?.[0];
  return (
    <AppShell role="admin" displayName={profile?.display_name ?? '管理员'} breadcrumbs={[{ label: '管理控制台' }]}>
      {children}
    </AppShell>
  );
}
