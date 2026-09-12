import 'server-only';

import {
  DEFAULT_EXPORT_SCOPE,
  keepLatestApprovedExports,
  toDpoRecord,
  toMetadataRecord,
  toSftRecord,
  type ConversationLike,
  type DatasetFilters,
  type DatasetExportScope,
  type DatasetType,
  type DpoRecord,
  type ExportableAuditRow,
  type ExportResult,
  type MetadataRecord,
  type PreviewResult,
  type SftRecord,
  type TranscriptMessageLike,
} from '@/lib/dataset-export-record';
import { createClient } from '@/lib/supabase/server';

export type {
  DatasetType,
  DatasetExportScope,
  DatasetFilters,
  SftRecord,
  MetadataRecord,
  DpoRecord,
  ExportResult,
  PreviewResult,
} from '@/lib/dataset-export-record';
export type { DatasetError } from '@/lib/dataset-export-record';

// 托管版 PostgREST 默认 max-rows=1000：任何一次全量查询不翻页都会静默截断，
// 曾导致导出totalCount失真、transcript 缺失后样本静默退化为单条 prompt。
const PAGE_SIZE = 500;
// .in() 条件以 URL 传递，几千个 id 会超长；按块拆分。
const IN_CLAUSE_CHUNK = 100;

/**
 * 翻页取尽一个查询：每页 PAGE_SIZE 行，直到返回不足一页。
 * buildPage 必须每次构造全新查询（supabase builder 是可变对象，不能复用已执行过的实例）。
 */
export async function fetchAllPagedRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<{ rows: T[]; error?: string }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: `${label}：${error.message}` };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { rows };
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function applySharedFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  type: DatasetType,
  filters: DatasetFilters,
) {
  // metadata 是审阅台账：SFT 导出后记录会被标 exported，若按 unexported 过滤，
  // 台账里的历史样本会立即消失，与台账直觉相悖，因此 metadata 强制 scope='all'。
  const scope: DatasetExportScope = type === 'metadata' ? 'all' : (filters.scope ?? DEFAULT_EXPORT_SCOPE);
  query = type === 'metadata'
    ? query.in('kind', ['sft', 'dpo']).in('status', ['approved', 'exported'])
    : query.eq('kind', type).in('status', ['approved', 'exported']);

  if (filters.startDate) query = query.gte('created_at', filters.startDate);
  if (filters.endDate) query = query.lte('created_at', filters.endDate);
  if (filters.classId) query = query.eq('class_id', filters.classId);
  if (filters.quality) query = query.eq('quality', filters.quality);
  if (filters.auditorIds && filters.auditorIds.length > 0) query = query.in('auditor_id', filters.auditorIds);
  return { query, scope };
}

type DatasetRecordContext = {
  record: ExportableAuditRow;
  conversation: ConversationLike | null;
  transcript: TranscriptMessageLike[];
};

