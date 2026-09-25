import { NextResponse } from 'next/server';

import { subjectUpdateSchema } from '@/lib/account-settings';
import { requireAnyRole } from '@/lib/data/common';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { APP_ROLES } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(req: Request) {
  return withApiLogging(req, { area: 'auth', event: 'account_subject_update', route: '/api/account/subject' }, async (requestId) => {
    const auth = await requireAnyRole(APP_ROLES);
    if (!auth.ok) return NextResponse.json({ error: auth.message, requestId }, { status: auth.reason === 'forbidden' ? 403 : 401 });
    if (auth.data.role !== 'teacher') return NextResponse.json({ error: '只有教师账号可以设置任教学科。', requestId }, { status: 403 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: '请求格式无效。', requestId }, { status: 400 });
    }

    const parsed = subjectUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '科目信息无效。', requestId }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('update_own_subject', { p_subject: parsed.data.subject || null });
    if (error) {
      const status = error.code === '42501' ? 403 : 500;
      return NextResponse.json({ error: status === 403 ? '当前账号不能设置科目。' : '科目保存失败，请稍后重试。', requestId }, { status });
    }

    const subject = typeof data === 'string' && data.trim() ? data.trim() : null;
    return NextResponse.json({ ok: true, subject, requestId });
  });
}
