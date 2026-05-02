import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/supabase/database.types';

const roleHome: Record<AppRole, string> = { student: '/student', teacher: '/teacher', admin: '/admin' };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url));
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.redirect(new URL('/login?error=auth_required', request.url));

  const { data: profileRow } = await supabase.from('profiles').select('role,status').eq('id', userData.user.id).maybeSingle();
  const profile = profileRow as { role: AppRole; status: string } | null;
  if (!profile || profile.status !== 'active') return NextResponse.redirect(new URL('/login?error=profile_required', request.url));

  return NextResponse.redirect(new URL(next || roleHome[profile.role], request.url));
}
