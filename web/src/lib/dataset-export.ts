import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type DatasetType = 'sft' | 'dpo' | 'metadata';
export type DatasetExportScope = 'unexported' | 'all';

export type DatasetFilters = {
  startDate?: string;
  endDate?: string;
  projectIds?: string[];
  auditorIds?: string[];
  classId?: string | null;
  quality?: string | null;
  scope?: DatasetExportScope;
};

export type SftMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ExportSampleMetadata = {
  sampleId: string;
  sourceRecordId: string;
  sourceMessageId: string | null;
  sourceConversationId: string | null;
  classId: string | null;
  projectId: string | null;
  projectTitle: string | null;
  studentAnonId: string | null;
  teacherId: string | null;
  reviewStatus: string;
  reviewedAt: string;
  includesSft: boolean;
  includesDpo: boolean;
};

export type SftRecord = {
  messages: SftMessage[];
  metadata: ExportSampleMetadata;
};

export type MetadataRecord = ExportSampleMetadata;

export type DpoRecord = {
  prompt: string;
  messages: SftMessage[];
  chosen: string;
  rejected: string;
  metadata: ExportSampleMetadata & {
    chosenAnswerId: string;
    rejectedAnswerId: string;
  };
};

export type DatasetError = {
  error: string;
  resolution?: string;
};

export type ExportResult =
  | {
      success: true;
      recordCount: number;
      recordIds: string[];
      jsonl: string;
      exportedAt: string;
    }
  | {
      success: false;
      error: string;
      resolution?: string;
    };

export type PreviewResult =
  | {
      type: DatasetType;
      totalCount: number;
      sampleRecords: Array<SftRecord | DpoRecord | MetadataRecord>;
    }
  | DatasetError;

