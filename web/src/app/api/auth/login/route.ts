import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { toSupabaseAuthPhone, validateSchoolLoginId } from '@/lib/school-login';
import type { AppRole } from '@/lib/supabase/database.types';

const roleHome: Record<AppRole, string> = { student: '/student', teacher: '/teacher', admin: '/admin' };

export async function POST(req: Request) {
  let body: { loginId?: string; password?: string };
  try {
    body = (await req.json()) as { loginId?: string; password?: string };
  } catch {
    return NextResponse.json({ error: '请求格式无效' }, { status: 400 });
  }

  const { loginId: rawLoginId, password } = body;
  const loginIdResult = validateSchoolLoginId(rawLoginId ?? '');
  if (!loginIdResult.ok) return NextResponse.json({ error: loginIdResult.message }, { status: 400 });
  if (!password) return NextResponse.json({ error: '请输入密码。' }, { status: 400 });

  const supabase = await createClient();
  const authPhone = toSupabaseAuthPhone(loginIdResult.loginId);
  const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({ phone: authPhone, password });
  if (signInError || !authData.user) return NextResponse.json({ error: '账号或密码不正确。' }, { status: 401 });

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id,login_id,display_name,role,status,created_at,updated_at')
    .eq('id', authData.user.id)
    .eq('login_id', loginIdResult.loginId)
    .maybeSingle();
  const profile = profileRow as { role: AppRole; display_name: string; status: string } | null;
  if (profileError) return NextResponse.json({ error: '账号资料读取失败，请稍后再试。' }, { status: 500 });
  if (!profile || profile.status !== 'active') {
    await supabase.auth.signOut();
    return NextResponse.json({ error: '账号暂未开通，请联系学校管理员。' }, { status: 403 });
  }

  return NextResponse.json({ role: profile.role, displayName: profile.display_name, redirectTo: roleHome[profile.role] });
}
