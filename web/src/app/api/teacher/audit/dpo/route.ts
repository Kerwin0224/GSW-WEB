import { z } from 'zod';

import { reviseLearningRecord } from '@/lib/data/teacher-actions';
import { requireRole } from '@/lib/data/common';
import { withApiLogging } from '@/lib/observability/with-api-logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sourceMessageId: z.string().uuid(),
  correctedAnswer: z.string().min(1),
  rationale: z.string().min(1),
});

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'teacher_audit_dpo', route: '/api/teacher/audit/dpo' }, async () => {
    // 纵深防御：reviseLearningRecord 内部也会 requireRole('teacher')，
    // 这里显式拒绝一次，避免未来换调用点时路由层裸奔。
    const role = await requireRole('teacher');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    const formData = new FormData();
    formData.set('corrected_answer', parsed.data.correctedAnswer);
    formData.set('rationale', parsed.data.rationale);

    const result = await reviseLearningRecord(parsed.data.sourceMessageId, { ok: false, message: '' }, formData);
    if (!result.ok) return Response.json({ error: result.message, errors: result.errors }, { status: 422 });
    return Response.json(result);
  });
}
