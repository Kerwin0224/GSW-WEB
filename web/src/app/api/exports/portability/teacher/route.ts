import { z } from 'zod';

import { requireRole } from '@/lib/data/common';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { buildTeacherFinalizedExport } from '@/lib/portability-export';
import { postgresUuidSchema } from '@/lib/request-schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * 教师自导出：自己范围内的核实记录 CSV。
 *
 * 范围 = 任教班级 ∪ 自己拥有的空间，由 audit_records 的读策略决定，
 * 应用层不另写一套可见性（另写一套就会和 RLS 漂移，越权行会在某次迁移后突然冒出来）。
 * 已删除的会话在拼装时剔除：产品语义是删除，导出不能把它绕回来。
 */

const querySchema = z.object({
  dataset: z.literal('finalized').default('finalized'),
  classId: postgresUuidSchema.optional(),
  spaceId: postgresUuidSchema.optional(),
});

export async function GET(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'portability_teacher_export', route: '/api/exports/portability/teacher' }, async () => {
    const role = await requireRole('teacher');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    try {
      const document = await buildTeacherFinalizedExport({ classId: parsed.data.classId, spaceId: parsed.data.spaceId });
      return new Response(document.body, {
        headers: {
          'content-type': document.contentType,
          'content-disposition': `attachment; filename="portability-finalized.csv"; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
          'cache-control': 'no-store',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Response.json({ error: `导出失败：${message}` }, { status: 500 });
    }
  });
}
