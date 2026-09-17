import { NextResponse } from 'next/server';

import { avatarKeySchema, avatarUpdateSchema } from '@/lib/account-settings';
import { requireAnyRole } from '@/lib/data/common';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { APP_ROLES } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(req: Request) {
  return withApiLogging(req, { area: 'auth', event: 'account_avatar_update', route: '/api/account/avatar' }, async (requestId) => {
    // 改头像对四个角色都开放，但不是"有 cookie 就能改"：requireAnyRole 每次都重新读库，
    // 停用账号与 must_change_password 账号（只能去改密）在这里就被挡下。
    const auth = await requireAnyRole(APP_ROLES);
    if (!auth.ok) return NextResponse.json({ error: auth.message, requestId }, { status: auth.reason === 'forbidden' ? 403 : 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch { // no-excuse-ok: catch
      return NextResponse.json({ error: '请求格式无效。', requestId }, { status: 400 });
    }

    const parsedBody = avatarUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({ error: '请选择有效的头像。', requestId }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('update_own_avatar', {
      p_avatar_key: parsedBody.data.avatarKey,
    });

    if (error) {
      const status = error.code === '42501' ? 401 : 500;
      const message = status === 401 ? '登录已失效，请重新登录。' : '头像保存失败，请稍后重试。';
      return NextResponse.json({ error: message, requestId }, { status });
    }

    const avatarKey = avatarKeySchema.safeParse(data);
    if (!avatarKey.success) {
      return NextResponse.json({ error: '头像保存失败，请稍后重试。', requestId }, { status: 500 });
    }

    return NextResponse.json({ ok: true, avatarKey: avatarKey.data, requestId });
  });
}
