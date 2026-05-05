import { z } from 'zod';

import { requireRole } from '@/lib/data/common';
import { previewDataset } from '@/lib/dataset-export';
import { withApiLogging } from '@/lib/observability/with-api-logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  type: z.enum(['sft', 'dpo']),
});

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'teacher_dataset_preview', route: '/api/teacher/datasets/preview' }, async () => {
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

    const result = await previewDataset(parsed.data.type, { auditorIds: [role.data.id] }, 100);
    if ('error' in result) return Response.json({ error: result.error, resolution: result.resolution }, { status: 503 });

    return Response.json({
      ...result,
      role: 'teacher',
      exportAllowed: false,
      message: '教师可预览自己审定的数据；正式导出由管理员执行。',
    });
  });
}