async function fetchAuditRecords(
  type: DatasetType,
  filters: DatasetFilters,
  limit?: number,
): Promise<{ records: DatasetRecordContext[]; totalCount: number; error?: string }> {
  const supabase = await createClient();

  let conversationIdFilter: string[] | undefined;
  if (filters.projectIds && filters.projectIds.length > 0) {
    const { rows: conversations, error: convError } = await fetchAllPagedRows(
      (from, to) => supabase.from('conversations').select('id').in('project_id', filters.projectIds!).range(from, to),
      '查询关联会话失败',
    );
    if (convError) return { records: [], totalCount: 0, error: convError };

    conversationIdFilter = conversations.map((conversation) => conversation.id);
    if (conversationIdFilter.length === 0) return { records: [], totalCount: 0 };
  }

  // 项目筛选命中大量会话时，.in() 按 URL 上限分块；各块结果合并后再去重取 latest。
  const conversationChunks = conversationIdFilter ? chunk(conversationIdFilter, IN_CLAUSE_CHUNK) : [undefined];
  const auditRows: ExportableAuditRow[] = [];
  for (const chunkIds of conversationChunks) {
    const { rows, error } = await fetchAllPagedRows<ExportableAuditRow>(
      (from, to) => {
        const { query, scope: _scope } = applySharedFilters(
          supabase.from('audit_records').select(
            'id, source_message_id, kind, status, prompt, original_answer, corrected_answer, chosen_answer, rejected_answer, quality, class_id, auditor_id, source_conversation_id, metadata, created_at, updated_at',
          ),
          type,
          filters,
        );
        const scoped = chunkIds ? query.in('source_conversation_id', chunkIds) : query;
        return scoped.not('source_message_id', 'is', null).order('created_at', { ascending: false }).range(from, to);
      },
      '查询审计记录失败',
    );
    if (error) return { records: [], totalCount: 0, error };
    auditRows.push(...rows);
  }

  const scope = type === 'metadata' ? 'all' : (filters.scope ?? DEFAULT_EXPORT_SCOPE);
  const latestRecords = keepLatestApprovedExports(auditRows, scope);
  const slicedRecords = limit === undefined ? latestRecords : latestRecords.slice(0, limit);
  const conversationIds = [...new Set(slicedRecords.map((record) => record.source_conversation_id).filter((value): value is string => Boolean(value)))];

  if (conversationIds.length === 0) {
    return {
      records: slicedRecords.map((record) => ({ record, conversation: null, transcript: [] })),
      totalCount: latestRecords.length,
    };
  }

  const conversationResults = await Promise.all(chunk(conversationIds, IN_CLAUSE_CHUNK).map(async (chunkIds) => {
    const { rows, error } = await fetchAllPagedRows<ConversationLike>(
      (from, to) => supabase.from('conversations').select('id, owner_id, project_id, title, text_projects(title)').in('id', chunkIds).range(from, to),
      '查询会话上下文失败',
    );
    return { rows, error };
  }));
  const conversationsError = conversationResults.find((result) => result.error)?.error;
  if (conversationsError) return { records: [], totalCount: 0, error: conversationsError };
  const conversationsById = new Map(conversationResults.flatMap((result) => result.rows).map((conversation) => [conversation.id, conversation]));

  // transcript 按会话分块翻页取尽：任何一页截断都会让 buildPromptMessages
  // 静默回退成单条 prompt，样本退化不能发生。
  const transcriptResults = await Promise.all(chunk(conversationIds, IN_CLAUSE_CHUNK).map(async (chunkIds) => {
    const { rows, error } = await fetchAllPagedRows<TranscriptMessageLike>(
      (from, to) => supabase.from('conversation_messages').select('id, conversation_id, role, content, created_at')
        .in('conversation_id', chunkIds).order('created_at', { ascending: true }).range(from, to),
      '查询会话消息失败',
    );
    return { rows, error };
  }));
  const transcriptError = transcriptResults.find((result) => result.error)?.error;
  if (transcriptError) return { records: [], totalCount: 0, error: transcriptError };

  const transcriptByConversationId = new Map<string, TranscriptMessageLike[]>();
  for (const row of transcriptResults.flatMap((result) => result.rows)) {
    const current = transcriptByConversationId.get(row.conversation_id) ?? [];
    current.push(row);
    transcriptByConversationId.set(row.conversation_id, current);
  }

  return {
    records: slicedRecords.map((record) => ({
      record,
      conversation: record.source_conversation_id ? conversationsById.get(record.source_conversation_id) ?? null : null,
      transcript: record.source_conversation_id ? transcriptByConversationId.get(record.source_conversation_id) ?? [] : [],
    })),
    totalCount: latestRecords.length,
  };
}

export async function exportDataset(
  type: DatasetType,
  filters: DatasetFilters = {},
): Promise<ExportResult & { empty?: boolean }> {
  try {
    const { records, error } = await fetchAuditRecords(type, filters);
    if (error) {
      return {
        success: false,
        error: `查询审计记录失败：${error}`,
        resolution: '请检查筛选条件是否合法，或确认数据库连接正常。',
      };
    }

    if (records.length === 0) {
      // 纯空结果是正常业务状态而非服务故障：route 层据此返回 200 + empty。
      return {
        success: false,
        empty: true,
        error: '没有符合条件的审计记录可导出',
        resolution: '请放宽筛选条件，或确认存在尚未导出的最新可导出样本。',
      };
    }

    const lines: string[] = [];
    const recordIds: string[] = [];

    for (const record of records) {
      const converted = type === 'sft'
        ? toSftRecord(record)
        : type === 'dpo'
          ? toDpoRecord(record)
          : toMetadataRecord(record);
      if (!converted) continue;
      lines.push(JSON.stringify(converted));
      recordIds.push(record.record.id);
    }

    if (recordIds.length === 0) {
      return {
        success: false,
        error: `没有有效的 ${type.toUpperCase()} 记录可导出`,
        resolution:
          type === 'sft'
            ? 'SFT 格式需要包含可回放的上下文消息与最新 assistant 内容；请确认核实记录和会话上下文完整。'
            : type === 'dpo'
              ? 'DPO 格式需要同时包含 chosen 和 rejected 答案；请确认最新修订记录包含完整偏好对。'
              : '审阅元数据需要关联可导出样本；请确认教师已确认无误或修订回答。',
      };
    }

    return {
      success: true,
      recordCount: recordIds.length,
      recordIds,
      jsonl: lines.join('\n'),
      exportedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `数据集导出失败：${message}`,
    };
  }
}

export async function previewDataset(
  type: DatasetType,
  filters: DatasetFilters = {},
  limit: number = 10,
): Promise<PreviewResult> {
  try {
    const { records, totalCount, error } = await fetchAuditRecords(type, filters, limit);
    if (error) {
      return {
        error: `查询审计记录失败：${error}`,
        resolution: '请检查筛选条件是否合法，或确认数据库连接正常。',
      };
    }

    const sampleRecords: Array<SftRecord | MetadataRecord | DpoRecord> = [];

    for (const record of records) {
      const converted = type === 'sft'
        ? toSftRecord(record)
        : type === 'dpo'
          ? toDpoRecord(record)
          : toMetadataRecord(record);
      if (converted) sampleRecords.push(converted);
    }

    return {
      type,
      totalCount,
      sampleRecords,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      error: `预览数据集失败：${message}`,
    };
  }
}
