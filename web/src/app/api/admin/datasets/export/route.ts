import { z } from 'zod';

import { requireRole } from '@/lib/data/common';
import {
  fetchAllPagedRows,
  exportDataset,
  previewDataset,
} from '@/lib/dataset-export';
import {
  firstJoined,
  keepLatestApprovedExports,
  type DatasetFilters,
  type DatasetType,
} from '@/lib/dataset-export-record';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// 托管版 PostgREST 默认 max-rows=1000，预览统计同样必须翻页取尽，否则覆盖率数字失真。
const IN_CLAUSE_CHUNK = 100;

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

type PreviewAuditRow = {
  id: string;
  source_message_id: string | null;
  original_answer: string | null;
  corrected_answer: string | null;
  chosen_answer: string | null;
  rejected_answer: string | null;
  status: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  conversations?: { text_projects?: { title: string | null } | Array<{ title: string | null }> | null } | Array<{ text_projects?: { title: string | null } | Array<{ title: string | null }> | null }> | null;
};

async function getPreviewStats(type: DatasetType, filters: DatasetFilters, sampleLimit: number) {
  const supabase = await createClient();

  let conversationIdFilter: string[] | undefined;
  if (filters.projectIds && filters.projectIds.length > 0) {
    const { rows: conversations, error: conversationError } = await fetchAllPagedRows<{ id: string }>(
      (from, to) => supabase.from('conversations').select('id').in('project_id', filters.projectIds!).range(from, to),
      '导出预览项目筛选失败',
    );
    if (conversationError) throw new Error(conversationError);
    conversationIdFilter = conversations.map((conversation) => conversation.id);
    if (conversationIdFilter.length === 0) return { poemDistribution: [], eligibleRecords: 0, validRecords: 0, invalidRecords: 0, sampleLimit };
  }

  // metadata 是审阅台账，强制 scope='all'（与 dataset-export.ts 的导出语义一致）。
  const scope = type === 'metadata' ? 'all' : (filters.scope ?? 'unexported');
  const chunks = conversationIdFilter ? [] as string[][] : [undefined as unknown as string[]];
  if (conversationIdFilter) {
    for (let index = 0; index < conversationIdFilter.length; index += IN_CLAUSE_CHUNK) {
      chunks.push(conversationIdFilter.slice(index, index + IN_CLAUSE_CHUNK));
    }
  }

  const auditRows: PreviewAuditRow[] = [];
  for (const chunkIds of chunks) {
    const { rows, error } = await fetchAllPagedRows<PreviewAuditRow>(
      (from, to) => {
        let query = supabase
          .from('audit_records')
          .select('id, source_message_id, original_answer, corrected_answer, chosen_answer, rejected_answer, metadata, created_at, updated_at, kind, status, conversations(text_projects(title))')
          .not('source_message_id', 'is', null);

        query = type === 'metadata'
          ? query.in('kind', ['sft', 'dpo']).in('status', ['approved', 'exported'])
          : query.eq('kind', type).in('status', ['approved', 'exported']);

        if (filters.startDate) query = query.gte('created_at', filters.startDate);
        if (filters.endDate) query = query.lte('created_at', filters.endDate);
        if (filters.classId) query = query.eq('class_id', filters.classId);
        if (filters.quality) query = query.eq('quality', filters.quality);
        if (filters.auditorIds && filters.auditorIds.length > 0) query = query.in('auditor_id', filters.auditorIds);
        if (chunkIds) query = query.in('source_conversation_id', chunkIds);
        return query.order('created_at', { ascending: false }).range(from, to);
      },
      '导出预览统计失败',
    );
    if (error) throw new Error(error);
    auditRows.push(...rows);
  }

  const latestRows = keepLatestApprovedExports(auditRows, scope);
  const validRows = latestRows.filter((row) => {
    if (type === 'metadata') return true;
    return type === 'sft'
      ? Boolean(row.corrected_answer ?? row.original_answer)
      : Boolean((row.chosen_answer ?? row.corrected_answer) && (row.rejected_answer ?? row.original_answer));
  });
  const sampledRows = validRows.slice(0, sampleLimit);
  const poemCounts = new Map<string, number>();

  for (const row of sampledRows) {
    const conversation = firstJoined(row.conversations);
    const project = firstJoined(conversation?.text_projects);
    const title = project?.title?.trim() || '未关联篇目';
    poemCounts.set(title, (poemCounts.get(title) ?? 0) + 1);
  }

  return {
    poemDistribution: [...poemCounts.entries()].map(([title, itemCount]) => ({ title, count: itemCount })).sort((left, right) => right.count - left.count),
    eligibleRecords: latestRows.length,
    validRecords: validRows.length,
    invalidRecords: Math.max(latestRows.length - validRows.length, 0),
    sampleLimit,
  };
}

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
        const previewLimit = 100;
        const result = await previewDataset(type, filters as DatasetFilters, previewLimit);

        if ('error' in result) {
          return Response.json(
            { error: result.error, resolution: result.resolution },
            { status: 503 },
          );
        }

        const stats = await getPreviewStats(type, filters as DatasetFilters, previewLimit);
        return Response.json({
          ...result,
          poemDistribution: stats.poemDistribution,
          coverage: {
            eligibleRecords: stats.eligibleRecords,
            validRecords: stats.validRecords,
            invalidRecords: stats.invalidRecords,
            sampleLimit: stats.sampleLimit,
          },
        });
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
