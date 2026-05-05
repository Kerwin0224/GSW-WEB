import { z } from 'zod';

import { requireRole } from '@/lib/data/common';
import { createClient } from '@/lib/supabase/server';
import { withApiLogging } from '@/lib/observability/with-api-logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  batchId: z.string().uuid(),
});

export async function GET(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'dataset_download', route: '/api/admin/datasets/download' }, async () => {
    const role = await requireRole('admin');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('export_batches')
      .select('id, export_type, jsonl')
      .eq('id', parsed.data.batchId)
      .single();

    if (error || !data) return Response.json({ error: `导出批次不存在：${error?.message ?? 'not found'}` }, { status: 404 });

    return new Response(data.jsonl, {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'content-disposition': `attachment; filename="${data.export_type}-dataset-${data.id}.jsonl"`,
      },
    });
  });
}
