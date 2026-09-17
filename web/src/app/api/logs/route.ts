import { z } from 'zod';

import { getAppSession } from '@/lib/session';
import { writeLogEvent } from '@/lib/observability/server-log-store';
import { createRequestId } from '@/lib/observability/log-event';

const MAX_CLIENT_LOG_BYTES = 8 * 1024;

const clientLogSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('error'),
  area: z.literal('client').default('client'),
  event: z.string().trim().min(1).max(120),
  route: z.string().trim().max(240).optional(),
  message: z.string().trim().max(800).optional(),
  digest: z.string().trim().max(160).optional(),
  context: z.record(z.string(), z.unknown()).optional().refine((value) => !value || JSON.stringify(value).length <= 1200),
});

export async function POST(request: Request) {
  const requestId = createRequestId('log');
  // 这个入口的身份门槛故意只到"cookie 签名有效"，不走 requireAnyRole。
  //
  // 它是客户端错误上报入口，调用方只有 error.tsx 与 global-error.tsx 两个错误边界。
  // requireAnyRole 会读 profiles，而 lib/auth.ts 的 getProfile 在 DB 出错时是 throw：
  // 于是 Supabase 不可用的那一刻，客户端崩溃的上报会被静默丢弃——那恰恰是最需要
  // 日志的时刻。事件被 schema 限定为 area: "client"，攻击面极小，不值得用它去换
  // 「DB 故障时仍有客户端错误可见」。
  //
  // 代价：停用账号在自己的 cookie 过期前仍能写 client 类日志。可接受。
  const session = await getAppSession();
  if (!session) return Response.json({ ok: false, requestId }, { status: 401 });
  const userId = session.sub;
  const role = session.role;

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_CLIENT_LOG_BYTES) {
    return Response.json({ ok: false, requestId }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await writeLogEvent({ level: 'warn', area: 'api', event: 'client_log_invalid_json', requestId, route: '/api/logs', method: 'POST', status: 400, context: { user_id: userId } });
    return Response.json({ ok: false, requestId }, { status: 400 });
  }

  const parsed = clientLogSchema.safeParse(body);
  if (!parsed.success) {
    await writeLogEvent({ level: 'warn', area: 'api', event: 'client_log_invalid_payload', requestId, route: '/api/logs', method: 'POST', status: 400, context: { user_id: userId, issues: parsed.error.flatten() } });
    return Response.json({ ok: false, requestId }, { status: 400 });
  }

  await writeLogEvent({ ...parsed.data, requestId, route: parsed.data.route ?? request.headers.get('referer') ?? undefined, context: { ...parsed.data.context, user_id: userId, role } });
  return Response.json({ ok: true, requestId });
}
