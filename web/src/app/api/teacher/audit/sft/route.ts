import { z } from 'zod';

import { submitSftAudit } from '@/lib/data/teacher-actions';
import { withApiLogging } from '@/lib/observability/with-api-logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sourceMessageId: z.string().uuid(),
});

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'teacher_audit_sft', route: '/api/teacher/audit/sft' }, async () => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    const result = await submitSftAudit(parsed.data.sourceMessageId, { ok: false, message: '' }, new FormData());
    if (!result.ok) return Response.json({ error: result.message, errors: result.errors }, { status: 422 });
    return Response.json(result);
  });
}
