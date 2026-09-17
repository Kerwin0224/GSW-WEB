import { z } from 'zod';

import { requireRole } from '@/lib/data/common';
import {
  exportDataset,
  previewDataset,
} from '@/lib/dataset-export';
import type { DatasetFilters } from '@/lib/dataset-export-record';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const dateLike = z.string().refine((value) => !Number.isNaN(Date.parse(value)), '不是合法日期');

const exportSchema = z.object({
  type: z.enum(['sft', 'dpo', 'metadata']),
  filters: z.object({
    startDate: dateLike.optional(),
    endDate: dateLike.optional(),
    projectIds: z.array(z.string()).optional(),
    auditorIds: z.array(z.string()).optional(),
    classId: z.string().nullable().optional(),
    quality: z.string().nullable().optional(),
    scope: z.enum(['unexported', 'all']).optional(),
  })
    .refine((value) => !value.startDate || !value.endDate || Date.parse(value.startDate) <= Date.parse(value.endDate), {
      message: '开始日期不能晚于结束日期',
    })
    .optional(),
  preview: z.boolean().optional(),
});

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'dataset_export', route: '/api/admin/datasets/export' }, async () => {
    const role = await requireRole('admin');
    if (!role.ok) {
      return Response.json(
        { error: role.message },
        { status: role.reason === 'forbidden' ? 403 : 401 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: 'Invalid request', issues: [{ message: 'Malformed JSON body' }] },
        { status: 400 },
      );
    }

    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { type, filters = {}, preview = false } = parsed.data;

    try {
      if (preview) {
        // 预览样本与覆盖率、项目分布都出自 previewDataset 的这一次查询。
        const result = await previewDataset(type, filters as DatasetFilters, 100);

        if ('error' in result) {
          return Response.json(
            { error: result.error, resolution: result.resolution },
            { status: 503 },
          );
        }

        return Response.json(result);
      }

      const result = await exportDataset(type, filters as DatasetFilters);

      if (!result.success) {
        // 纯空结果是正常业务状态，返回 200 + empty 而不是 5xx。
        if ('empty' in result && result.empty) {
          return Response.json({ success: false, empty: true, error: result.error, resolution: result.resolution });
        }
        return Response.json(
          { error: result.error, resolution: result.resolution },
          { status: 503 },
        );
      }

      const supabase = await createClient();
      const { data: batch, error: batchError } = await supabase
        .from('export_batches')
        .insert({ export_type: type, record_count: result.recordCount, jsonl: result.jsonl, school_id: role.data.school_id, created_by: role.data.id })
        .select('id')
        .single();
      if (batchError || !batch) {
        return Response.json({ error: `导出批次保存失败：${batchError?.message ?? 'unknown'}` }, { status: 500 });
      }

      if (type !== 'metadata') {
        // 只把仍处于 approved 的记录标为 exported：并发导出时后到者标记行数不足，
        // 按失败回滚批次，避免把别人批次的记录静默覆盖 exported_at。
        const { data: marked, error: exportMarkError } = await supabase
          .from('audit_records')
          .update({ status: 'exported', exported_at: result.exportedAt })
          .in('id', result.recordIds)
          .eq('status', 'approved')
          .select('id');
        const markedCount = marked?.length ?? 0;
        if (exportMarkError || markedCount !== result.recordIds.length) {
          const { error: rollbackError } = await supabase.from('export_batches').delete().eq('id', batch.id);
          const reason = exportMarkError?.message ?? `仅 ${markedCount}/${result.recordIds.length} 条仍为 approved，可能存在并发导出`;
          if (rollbackError) {
            return Response.json({ error: `导出状态回写失败：${reason}；导出批次回滚失败：${rollbackError.message}` }, { status: 500 });
          }
          return Response.json({ error: `导出状态回写失败：${reason}` }, { status: 409 });
        }
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
        { status: 500 },
      );
    }
  });
}
