import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/supabase/database.types';

const roleHome: Record<AppRole, string> = { student: '/student', teacher: '/teacher', admin: '/admin' };

export async function POST(req: Request) {
  let body: { loginId?: string; password?: string };
  try {
    body = (await req.json()) as { loginId?: string; password?: string };
  } catch {
    return NextResponse.json({ error: '请求格式无效' }, { status: 400 });
  }

  const { loginId, password } = body;
  if (!loginId || !password) return NextResponse.json({ error: '请输入学号/工号和密码' }, { status: 400 });

  const supabase = await createClient();
  const normalized = loginId.trim();
  let email = normalized;

  if (!normalized.includes('@')) {
    const { data, error } = await supabase.rpc('find_login_email', { p_login_id: normalized });
    if (error) return NextResponse.json({ error: `登录查询失败：${error.message}` }, { status: 500 });
    email = data?.[0]?.email ?? '';
  }

  if (!email) return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });

  const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !authData.user) return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });

  const { data: profileRow, error: profileError } = await supabase.from('profiles').select('*').eq('id', authData.user.id).maybeSingle();
  const profile = profileRow as { role: 'admin' | 'teacher' | 'student'; display_name: string; status: string } | null;
  if (profileError) return NextResponse.json({ error: `角色资料读取失败：${profileError.message}` }, { status: 500 });
  if (!profile || profile.status !== 'active') {
    await supabase.auth.signOut();
    return NextResponse.json({ error: '账号缺少可用角色资料，请联系管理员完成配置' }, { status: 403 });
  }

  return NextResponse.json({ role: profile.role, displayName: profile.display_name, redirectTo: roleHome[profile.role] });
}
