import { z } from 'zod';

import { getAppSession } from '@/lib/session';
import { writeLogEvent } from '@/lib/observability/server-log-store';
import { createRequestId } from '@/lib/observability/log-event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const session = await getAppSession();
  if (!session) return Response.json({ ok: false, requestId }, { status: 401 });

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_CLIENT_LOG_BYTES) {
    return Response.json({ ok: false, requestId }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await writeLogEvent({ level: 'warn', area: 'api', event: 'client_log_invalid_json', requestId, route: '/api/logs', method: 'POST', status: 400, context: { user_id: session.sub } });
    return Response.json({ ok: false, requestId }, { status: 400 });
  }

  const parsed = clientLogSchema.safeParse(body);
  if (!parsed.success) {
    await writeLogEvent({ level: 'warn', area: 'api', event: 'client_log_invalid_payload', requestId, route: '/api/logs', method: 'POST', status: 400, context: { user_id: session.sub, issues: parsed.error.flatten() } });
    return Response.json({ ok: false, requestId }, { status: 400 });
  }

  await writeLogEvent({ ...parsed.data, requestId, route: parsed.data.route ?? request.headers.get('referer') ?? undefined, context: { ...parsed.data.context, user_id: session.sub, role: session.role } });
  return Response.json({ ok: true, requestId });
}
