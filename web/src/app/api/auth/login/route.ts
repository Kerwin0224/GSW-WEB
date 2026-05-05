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
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

function rateLimitKey(req: Request, loginId: string) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || req.headers.get('x-real-ip') || 'unknown';
  return `${ip}:${loginId}`;
}

function consumeLoginAttempt(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (current.count >= LOGIN_MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

function clearLoginAttempt(key: string) {
  loginAttempts.delete(key);
}

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

    const attemptKey = rateLimitKey(req, loginIdResult.loginId);
    if (!consumeLoginAttempt(attemptKey)) {
      await writeLogEvent({ level: 'warn', area: 'auth', event: 'school_login_rate_limited', requestId, route: '/api/auth/login', status: 429 });
      return NextResponse.json({ error: '尝试次数过多，请稍后再试。', requestId }, { status: 429 });
    }

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
    clearLoginAttempt(attemptKey);
    attachSessionCookie(response, {
      sub: account.id,
      loginId: account.login_id,
      role: account.role,
      displayName: account.display_name,
    });
    return response;
  });
}
