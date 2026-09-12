/**
 * dataset-export-record.ts
 *
 * 数据集导出的纯函数层：SFT/DPO/metadata 记录的筛选取latest、上下文拼装与格式转换。
 * 不依赖数据库与 'server-only'，可直接单元测试（原实现内嵌在 dataset-export.ts，
 * 且 route.ts 复制了一份 keepLatest 逻辑，两处已合并到这里）。
 */

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

export const EXPORTABLE_AUDIT_STATUSES = ['approved', 'exported'] as const;
export const DEFAULT_EXPORT_SCOPE: DatasetExportScope = 'unexported';

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

/** audit_records 行的最小结构：dataset-export.ts 的全量行与 route.ts 的预览行都满足。 */
export type ExportableAuditRow = {
  id: string;
  source_message_id: string | null;
  status: string;
  prompt: string;
  original_answer: string | null;
  corrected_answer: string | null;
  chosen_answer: string | null;
  rejected_answer: string | null;
  class_id: string | null;
  auditor_id: string | null;
  source_conversation_id: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  kind?: string;
};

export type ConversationLike = {
  id: string;
  owner_id: string;
  project_id: string | null;
  title: string | null;
  text_projects?: { title: string | null } | Array<{ title: string | null }> | null;
};

export type TranscriptMessageLike = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
};

export type DatasetContext = {
  record: ExportableAuditRow;
  conversation: ConversationLike | null;
  transcript: TranscriptMessageLike[];
};

export function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function getRecordTimestamp(record: Pick<ExportableAuditRow, 'updated_at' | 'created_at'>) {
  return record.updated_at || record.created_at;
}

export function asMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function isFinalizedExportRecord(record: Pick<ExportableAuditRow, 'metadata'>) {
  return asMetadataObject(record.metadata).conversation_action === 'conversation_finalized';
}

export function keepLatestBySourceMessage<T extends Pick<ExportableAuditRow, 'source_message_id' | 'created_at' | 'updated_at'>>(records: T[]): T[] {
  const latest = new Map<string, T>();

  for (const record of records) {
    if (!record.source_message_id) continue;
    const previous = latest.get(record.source_message_id);
    if (!previous || getRecordTimestamp(record) >= getRecordTimestamp(previous)) {
      latest.set(record.source_message_id, record);
    }
  }

  return [...latest.values()].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export function keepLatestApprovedExports<T extends Pick<ExportableAuditRow, 'source_message_id' | 'created_at' | 'updated_at' | 'status' | 'metadata'>>(
  records: T[],
  scope: DatasetExportScope = DEFAULT_EXPORT_SCOPE,
): T[] {
  const latestRecords = keepLatestBySourceMessage(
    records.filter((record) => (EXPORTABLE_AUDIT_STATUSES as readonly string[]).includes(record.status) && isFinalizedExportRecord(record)),
  );
  return scope === 'all'
    ? latestRecords
    : latestRecords.filter((record) => record.status === 'approved');
}

export function anonymizeStudentId(ownerId: string | null | undefined) {
  return ownerId ? `student_${ownerId.slice(0, 8)}` : null;
}

function toDatasetMessage(message: TranscriptMessageLike): SftMessage | null {
  if (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') return null;
  const content = message.content.trim();
  if (!content) return null;
  return { role: message.role, content };
}

export function buildPromptMessages(context: DatasetContext): SftMessage[] {
  const sourceIndex = context.record.source_message_id
    ? context.transcript.findIndex((message) => message.id === context.record.source_message_id)
    : -1;
  const promptTranscript = sourceIndex >= 0 ? context.transcript.slice(0, sourceIndex) : [];
  const promptMessages = promptTranscript.map(toDatasetMessage).filter((message): message is SftMessage => Boolean(message));
  if (promptMessages.length > 0) return promptMessages;

  const fallbackPrompt = context.record.prompt.trim();
  return fallbackPrompt ? [{ role: 'user', content: fallbackPrompt }] : [];
}

export function getPromptText(messages: SftMessage[], fallback: string) {
  return [...messages].reverse().find((message) => message.role === 'user')?.content ?? fallback.trim();
}

export function getSampleId(record: Pick<ExportableAuditRow, 'source_message_id' | 'id'>) {
  return record.source_message_id ?? record.id;
}

export function includesDpo(record: Pick<ExportableAuditRow, 'kind' | 'chosen_answer' | 'rejected_answer'>) {
  return record.kind === 'dpo' || Boolean(record.chosen_answer?.trim() && record.rejected_answer?.trim());
}

export function buildMetadata(context: DatasetContext): ExportSampleMetadata {
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

export function toSftRecord(context: DatasetContext): SftRecord | null {
  const assistantContent = (context.record.corrected_answer ?? context.record.original_answer)?.trim();
  if (!assistantContent) return null;

  return {
    messages: [...buildPromptMessages(context), { role: 'assistant', content: assistantContent }],
    metadata: buildMetadata(context),
  };
}

export function toDpoRecord(context: DatasetContext): DpoRecord | null {
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

export function toMetadataRecord(context: DatasetContext): MetadataRecord {
  return buildMetadata(context);
}
