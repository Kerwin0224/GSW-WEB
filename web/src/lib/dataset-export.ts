import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * 数据集导出模块（M7）
 *
 * 职责：从 audit_records 表导出 SFT/DPO 训练数据集
 * - SFT 格式：{"messages": [{"role": "system"}, {"role": "user"}, {"role": "assistant"}]}
 * - DPO 格式：{"prompt": ..., "chosen": ..., "rejected": ...}
 *
 * 调用者责任：必须验证调用者是 admin 角色
 */

export type DatasetType = 'sft' | 'dpo';

export type DatasetFilters = {
  startDate?: string;
  endDate?: string;
  projectIds?: string[];
  auditorIds?: string[];
  classId?: string | null;
  quality?: string | null;
};

export type SftMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type SftRecord = {
  source_record_id: string;
  messages: SftMessage[];
};

export type DpoRecord = {
  source_record_id: string;
  prompt: string;
  chosen: string;
  rejected: string;
};

export type DatasetError = {
  error: string;
  resolution?: string;
};

export type ExportResult =
  | {
      success: true;
      recordCount: number;
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
      sampleRecords: Array<SftRecord | DpoRecord>;
    }
  | DatasetError;

const SFT_SYSTEM_PROMPT_FALLBACK =
  '你是文韵智途的古诗文 AI 教学助手。基于古诗文学习语境回答，用苏格拉底式追问帮助学生沿布鲁姆认知层级深入。';

/**
 * 从 prompt_presets 表读取已发布的 SFT system prompt。
 * 如果没有可用的预设，回退到内置常量。
 *
 * 优先级：published 状态 > target_role 'student' > 最新版本
 */
async function resolveSftSystemPrompt(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  const { data, error } = await supabase
    .from('prompt_presets')
    .select('system_instruction')
    .eq('status', 'published')
    .eq('target_role', 'student')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.system_instruction) {
    return SFT_SYSTEM_PROMPT_FALLBACK;
  }

  return data.system_instruction;
}

type AuditRecordRow = {
  id: string;
  kind: 'sft' | 'dpo';
  status: string;
  prompt: string;
  original_answer: string | null;
  corrected_answer: string | null;
  chosen_answer: string | null;
  rejected_answer: string | null;
  quality: string | null;
  class_id: string | null;
  auditor_id: string | null;
  source_conversation_id: string | null;
  created_at: string;
};

/**
 * 将 audit_record 转换为 SFT 格式
 */
function toSftRecord(record: AuditRecordRow, systemPrompt: string): SftRecord | null {
  // SFT 优先使用修正答案，如果没有则使用原始答案
  const assistantContent = record.corrected_answer ?? record.original_answer;
  if (!assistantContent) return null;

  return {
    source_record_id: record.id,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: record.prompt },
      { role: 'assistant', content: assistantContent },
    ],
  };
}

/**
 * 将 audit_record 转换为 DPO 格式
 */
function toDpoRecord(record: AuditRecordRow): DpoRecord | null {
  // DPO 需要 chosen 和 rejected 两个答案
  const chosen = record.chosen_answer ?? record.corrected_answer;
  const rejected = record.rejected_answer ?? record.original_answer;

  if (!chosen || !rejected) return null;

  return {
    source_record_id: record.id,
    prompt: record.prompt,
    chosen,
    rejected,
  };
}

/**
 * 应用筛选条件并查询 audit_records
 *
 * 关于 projectIds 筛选：audit_records 通过 source_conversation_id 关联 conversations，
 * conversations.project_id 关联 text_projects。先在 conversations 表查询出符合 projectIds
 * 的 conversation 列表，再用 in() 筛选 audit_records.source_conversation_id。
 */
