import { NextResponse } from 'next/server';

import { validateSchoolLoginId } from '@/lib/school-login';
import { attachSessionCookie } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/supabase/database.types';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { writeLogEvent } from '@/lib/observability/server-log-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const roleHome: Record<AppRole, string> = { student: '/student', teacher: '/teacher', admin: '/admin' };

type AuthenticatedSchoolAccount = {
  id: string;
  login_id: string;
  role: AppRole;
  display_name: string;
};

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'auth', event: 'school_login', route: '/api/auth/login' }, async (requestId) => {
    let body: { loginId?: string; password?: string };
    try {
      body = (await req.json()) as { loginId?: string; password?: string };
    } catch {
      return NextResponse.json({ error: '请求格式无效', requestId }, { status: 400 });
    }

    const { loginId: rawLoginId, password } = body;
    const loginIdResult = validateSchoolLoginId(rawLoginId ?? '');
    if (!loginIdResult.ok) return NextResponse.json({ error: loginIdResult.message, requestId }, { status: 400 });
    if (!password) return NextResponse.json({ error: '请输入密码。', requestId }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('authenticate_school_account', {
      p_login_id: loginIdResult.loginId,
      p_password: password,
    }) as { data: AuthenticatedSchoolAccount[] | null; error: { message: string } | null };

    if (error) {
      await writeLogEvent({
        level: 'error',
        area: 'auth',
        event: 'school_login_rpc_failed',
        requestId,
        route: '/api/auth/login',
        message: error.message,
      });
      return NextResponse.json({ error: '账号认证服务不可用，请联系学校管理员。', requestId }, { status: 500 });
    }

    const account = (data?.[0] ?? null) as AuthenticatedSchoolAccount | null;
    if (!account) {
      await writeLogEvent({ level: 'warn', area: 'auth', event: 'school_login_rejected', requestId, route: '/api/auth/login', status: 401 });
      return NextResponse.json({ error: '账号或密码不正确。', requestId }, { status: 401 });
    }

    await writeLogEvent({
      level: 'info',
      area: 'auth',
      event: 'school_login_accepted',
      requestId,
      route: '/api/auth/login',
      context: { role: account.role },
    });

    const response = NextResponse.json({
      role: account.role,
      displayName: account.display_name,
      redirectTo: roleHome[account.role],
      requestId,
    });
    attachSessionCookie(response, {
      sub: account.id,
      loginId: account.login_id,
      role: account.role,
      displayName: account.display_name,
    });
    return response;
  });
}
