import { z } from 'zod';

import { importUsersFromCsv, previewUserCsv } from '@/lib/data/admin';
import { requireRole } from '@/lib/data/common';
import { withApiLogging } from '@/lib/observability/with-api-logging';

const bodySchema = z.object({
  csvText: z.string().min(1),
  commit: z.boolean().optional(),
});

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'admin_user_import', route: '/api/admin/users/import' }, async () => {
    const role = await requireRole('admin');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    if (!parsed.data.commit) {
      return Response.json(await previewUserCsv(parsed.data.csvText));
    }

    const result = await importUsersFromCsv(parsed.data.csvText);
    // 失败分支也要带上 imported/succeededCount：批量导入是逐行推进的，
    // 半途停下时"已经写进去多少"是管理员决定要不要重跑的唯一依据，
    // 只回一句 error 的话他会以为整份名册都没进去，然后重跑一遍。
    if (!result.ok) {
      return Response.json({ error: result.message, imported: result.imported, succeededCount: result.succeededCount, preview: result.preview }, { status: 422 });
    }
    return Response.json(result);
  });
}