type AuditRecordRow = {
  id: string;
  source_message_id: string | null;
  kind: Database['public']['Tables']['audit_records']['Row']['kind'];
  status: Database['public']['Tables']['audit_records']['Row']['status'];
  prompt: string;
  original_answer: string | null;
  corrected_answer: string | null;
  chosen_answer: string | null;
  rejected_answer: string | null;
  quality: string | null;
  class_id: string | null;
  auditor_id: string | null;
  source_conversation_id: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

type ConversationRow = {
  id: string;
  owner_id: string;
  project_id: string | null;
  title: string | null;
  text_projects?: { title: string | null } | Array<{ title: string | null }> | null;
};

type TranscriptMessageRow = {
  id: string;
  conversation_id: string;
  role: Database['public']['Tables']['conversation_messages']['Row']['role'];
  content: string;
  created_at: string;
};

type DatasetContext = {
  record: AuditRecordRow;
  conversation: ConversationRow | null;
  transcript: TranscriptMessageRow[];
};

const EXPORTABLE_AUDIT_STATUSES: Array<AuditRecordRow['status']> = ['approved', 'exported'];
const DEFAULT_EXPORT_SCOPE: DatasetExportScope = 'unexported';

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getRecordTimestamp(record: Pick<AuditRecordRow, 'updated_at' | 'created_at'>) {
  return record.updated_at || record.created_at;
}

function asMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isFinalizedExportRecord(record: AuditRecordRow) {
  return asMetadataObject(record.metadata).conversation_action === 'conversation_finalized';
}

function keepLatestBySourceMessage(records: AuditRecordRow[]) {
  const latest = new Map<string, AuditRecordRow>();

  for (const record of records) {
    if (!record.source_message_id) continue;
    const previous = latest.get(record.source_message_id);
    if (!previous || getRecordTimestamp(record) >= getRecordTimestamp(previous)) {
      latest.set(record.source_message_id, record);
    }
  }

  return [...latest.values()].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function keepLatestApprovedExports(records: AuditRecordRow[], scope: DatasetExportScope = DEFAULT_EXPORT_SCOPE) {
  const latestRecords = keepLatestBySourceMessage(
    records.filter((record) => EXPORTABLE_AUDIT_STATUSES.includes(record.status) && isFinalizedExportRecord(record)),
  );
  return scope === 'all'
    ? latestRecords
    : latestRecords.filter((record) => record.status === 'approved');
}

function anonymizeStudentId(ownerId: string | null | undefined) {
  return ownerId ? `student_${ownerId.slice(0, 8)}` : null;
}

function toDatasetMessage(message: TranscriptMessageRow): SftMessage | null {
  if (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') return null;
  const content = message.content.trim();
  if (!content) return null;
  return { role: message.role, content };
}

function buildPromptMessages(context: DatasetContext): SftMessage[] {
  const sourceIndex = context.record.source_message_id
    ? context.transcript.findIndex((message) => message.id === context.record.source_message_id)
    : -1;
  const promptTranscript = sourceIndex >= 0 ? context.transcript.slice(0, sourceIndex) : [];
  const promptMessages = promptTranscript.map(toDatasetMessage).filter((message): message is SftMessage => Boolean(message));
  if (promptMessages.length > 0) return promptMessages;

  const fallbackPrompt = context.record.prompt.trim();
  return fallbackPrompt ? [{ role: 'user', content: fallbackPrompt }] : [];
}

function getPromptText(messages: SftMessage[], fallback: string) {
  return [...messages].reverse().find((message) => message.role === 'user')?.content ?? fallback.trim();
}

function getSampleId(record: AuditRecordRow) {
  return record.source_message_id ?? record.id;
}

function includesDpo(record: AuditRecordRow) {
  return record.kind === 'dpo' || Boolean(record.chosen_answer?.trim() && record.rejected_answer?.trim());
}

function buildMetadata(context: DatasetContext): ExportSampleMetadata {
  const project = firstJoined(context.conversation?.text_projects);
  return {
    sampleId: getSampleId(context.record),
    sourceRecordId: context.record.id,
    sourceMessageId: context.record.source_message_id,
    sourceConversationId: context.record.source_conversation_id,
    classId: context.record.class_id,
    projectId: context.conversation?.project_id ?? null,
    projectTitle: project?.title?.trim() || context.conversation?.title?.trim() || null,
    studentAnonId: anonymizeStudentId(context.conversation?.owner_id),
    teacherId: context.record.auditor_id,
    reviewStatus: context.record.status,
    reviewedAt: getRecordTimestamp(context.record),
    includesSft: true,
    includesDpo: includesDpo(context.record),
  };
}

function toSftRecord(context: DatasetContext): SftRecord | null {
  const assistantContent = (context.record.corrected_answer ?? context.record.original_answer)?.trim();
  if (!assistantContent) return null;

  return {
    messages: [...buildPromptMessages(context), { role: 'assistant', content: assistantContent }],
    metadata: buildMetadata(context),
  };
}

function toDpoRecord(context: DatasetContext): DpoRecord | null {
  const chosen = (context.record.chosen_answer ?? context.record.corrected_answer)?.trim();
  const rejected = (context.record.rejected_answer ?? context.record.original_answer)?.trim();
  if (!chosen || !rejected) return null;

  const messages = buildPromptMessages(context);
  return {
    prompt: getPromptText(messages, context.record.prompt),
    messages,
    chosen,
    rejected,
    metadata: {
      ...buildMetadata(context),
      chosenAnswerId: `${getSampleId(context.record)}:chosen`,
      rejectedAnswerId: `${getSampleId(context.record)}:rejected`,
    },
  };
}

function toMetadataRecord(context: DatasetContext): MetadataRecord {
  return buildMetadata(context);
}

async function fetchAuditRecords(
  type: DatasetType,
  filters: DatasetFilters,
  limit?: number,
): Promise<{ records: DatasetContext[]; totalCount: number; error?: string }> {
  const supabase = await createClient();

  let conversationIdFilter: string[] | undefined;
  if (filters.projectIds && filters.projectIds.length > 0) {
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .in('project_id', filters.projectIds);

    if (convError) {
      return { records: [], totalCount: 0, error: `查询关联会话失败：${convError.message}` };
    }

    conversationIdFilter = (conversations ?? []).map((conversation) => conversation.id);
    if (conversationIdFilter.length === 0) return { records: [], totalCount: 0 };
  }

  let query = supabase
    .from('audit_records')
    .select(
      'id, source_message_id, kind, status, prompt, original_answer, corrected_answer, chosen_answer, rejected_answer, quality, class_id, auditor_id, source_conversation_id, metadata, created_at, updated_at',
    )
    .not('source_message_id', 'is', null);

  query = type === 'metadata'
    ? query.in('kind', ['sft', 'dpo']).in('status', EXPORTABLE_AUDIT_STATUSES)
    : query.eq('kind', type).in('status', EXPORTABLE_AUDIT_STATUSES);

  if (filters.startDate) query = query.gte('created_at', filters.startDate);
  if (filters.endDate) query = query.lte('created_at', filters.endDate);
  if (filters.classId) query = query.eq('class_id', filters.classId);
  if (filters.quality) query = query.eq('quality', filters.quality);
  if (filters.auditorIds && filters.auditorIds.length > 0) query = query.in('auditor_id', filters.auditorIds);
  if (conversationIdFilter) query = query.in('source_conversation_id', conversationIdFilter);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return { records: [], totalCount: 0, error: error.message };

  const scope = filters.scope ?? DEFAULT_EXPORT_SCOPE;
  const latestRecords = keepLatestApprovedExports((data ?? []) as AuditRecordRow[], scope);
  const slicedRecords = limit === undefined ? latestRecords : latestRecords.slice(0, limit);
  const conversationIds = [...new Set(slicedRecords.map((record) => record.source_conversation_id).filter((value): value is string => Boolean(value)))];

  if (conversationIds.length === 0) {
    return {
      records: slicedRecords.map((record) => ({ record, conversation: null, transcript: [] })),
      totalCount: latestRecords.length,
    };
  }

  const [{ data: conversations, error: conversationsError }, { data: transcriptRows, error: transcriptError }] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, owner_id, project_id, title, text_projects(title)')
      .in('id', conversationIds),
    supabase
      .from('conversation_messages')
      .select('id, conversation_id, role, content, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true }),
  ]);

  if (conversationsError) {
    return { records: [], totalCount: 0, error: `查询会话上下文失败：${conversationsError.message}` };
  }

  if (transcriptError) {
    return { records: [], totalCount: 0, error: `查询会话消息失败：${transcriptError.message}` };
  }

  const conversationsById = new Map(((conversations ?? []) as ConversationRow[]).map((conversation) => [conversation.id, conversation]));
  const transcriptByConversationId = new Map<string, TranscriptMessageRow[]>();
  for (const row of (transcriptRows ?? []) as TranscriptMessageRow[]) {
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
): Promise<ExportResult> {
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
      return {
        success: false,
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

    const sampleRecords: Array<SftRecord | DpoRecord | MetadataRecord> = [];

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
