import { z } from 'zod';

import { requireRole } from '@/lib/data/common';
import { exportDataset, previewDataset, type DatasetFilters, type DatasetType } from '@/lib/dataset-export';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const exportSchema = z.object({
  type: z.enum(['sft', 'dpo', 'metadata']),
  filters: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    projectIds: z.array(z.string()).optional(),
    auditorIds: z.array(z.string()).optional(),
    classId: z.string().nullable().optional(),
    quality: z.string().nullable().optional(),
    scope: z.enum(['unexported', 'all']).optional(),
  }).optional(),
  preview: z.boolean().optional(),
});

type PreviewAuditRow = {
  id: string;
  source_message_id: string | null;
  original_answer: string | null;
  corrected_answer: string | null;
  chosen_answer: string | null;
  rejected_answer: string | null;
  kind: 'sft' | 'dpo';
  status: 'approved' | 'exported';
  metadata: unknown;
  created_at: string;
  updated_at: string;
  conversations?: { text_projects?: { title: string | null } | Array<{ title: string | null }> | null } | Array<{ text_projects?: { title: string | null } | Array<{ title: string | null }> | null }> | null;
};

const EXPORTABLE_AUDIT_STATUSES: PreviewAuditRow['status'][] = ['approved', 'exported'];

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function recordTimestamp(row: Pick<PreviewAuditRow, 'updated_at' | 'created_at'>) {
  return row.updated_at || row.created_at;
}

function asMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isFinalizedExportRecord(row: PreviewAuditRow) {
  return asMetadataObject(row.metadata).conversation_action === 'conversation_finalized';
}

function keepLatestBySourceMessage(rows: PreviewAuditRow[]) {
  const latest = new Map<string, PreviewAuditRow>();

  for (const row of rows) {
    if (!row.source_message_id) continue;
    const previous = latest.get(row.source_message_id);
    if (!previous || recordTimestamp(row) >= recordTimestamp(previous)) latest.set(row.source_message_id, row);
  }

  return [...latest.values()].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function keepLatestApprovedExports(rows: PreviewAuditRow[], scope: DatasetFilters['scope'] = 'unexported') {
  const latestRows = keepLatestBySourceMessage(
    rows.filter((row) => EXPORTABLE_AUDIT_STATUSES.includes(row.status) && isFinalizedExportRecord(row)),
  );
  return scope === 'all'
    ? latestRows
    : latestRows.filter((row) => row.status === 'approved');
}

async function getPreviewStats(type: DatasetType, filters: DatasetFilters, sampleLimit: number) {
  const supabase = await createClient();
  let query = supabase
    .from('audit_records')
    .select('id, source_message_id, original_answer, corrected_answer, chosen_answer, rejected_answer, metadata, created_at, updated_at, kind, status, conversations(text_projects(title))')
    .not('source_message_id', 'is', null)
    .order('created_at', { ascending: false });

  query = type === 'metadata'
    ? query.in('kind', ['sft', 'dpo']).in('status', EXPORTABLE_AUDIT_STATUSES)
    : query.eq('kind', type).in('status', EXPORTABLE_AUDIT_STATUSES);

  if (filters.startDate) query = query.gte('created_at', filters.startDate);
  if (filters.endDate) query = query.lte('created_at', filters.endDate);
  if (filters.classId) query = query.eq('class_id', filters.classId);
  if (filters.quality) query = query.eq('quality', filters.quality);
  if (filters.auditorIds && filters.auditorIds.length > 0) query = query.in('auditor_id', filters.auditorIds);

  if (filters.projectIds && filters.projectIds.length > 0) {
    const { data: conversations, error: conversationError } = await supabase.from('conversations').select('id').in('project_id', filters.projectIds);
    if (conversationError) throw new Error(`导出预览项目筛选失败：${conversationError.message}`);
    const conversationIds = (conversations ?? []).map((conversation) => conversation.id);
    if (conversationIds.length === 0) return { poemDistribution: [], eligibleRecords: 0, validRecords: 0, invalidRecords: 0, sampleLimit };
    query = query.in('source_conversation_id', conversationIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(`导出预览统计失败：${error.message}`);

  const latestRows = keepLatestApprovedExports((data ?? []) as PreviewAuditRow[], filters.scope ?? 'unexported');
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
        return Response.json(
          { error: result.error, resolution: result.resolution },
          { status: 503 },
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

      if (type !== 'metadata') {
        const { error: exportMarkError } = await supabase
          .from('audit_records')
          .update({ status: 'exported', exported_at: result.exportedAt })
          .in('id', result.recordIds);
        if (exportMarkError) {
          const { error: rollbackError } = await supabase.from('export_batches').delete().eq('id', batch.id);
          if (rollbackError) {
            return Response.json({ error: `导出状态回写失败：${exportMarkError.message}；导出批次回滚失败：${rollbackError.message}` }, { status: 500 });
          }
          return Response.json({ error: `导出状态回写失败：${exportMarkError.message}` }, { status: 500 });
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
