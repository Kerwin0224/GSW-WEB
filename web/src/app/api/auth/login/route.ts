import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loginRpcProfilesSchema } from '@/lib/account-settings';
import { validateSchoolLoginId } from '@/lib/school-login';
import { attachSessionCookie, createDatabaseSessionSignature } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/supabase/database.types';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { writeLogEvent } from '@/lib/observability/server-log-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const roleHome: Record<AppRole, string> = { student: '/student', teacher: '/teacher', admin: '/admin', org_admin: '/org' };
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginBodySchema = z.object({
  loginId: z.string().optional(),
  password: z.string().optional(),
  // 跨校重名学号的二次提交消歧参数；首轮登录无需学校信息（产品裁定：内部处理）。
  schoolId: z.string().uuid().optional(),
});
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

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'auth', event: 'school_login', route: '/api/auth/login' }, async (requestId) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch { // no-excuse-ok: catch
      return NextResponse.json({ error: '请求格式无效', requestId }, { status: 400 });
    }

    const parsedBody = loginBodySchema.safeParse(body);
    if (!parsedBody.success) return NextResponse.json({ error: '请求格式无效', requestId }, { status: 400 });

    const { loginId: rawLoginId, password } = parsedBody.data;
    const loginIdResult = validateSchoolLoginId(rawLoginId ?? '');
    if (!loginIdResult.ok) return NextResponse.json({ error: loginIdResult.message, requestId }, { status: 400 });
    if (!password) return NextResponse.json({ error: '请输入密码。', requestId }, { status: 400 });

    const attemptKey = rateLimitKey(req, loginIdResult.loginId);
    if (!consumeLoginAttempt(attemptKey)) {
      await writeLogEvent({ level: 'warn', area: 'auth', event: 'school_login_rate_limited', requestId, route: '/api/auth/login', status: 429 });
      return NextResponse.json({ error: '尝试次数过多，请稍后再试。', requestId }, { status: 429 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('authenticate_school_account_v3', {
      p_login_id: loginIdResult.loginId,
      p_password: password,
      p_server_signature: createDatabaseSessionSignature(`login:${loginIdResult.loginId}`),
      p_school_id: parsedBody.data.schoolId ?? null,
    });

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

    const parsedAccounts = loginRpcProfilesSchema.safeParse(data);
    if (!parsedAccounts.success) {
      await writeLogEvent({
        level: 'error',
        area: 'auth',
        event: 'school_login_rpc_invalid_response',
        requestId,
        route: '/api/auth/login',
      });
      return NextResponse.json({ error: '账号认证服务不可用，请联系学校管理员。', requestId }, { status: 500 });
    }

    const accounts = parsedAccounts.data;
    if (accounts.length === 0) {
      await writeLogEvent({ level: 'warn', area: 'auth', event: 'school_login_rejected', requestId, route: '/api/auth/login', status: 401 });
      return NextResponse.json({ error: '账号或密码不正确。', requestId }, { status: 401 });
    }

    // 学号跨校重名且未消歧：让登录页在选择列表里内部处理，用户不输入学校码。
    if (accounts.length > 1 && !parsedBody.data.schoolId) {
      await writeLogEvent({ level: 'info', area: 'auth', event: 'school_login_ambiguous', requestId, route: '/api/auth/login', status: 300, context: { matched: accounts.length } });
      return NextResponse.json({
        ambiguous: true,
        candidates: accounts.map((row) => ({
          schoolId: row.school_id,
          schoolName: row.school_name,
          organizationName: row.organization_name,
          role: row.role,
          displayName: row.display_name,
        })),
        requestId,
      });
    }

    const account = accounts[0];

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
      mustChangePassword: account.must_change_password,
      redirectTo: account.must_change_password ? '/settings?required=1' : roleHome[account.role],
      requestId,
    });
    clearLoginAttempt(attemptKey);
    attachSessionCookie(response, {
      sub: account.id,
      loginId: account.login_id,
      role: account.role,
      displayName: account.display_name,
      sessionVersion: account.session_version,
      mustChangePassword: account.must_change_password,
    });
    return response;
  });
}
