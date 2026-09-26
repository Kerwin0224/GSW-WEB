import { z } from 'zod';

import { requireAnyRole } from '@/lib/data/common';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import {
  buildStudentAttachmentsExport,
  buildStudentChallengesExport,
  buildStudentConversationsExport,
  buildStudentSummaryExport,
  type StudentDataset,
} from '@/lib/portability-export';
import { postgresUuidSchema } from '@/lib/request-schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * 学生自导出（owner）与管理员代取（admin）双路。
 *
 * 学生只能导自己的：ownerId 恒等于本人，参数里的 owner 传什么都会被忽略。
 * 管理员可以带 owner=<某个学生> 取数——范围最终仍由 RLS 裁剪，
 * 越出管理员学校的行读不出来，也就无从泄露。
 */

const querySchema = z.object({
  dataset: z.enum(['conversations', 'challenges', 'summary', 'attachments']),
  format: z.enum(['json', 'md', 'csv']).optional(),
  owner: postgresUuidSchema.optional(),
  spaceId: postgresUuidSchema.optional(),
  /** 'all' = 不按空间过滤；缺省表示不限空间。 */
  space: z.enum(['all']).optional(),
});

export async function GET(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'portability_student_export', route: '/api/exports/portability/student' }, async () => {
    const role = await requireAnyRole(['student', 'admin', 'org_admin']);
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    const isOwner = role.data.role === 'student';
    // 学生路径：owner 恒为本人，带不带参数都拿不到别人的数据。
    const ownerId = isOwner ? role.data.id : (parsed.data.owner ?? role.data.id);
    if (!isOwner && !parsed.data.owner) {
      return Response.json({ error: '管理员代取需要指定 owner=<学生 id>。' }, { status: 400 });
    }

    const dataset: StudentDataset = parsed.data.dataset;
    // 格式随数据集走：会话支持 Markdown/JSON，其余两类本来就是表，固定 CSV/JSON。
    const format = parsed.data.format
      ?? (dataset === 'conversations' ? 'md' : dataset === 'attachments' || dataset === 'challenges' ? 'csv' : 'json');

    try {
      const document = dataset === 'conversations'
        ? await buildStudentConversationsExport(ownerId, format)
        : dataset === 'challenges'
          ? await buildStudentChallengesExport(ownerId)
          : dataset === 'attachments'
            ? await buildStudentAttachmentsExport(ownerId)
            : await buildStudentSummaryExport(ownerId, parsed.data.space === 'all' ? undefined : parsed.data.spaceId);

      return new Response(document.body, {
        headers: {
          'content-type': document.contentType,
          // 中文文件名必须走 RFC 5987 的 filename*，只写 filename 会被浏览器截成乱码。
          'content-disposition': `attachment; filename="portability-${dataset}.${format}"; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
          'cache-control': 'no-store',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Response.json({ error: `导出失败：${message}` }, { status: 500 });
    }
  });
}
