import { z } from 'zod';

import { withApiLogging } from '@/lib/observability/with-api-logging';
import { createVerificationAppeal, listMyAppeals } from '@/lib/data/appeals';
import { requireRole } from '@/lib/data/common';
import { postgresUuidSchema } from '@/lib/request-schemas';

const createSchema = z.object({
  conversationId: postgresUuidSchema,
  body: z.string().trim().min(1, '请写清楚你不同意的结论。').max(2000, '申诉内容请控制在 2000 字以内。'),
});

/** 我提过的申诉。学生端「教师反馈」卡靠它显示处理进度与结论。 */
export async function GET(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'appeals_list', route: '/api/appeals' }, async () => {
    const role = await requireRole('student');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    const result = await listMyAppeals();
    if (!result.ok) return Response.json({ error: result.message }, { status: 500 });
    return Response.json({ appeals: result.data });
  });
}

/** 对已核实的会话提申诉。 */
export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'appeal_create', route: '/api/appeals' }, async () => {
    const role = await requireRole('student');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request', issues: [{ message: 'Malformed JSON body' }] }, { status: 400 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    const result = await createVerificationAppeal(parsed.data.conversationId, parsed.data.body);
    return Response.json(result, { status: result.ok ? 200 : 400 });
  });
}