async function fetchAuditRecords(
  type: DatasetType,
  filters: DatasetFilters,
  limit?: number
): Promise<{ records: AuditRecordRow[]; totalCount: number; error?: string }> {
  const supabase = await createClient();

  // 如果指定了 projectIds，先查询匹配的 conversation_ids
  let conversationIdFilter: string[] | undefined;
  if (filters.projectIds && filters.projectIds.length > 0) {
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .in('project_id', filters.projectIds);

    if (convError) {
      return { records: [], totalCount: 0, error: `查询关联对话失败：${convError.message}` };
    }

    conversationIdFilter = (conversations ?? []).map((c) => c.id);

    if (conversationIdFilter.length === 0) {
      return { records: [], totalCount: 0 };
    }
  }

  let query = supabase
    .from('audit_records')
    .select(
      'id, kind, status, prompt, original_answer, corrected_answer, chosen_answer, rejected_answer, quality, class_id, auditor_id, source_conversation_id, created_at',
      { count: 'exact' }
    )
    .eq('kind', type)
    .eq('status', 'approved');

  if (filters.startDate) {
    query = query.gte('created_at', filters.startDate);
  }

  if (filters.endDate) {
    query = query.lte('created_at', filters.endDate);
  }

  if (filters.classId) {
    query = query.eq('class_id', filters.classId);
  }

  if (filters.quality) {
    query = query.eq('quality', filters.quality);
  }

  if (filters.auditorIds && filters.auditorIds.length > 0) {
    query = query.in('auditor_id', filters.auditorIds);
  }

  if (conversationIdFilter) {
    query = query.in('source_conversation_id', conversationIdFilter);
  }

  query = query.order('created_at', { ascending: false });

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error, count } = await query;

  if (error) {
    return { records: [], totalCount: 0, error: error.message };
  }

  return {
    records: (data ?? []) as AuditRecordRow[],
    totalCount: count ?? 0,
  };
}

/**
 * 导出完整数据集（生成 JSONL）
 */
export async function exportDataset(
  type: DatasetType,
  filters: DatasetFilters = {}
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
        resolution: '请放宽筛选条件，或确认存在已批准（approved）状态的审计标注。',
      };
    }

    // SFT 模式需要从 prompt_presets 读取真实的 system prompt
    const supabase = await createClient();
    const systemPrompt = type === 'sft' ? await resolveSftSystemPrompt(supabase) : '';

    const lines: string[] = [];
    let validCount = 0;

    for (const record of records) {
      const converted = type === 'sft' ? toSftRecord(record, systemPrompt) : toDpoRecord(record);
      if (converted) {
        lines.push(JSON.stringify(converted));
        validCount++;
      }
    }

    if (validCount === 0) {
      return {
        success: false,
        error: `没有有效的 ${type.toUpperCase()} 记录可导出`,
        resolution:
          type === 'dpo'
            ? 'DPO 格式需要同时包含 chosen 和 rejected 答案；请确认审计记录包含完整的偏好对。'
            : 'SFT 格式需要包含 corrected_answer 或 original_answer；请确认审计记录包含答案内容。',
      };
    }

    return {
      success: true,
      recordCount: validCount,
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

/**
 * 预览数据集（返回前 N 条样本 + 总数）
 */
export async function previewDataset(
  type: DatasetType,
  filters: DatasetFilters = {},
  limit: number = 10
): Promise<PreviewResult> {
  try {
    const { records, totalCount, error } = await fetchAuditRecords(type, filters, limit);

    if (error) {
      return {
        error: `查询审计记录失败：${error}`,
        resolution: '请检查筛选条件是否合法，或确认数据库连接正常。',
      };
    }

    // SFT 模式需要从 prompt_presets 读取真实的 system prompt
    const supabase = await createClient();
    const systemPrompt = type === 'sft' ? await resolveSftSystemPrompt(supabase) : '';

    const sampleRecords: Array<SftRecord | DpoRecord> = [];
    for (const record of records) {
      const converted = type === 'sft' ? toSftRecord(record, systemPrompt) : toDpoRecord(record);
      if (converted) {
        sampleRecords.push(converted);
      }
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
