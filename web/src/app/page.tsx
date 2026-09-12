import { redirect } from 'next/navigation';

import { getUser } from '@/lib/auth';

const roleHome = { student: '/student', teacher: '/teacher', admin: '/admin', org_admin: '/org' } as const;

export default async function Home() {
  const user = await getUser();
  if (user?.role && user.role in roleHome) redirect(roleHome[user.role as keyof typeof roleHome]);
  redirect('/login');
}
