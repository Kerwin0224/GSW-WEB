import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user || user.role !== 'teacher') redirect('/login');

  const supabase = await createClient();
  const { data } = await supabase.rpc('get_profile', { p_user_id: user.sub });

  const profile = (data as Array<{ display_name?: string }> | null)?.[0];
  return (
    <AppShell role="teacher" displayName={profile?.display_name ?? '老师'} breadcrumbs={[{ label: '教师工作台' }]}>
      {children}
    </AppShell>
  );
}
