import { NextResponse } from 'next/server';

import { accountPasswordSchema, resolvePasswordChangeResult } from '@/lib/account-settings';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { attachSessionCookie, getAppSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  return withApiLogging(req, { area: 'auth', event: 'account_password_change', route: '/api/account/password' }, async (requestId) => {
    const session = await getAppSession();
    if (!session) return NextResponse.json({ error: '请先登录。', requestId }, { status: 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch { // no-excuse-ok: catch
      return NextResponse.json({ error: '请求格式无效。', requestId }, { status: 400 });
    }

    const parsedBody = accountPasswordSchema.safeParse(body);
    if (!parsedBody.success) {
      const message = parsedBody.error.issues[0]?.message ?? '密码信息无效。';
      return NextResponse.json({ error: message, requestId }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('change_own_password', {
      p_current_password: parsedBody.data.currentPassword,
      p_new_password: parsedBody.data.newPassword,
    });
    const result = resolvePasswordChangeResult(data, error);

    switch (result.kind) {
      case 'success': {
        const response = NextResponse.json({ ok: true, message: '密码已更新。', requestId });
        attachSessionCookie(response, {
          sub: result.account.id,
          loginId: result.account.login_id,
          role: result.account.role,
          displayName: result.account.display_name,
          sessionVersion: result.account.session_version,
          mustChangePassword: result.account.must_change_password,
        });
        return response;
      }
      case 'current-password-rejected':
        return NextResponse.json({ error: '当前密码不正确。', requestId }, { status: 403 });
      case 'rate-limited':
        return NextResponse.json({ error: '尝试次数过多，请 15 分钟后再试。', requestId }, { status: 429 });
      case 'unauthenticated':
        return NextResponse.json({ error: '登录已失效，请重新登录。', requestId }, { status: 401 });
      case 'service-error':
        return NextResponse.json({ error: '密码更新失败，请稍后重试。', requestId }, { status: 500 });
      default: {
        const exhaustiveResult: never = result;
        return exhaustiveResult;
      }
    }
  });
}
