import { z } from 'zod';

import { importUsersFromCsv, previewUserCsv } from '@/lib/data/admin';
import { requireRole } from '@/lib/data/common';
import { withApiLogging } from '@/lib/observability/with-api-logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    if (!result.ok) return Response.json({ error: result.message, preview: result.preview }, { status: 422 });
    return Response.json(result);
  });
}
