import { z } from 'zod';

import { writeLogEvent } from '@/lib/observability/server-log-store';
import { createRequestId } from '@/lib/observability/log-event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clientLogSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('error'),
  area: z.literal('client').default('client'),
  event: z.string().trim().min(1).max(120),
  route: z.string().trim().max(240).optional(),
  message: z.string().trim().max(800).optional(),
  digest: z.string().trim().max(160).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const requestId = createRequestId('log');
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await writeLogEvent({ level: 'warn', area: 'api', event: 'client_log_invalid_json', requestId, route: '/api/logs', method: 'POST', status: 400 });
    return Response.json({ ok: false, requestId }, { status: 400 });
  }

  const parsed = clientLogSchema.safeParse(body);
  if (!parsed.success) {
    await writeLogEvent({ level: 'warn', area: 'api', event: 'client_log_invalid_payload', requestId, route: '/api/logs', method: 'POST', status: 400, context: parsed.error.flatten() });
    return Response.json({ ok: false, requestId }, { status: 400 });
  }

  await writeLogEvent({ ...parsed.data, requestId, route: parsed.data.route ?? request.headers.get('referer') ?? undefined });
  return Response.json({ ok: true, requestId });
}
