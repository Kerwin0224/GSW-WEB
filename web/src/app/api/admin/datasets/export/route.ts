import { z } from 'zod';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { requireRole } from '@/lib/data/common';
import { exportDataset, previewDataset, type DatasetFilters } from '@/lib/dataset-export';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const exportSchema = z.object({
  type: z.enum(['sft', 'dpo']),
  filters: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    projectIds: z.array(z.string()).optional(),
    auditorIds: z.array(z.string()).optional(),
    classId: z.string().nullable().optional(),
    quality: z.string().nullable().optional(),
  }).optional(),
  preview: z.boolean().optional(),
});

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function getPreviewStats(type: 'sft' | 'dpo', filters: DatasetFilters, sampleLimit: number) {
  const supabase = await createClient();
  let query = supabase
    .from('audit_records')
    .select('id, source_conversation_id, conversations(text_projects(title))', { count: 'exact' })
    .eq('kind', type)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(sampleLimit);

  if (filters.startDate) query = query.gte('created_at', filters.startDate);
  if (filters.endDate) query = query.lte('created_at', filters.endDate);
  if (filters.classId) query = query.eq('class_id', filters.classId);
  if (filters.quality) query = query.eq('quality', filters.quality);
  if (filters.auditorIds && filters.auditorIds.length > 0) query = query.in('auditor_id', filters.auditorIds);

  const { data, count } = await query;
  const poemCounts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{
    conversations?: { text_projects?: { title: string | null } | Array<{ title: string | null }> | null } | Array<{ text_projects?: { title: string | null } | Array<{ title: string | null }> | null }> | null;
  }>) {
    const conversation = firstJoined(row.conversations);
    const project = firstJoined(conversation?.text_projects);
    const title = project?.title?.trim() || '未关联篇目';
    poemCounts.set(title, (poemCounts.get(title) ?? 0) + 1);
  }

  return {
    poemDistribution: [...poemCounts.entries()].map(([title, itemCount]) => ({ title, count: itemCount })).sort((left, right) => right.count - left.count),
    approvedRecords: count ?? 0,
  };
}

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'dataset_export', route: '/api/admin/datasets/export' }, async () => {
    const role = await requireRole('admin');
    if (!role.ok) {
      return Response.json(
        { error: role.message },
        { status: role.reason === 'forbidden' ? 403 : 401 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: 'Invalid request', issues: [{ message: 'Malformed JSON body' }] },
        { status: 400 }
      );
    }

    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { type, filters = {}, preview = false } = parsed.data;

    try {
      if (preview) {
        const previewLimit = 100;
        const result = await previewDataset(type, filters as DatasetFilters, previewLimit);

        if ('error' in result) {
          return Response.json(
            { error: result.error, resolution: result.resolution },
            { status: 503 }
          );
        }

        const stats = await getPreviewStats(type, filters as DatasetFilters, previewLimit);
        return Response.json({
          ...result,
          poemDistribution: stats.poemDistribution,
          coverage: {
            approvedRecords: stats.approvedRecords,
            validRecords: result.sampleRecords.length,
            invalidRecords: Math.max(0, Math.min(stats.approvedRecords, previewLimit) - result.sampleRecords.length),
            sampleLimit: previewLimit,
          },
        });
      }

      const result = await exportDataset(type, filters as DatasetFilters);

      if (!result.success) {
        return Response.json(
          { error: result.error, resolution: result.resolution },
          { status: 503 }
        );
      }

      const supabase = await createClient();
      const { data: batch, error: batchError } = await supabase
        .from('export_batches')
        .insert({ export_type: type, record_count: result.recordCount, jsonl: result.jsonl, created_by: role.data.id })
        .select('id')
        .single();
      if (batchError || !batch) {
        return Response.json({ error: `导出批次保存失败：${batchError?.message ?? 'unknown'}` }, { status: 500 });
      }

      return Response.json({
        success: true,
        batchId: batch.id,
        recordCount: result.recordCount,
        exportedAt: result.exportedAt,
        downloadUrl: `/api/admin/datasets/download?batchId=${batch.id}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Response.json(
        { error: `Dataset export failed: ${message}` },
        { status: 500 }
      );
    }
  });
}
