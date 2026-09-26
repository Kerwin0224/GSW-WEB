'use server';

import { Output, streamText, type LanguageModel } from 'ai';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  normalizePreReviewIssuesForMessage,
  normalizePreReviewResults,
  toPreReviewMetadataResult,
  type NormalizedPreReviewResult,
} from '@/lib/teacher-pre-review';
import { hasTeacherDecision, latestTeacherDecision } from '@/lib/audit-queue';
import {
  buildIssueLabelSchema,
  loadReviewDimensions,
  matchDimensionKey,
  renderDimensionsPromptFragment,
  type PreReviewDimension,
} from '@/lib/pre-review-dimensions';
import { getCapability, jsonForDatabase, requireRole, resolveLanguageModel } from './common';
import { broadcastStudentConversationUpdate } from './student-conversation-broadcast';
import {
  asMetadataObject,
  firstJoined,
  isApprovedAudit,
  latestMaterializedReview,
  latestRevisionDraft,
  metadataText,
  resolveReviewState,
  reviewTimestamp,
  type AuditRowBase,
  type ReviewState,
} from './audit-record';

export type AuditSubmissionState = { ok: boolean; message: string; errors?: Record<string, string> };

type SourceMessage = {
  id: string;
  conversation_id: string;
  content: string;
  created_at: string;
  parts: unknown;
  conversations?: {
    class_id: string | null;
    project_id: string | null;
    source: string;
    deleted_at: string | null;
  } | Array<{
    class_id: string | null;
    project_id: string | null;
    source: string;
    deleted_at: string | null;
  }>;
};

type AuditRow = AuditRowBase & {
  id: string;
  source_message_id?: string | null;
  source_conversation_id?: string | null;
  kind: 'sft' | 'dpo' | 'metadata';
  status: string;
  original_answer: string | null;
  corrected_answer: string | null;
  chosen_answer: string | null;
  rejected_answer: string | null;
  rationale: string | null;
  dimension_key: string | null;
  teacher_comment: string | null;
  created_at: string;
  updated_at: string;
};

type SourceContext = {
  source: SourceMessage;
  classId: string;
  prompt: string;
  originalAnswer: string;
  currentAnswer: string;
  reviewState: ReviewState;
  /**
   * 会话是否已核实提交。核实完成不等于封口：学生仍可继续追问，
   * 但已物化的 SFT/DPO 样本不能再改——训练数据与学生看到的回答必须一致，
   * 改了就得同步改已批准的样本，那是另一件事（申诉结论），不是修订。
   */
  materialized: boolean;
};

type ConversationContext = {
  conversation: { id: string; class_id: string | null; project_id: string | null; source: string; title: string | null; finalized_at: string | null; locked_at: string | null };
  classId: string;
  transcript: Array<{ id: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; created_at: string }>;
  auditRows: AuditRow[];
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * 查教师是否任教该班。RLS 也会拦，提前查一次是为了把「静默失败」变成可读错误。
 * 失败文案由调用方给——两处调用点想说的话不一样，收敛成一句反而丢了上下文。
 */
async function checkTeacherClassMembership(
  supabase: SupabaseClient,
  classId: string,
  teacherId: string,
  failureMessage: string,
): Promise<{ ok: true; isMember: boolean } | { ok: false; message: string }> {
  const { data: membership, error } = await supabase
    .from('class_memberships')
    .select('id')
    .eq('class_id', classId)
    .eq('profile_id', teacherId)
    .eq('role', 'teacher')
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, message: `${failureMessage}：${error.message}` };
  return { ok: true, isMember: Boolean(membership) };
}

/**
 * 教师对单条 AI 回答的「确认无误」记录。
 *
 * 它是**物化训练样本的前置凭据**，不是终态：整条会话仍需会话级最终提交。
 * 此前没有这个动作，于是会话级提交只能靠「有没有修订」反推教师看过哪条——
 * 10 轮对话里改过第 3 轮，其余 9 条从未被读过的回答就全被写成 accurate。
 */
function isMessageConfirmed(row: AuditRow) {
  return row.kind === 'metadata' && isApprovedAudit(row) && metadataText(row, 'teacher_action') === 'message_confirmed';
}


function isFinalizedMaterializedReview(row: AuditRow) {
  return (row.kind === 'sft' || row.kind === 'dpo')
    && isApprovedAudit(row)
    && asMetadataObject(row.metadata).conversation_action === 'conversation_finalized';
}

function revisionFromDraft(row: AuditRow | undefined) {
  if (!row) return null;
  // metadataText 在 audit-record.ts 返回空字符串，这里 || null 保持语义一致
  const correctedAnswer = row.corrected_answer?.trim() || metadataText(row, 'corrected_answer') || null;
  const originalAnswer = row.original_answer?.trim() || metadataText(row, 'original_answer') || null;
  if (!correctedAnswer || !originalAnswer) return null;
  return {
    originalAnswer,
    correctedAnswer,
    rationale: row.rationale?.trim() || metadataText(row, 'rationale') || '教师修订回答。',
  };
}

function revisionFromMaterialized(row: AuditRow | undefined) {
  if (!row) return null;
  const correctedAnswer = row.chosen_answer?.trim() || row.corrected_answer?.trim();
  const originalAnswer = row.rejected_answer?.trim() || row.original_answer?.trim();
  if (!correctedAnswer || !originalAnswer || correctedAnswer === originalAnswer) return null;
  return {
    originalAnswer,
    correctedAnswer,
    rationale: row.rationale?.trim() || '教师修订回答。',
  };
}

function teacherRevisionParts(correctedAnswer: string, reviewedAt: string) {
  return jsonForDatabase([
    { type: 'text', text: correctedAnswer },
    { type: 'data-teacher-revision', data: { revised: true, reviewedAt } },
  ]);
}

function resolveOriginalAnswer(sourceContent: string, sourceAudits: AuditRow[]) {
  const draftRevision = revisionFromDraft(latestRevisionDraft(sourceAudits));
  if (draftRevision?.originalAnswer) return draftRevision.originalAnswer;

  const materializedOriginal = [...sourceAudits]
    .filter((row) => (row.kind === 'sft' || row.kind === 'dpo') && isApprovedAudit(row))
    .sort((left, right) => reviewTimestamp(left).localeCompare(reviewTimestamp(right)))
    .map((row) => row.rejected_answer?.trim() || row.original_answer?.trim())
    .find((value): value is string => Boolean(value));

  return materializedOriginal ?? sourceContent.trim();
}


function nearestPrompt(transcript: ConversationContext['transcript'], sourceMessageId: string) {
  const sourceIndex = transcript.findIndex((row) => row.id === sourceMessageId);
  if (sourceIndex <= 0) return '';
  return [...transcript.slice(0, sourceIndex)].reverse().find((row) => row.role === 'user')?.content?.trim() ?? '';
}

async function getConversationContext(conversationId: string, teacherId: string): Promise<{ ok: true; data: ConversationContext } | { ok: false; message: string }> {
  const supabase = await createClient();
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id,class_id,project_id,source,title,finalized_at,locked_at')
    .eq('id', conversationId)
    .eq('source', 'student_chat')
    .is('deleted_at', null)
    .maybeSingle();

  if (conversationError) {
    return { ok: false, message: `会话加载失败：${conversationError.message}` };
  }

  if (!conversation?.class_id || !conversation.project_id) {
    return { ok: false, message: '只有学生项目会话可以进入会话级学习记录核实。' };
  }

  const membership = await checkTeacherClassMembership(supabase, conversation.class_id, teacherId, '教师班级权限校验失败');
  if (!membership.ok) return membership;
  if (!membership.isMember) {
    return { ok: false, message: '你无权核实这个学生会话。' };
  }

  const [{ data: transcriptRows, error: transcriptError }, { data: auditRows, error: auditError }] = await Promise.all([
    supabase
      .from('conversation_messages')
      .select('id,role,content,created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('audit_records')
      .select('id,source_message_id,source_conversation_id,kind,status,original_answer,corrected_answer,chosen_answer,rejected_answer,rationale,metadata,dimension_key,teacher_comment,created_at,updated_at')
      .eq('source_conversation_id', conversation.id)
      .order('created_at', { ascending: true }),
  ]);

  if (transcriptError) {
    return { ok: false, message: `会话记录加载失败：${transcriptError.message}` };
  }

  if (auditError) {
    return { ok: false, message: `核实历史加载失败：${auditError.message}` };
  }

  return {
    ok: true,
    data: {
      conversation,
      classId: conversation.class_id,
      transcript: (transcriptRows ?? []) as ConversationContext['transcript'],
      auditRows: (auditRows ?? []) as AuditRow[],
    },
  };
}

/**
 * 单条 AI 回答的核实上下文。
 *
 * 入口只有「这条回答属于哪个会话」这一件事要自己查；会话归属、transcript、
 * 审计行全部转交 getConversationContext——两边曾经各抄一份，连三处错误分支都逐字相同。
 */
async function getSourceContext(sourceMessageId: string, teacherId: string): Promise<{ ok: true; data: SourceContext } | { ok: false; message: string }> {
  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase
    .from('conversation_messages')
    .select('id,conversation_id,content,created_at,parts,conversations!inner(class_id,project_id,source,deleted_at)')
    .eq('id', sourceMessageId)
    .eq('role', 'assistant')
    .is('conversations.deleted_at', null)
    .single();

  if (sourceError || !source) {
    return { ok: false, message: `源记录不可访问：${sourceError?.message ?? 'not found'}` };
  }

  const conversation = firstJoined(source.conversations);
  if (!conversation?.class_id || conversation.source !== 'student_chat' || !conversation.project_id) {
    return { ok: false, message: '只有学生项目中的 AI 回答可以进入学习记录核实。' };
  }

  const contextResult = await getConversationContext(source.conversation_id, teacherId);
  if (!contextResult.ok) return contextResult;

  const { conversation: conversationRow, classId, transcript, auditRows } = contextResult.data;
  const prompt = nearestPrompt(transcript, source.id);

  if (!prompt) {
    return { ok: false, message: '缺少这条 AI 回答对应的学生问题，不能脱离上下文核实。' };
  }

  const sourceAudits = auditRows.filter((row) => row.source_message_id === source.id);

  return {
    ok: true,
    data: {
      source: source as SourceMessage,
      classId,
      prompt,
      originalAnswer: resolveOriginalAnswer(source.content, sourceAudits),
      currentAnswer: source.content.trim(),
      reviewState: resolveReviewState(sourceAudits.filter(isApprovedAudit)),
      materialized: Boolean(conversationRow.finalized_at),
    },
  };
}

export async function reviseLearningRecord(sourceMessageId: string, _previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  void _previousState;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const correctedAnswer = String(formData.get('corrected_answer') ?? '').trim();
  const rationaleInput = String(formData.get('rationale') ?? '').trim();
  const rationale = rationaleInput || '教师直接修订回答。';
  const errors: Record<string, string> = {};
  if (!correctedAnswer) errors.corrected_answer = '请直接在回答气泡中写入修订版。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐修订信息。', errors };

  const contextResult = await getSourceContext(sourceMessageId, role.data.id);
  if (!contextResult.ok) return { ok: false, message: contextResult.message };

  const { source, classId, prompt, originalAnswer, currentAnswer, materialized } = contextResult.data;
  if (materialized) {
    return { ok: false, message: '这个会话已完成核实提交，训练样本已固定，不能再修订回答。' };
  }

  if (correctedAnswer === currentAnswer) {
    return { ok: false, message: '修订版与当前展示回答一致，请修改后再保存。', errors: { corrected_answer: '修订版与当前展示回答一致，请修改后再保存。' } };
  }

  const now = new Date().toISOString();
  // 维度与评语是教师「为什么这么判」的显式表达。此前核实结论的唯一产物就是改写答案，
  // 教师想说「你这题推理跳步了」只能把答案重写一遍，学生看不到任何评语。
  const dimensionKey = String(formData.get('dimension_key') ?? '').trim() || null;
  const teacherComment = String(formData.get('teacher_comment') ?? '').trim() || null;
  const metadata = {
    teacher_action: 'revision_draft',
    reviewed_at: now,
    original_answer: originalAnswer,
    corrected_answer: correctedAnswer,
    rationale,
    ...(dimensionKey ? { dimension_key: dimensionKey } : {}),
    ...(teacherComment ? { teacher_comment: teacherComment } : {}),
  };
  const supabase = await createClient();
  const originalParts = source.parts === null || source.parts === undefined
    ? jsonForDatabase([{ type: 'text', text: source.content }])
    : jsonForDatabase(source.parts);

  const { data: updatedRows, error: updateError } = await supabase
    .from('conversation_messages')
    .update({
      content: correctedAnswer,
      parts: teacherRevisionParts(correctedAnswer, now),
    })
    .eq('id', source.id)
    .select('id');

  if (updateError) return { ok: false, message: `学生侧修订同步失败：${updateError.message}` };
  if (!updatedRows || updatedRows.length === 0) {
    return {
      ok: false,
      message: '修订没有同步到学生侧，本次未保存。请稍后重试；若持续失败请联系管理员。',
    };
  }

  const { error: insertError } = await supabase.from('audit_records').insert({
    source_message_id: source.id,
    source_conversation_id: source.conversation_id,
    auditor_id: role.data.id,
    class_id: classId,
    kind: 'metadata',
    status: 'approved',
    quality: 'revision_draft',
    prompt,
    original_answer: originalAnswer,
    corrected_answer: correctedAnswer,
    chosen_answer: null,
    rejected_answer: null,
    rationale,
    dimension_key: dimensionKey,
    teacher_comment: teacherComment,
    metadata,
  });

  if (insertError) {
    await supabase
      .from('conversation_messages')
      .update({ content: source.content, parts: originalParts })
      .eq('id', source.id);
    return { ok: false, message: `修订记录保存失败，学生侧回答已回滚：${insertError.message}` };
  }

  await broadcastStudentConversationUpdate(supabase, source.conversation_id, {
    kind: 'teacher_revision',
    revisedAt: now,
  });

  revalidatePath('/teacher');
  revalidatePath('/teacher/audit');
  revalidatePath('/student');
  return { ok: true, message: '修订已保存并同步学生侧；确认提交整个会话后才会进入教学数据导出。' };
}

/**
 * 单条「确认无误」。
 *
 * 这是「训练数据只收教师显式处置过的回答」的那一半凭据：没有它，
 * 会话级提交就只能靠「有没有修订」反推教师看过哪条，于是没读过的回答
 * 被写成 accurate 训练样本且不可挽回。
 *
 * 确认本身不改答案、也不物化样本——它只是把「教师读过并认可这条」记下来，
 * 真正的训练数据仍由会话级最终提交一次性物化（CONTEXT：最终提交是会话级动作）。
 */
export async function confirmLearningMessage(sourceMessageId: string, _previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  void _previousState;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const contextResult = await getSourceContext(sourceMessageId, role.data.id);
  if (!contextResult.ok) return { ok: false, message: contextResult.message };
  const { source, classId, prompt, currentAnswer, materialized } = contextResult.data;
  if (materialized) {
    return { ok: false, message: '这个会话已完成核实提交，训练样本已固定，不能再改变核实结论。' };
  }

  const now = new Date().toISOString();
  const dimensionKey = String(formData.get('dimension_key') ?? '').trim() || null;
  const teacherComment = String(formData.get('teacher_comment') ?? '').trim() || null;
  const supabase = await createClient();
  const { data: written, error } = await supabase
    .from('audit_records')
    .insert({
      source_message_id: source.id,
      source_conversation_id: source.conversation_id,
      auditor_id: role.data.id,
      class_id: classId,
      kind: 'metadata',
      status: 'approved',
      quality: 'confirmed',
      prompt,
      original_answer: currentAnswer,
      corrected_answer: null,
      chosen_answer: null,
      rejected_answer: null,
      rationale: teacherComment ?? '教师确认这条 AI 回答无误。',
      dimension_key: dimensionKey,
      teacher_comment: teacherComment,
      metadata: {
        teacher_action: 'message_confirmed',
        reviewed_at: now,
        ...(dimensionKey ? { dimension_key: dimensionKey } : {}),
        ...(teacherComment ? { teacher_comment: teacherComment } : {}),
      },
    })
    .select('id');

  // 0 行 = RLS 静默过滤掉的写入，error 分支看不出来。不检查就会报「已确认」而库里没有。
  if (error) return { ok: false, message: `确认记录保存失败：${error.message}` };
  if (!written || written.length === 0) {
    return { ok: false, message: '确认没有保存，本次操作未生效。请刷新后重试；若持续失败请联系管理员。' };
  }

  revalidatePath('/teacher');
  revalidatePath('/teacher/audit');
  return { ok: true, message: '已记录教师确认；确认提交整个会话后，这条回答才会进入教学数据。' };
}

// 疑点标签不再由模型自由发挥：有租户维度时用 label_key 的枚举钉死，
// 让同一个错误跨会话、跨学期能聚合；查不到维度时退回 z.string()，
// 读表失败绝不能连带让整次预审失败。
const buildPreReviewSchemas = (dimensions: readonly PreReviewDimension[]) => {
  const issueSchema = z.object({
    quote: z.string(),
    label: buildIssueLabelSchema(dimensions),
    severity: z.enum(['low', 'medium', 'high']),
  });
  return {
    conversation: z.object({
      results: z.array(z.object({
        messageId: z.string(),
        issues: z.array(issueSchema.extend({ messageId: z.string().optional() })),
      })),
    }),
    single: z.object({ issues: z.array(issueSchema) }),
  };
};

/** 无维度时的兜底口径：租户没配、读表失败、或平台默认也读不到时用这一句。 */
const FALLBACK_DIMENSION_PROMPT = `- 优先关注讲错概念或术语、误引材料或依据、事实性错误、解释牵强、把无依据推测说成定论、与学生问题明显不匹配的教学引导。`;

const renderDimensionPromptLine = (dimensions: readonly PreReviewDimension[]) =>
  renderDimensionsPromptFragment(dimensions) || FALLBACK_DIMENSION_PROMPT;

async function runPreReview(
  model: LanguageModel,
  transcript: ConversationContext['transcript'],
  dimensions: readonly PreReviewDimension[],
) {
  const schemas = buildPreReviewSchemas(dimensions);
  /** 模型给的 label 是自由文本，按维度表归一到稳定键；认不出来就留 null。 */
  const withDimensionKeys = (results: NormalizedPreReviewResult[]) =>
    results.map((result) => ({
      ...result,
      issues: result.issues.map((issue) => ({
        ...issue,
        dimensionKey: matchDimensionKey(issue.label, dimensions),
      })),
    }));
  const assistantMessages = transcript.filter((row) => row.role === 'assistant');
  const transcriptText = transcript
    .map((row, index) => {
      const roleLabel = row.role === 'assistant' ? 'AI回答' : row.role === 'user' ? '学生提问' : row.role;
      return `${index + 1}. [${roleLabel}][messageId=${row.id}]\n${row.content}`;
    })
    .join('\n\n');
  const assistantChecklist = assistantMessages
    .map((message, index) => `${index + 1}. messageId=${message.id}`)
    .join('\n');

  // 网关对非流式 JSON 请求会抛 Invalid JSON response（2026-09-11 归类事故根因），
  // 所以结构化预审也走 streamText（出站 body 带 stream: true），
  // 结构化输出与流式与否正交，Output.object 仍给出校验过的对象。
  const result = streamText({
    model,
    output: Output.object({ schema: schemas.conversation }),
    prompt: `你是文韵智途的 AI 预审助手。请在教师进行学习记录核实前，预审完整学生会话中的所有 AI 回答。

要求：
- 预审对象是整个会话里的所有学生提问与 AI 回答；判断某条 AI 回答时，可以参考它前后的学生提问和上下文。
- 必须返回 results 数组，并且每条 AI 回答都必须有且仅有一项结果；不要只返回有问题的回答。
- results.messageId 必须逐字使用下面清单中的 messageId；没有明显教学正确性疑点的回答也要返回 issues: []。
- 只定位可能误导学生学习的教学正确性风险，供教师核实；不要替教师做最终判错、评分、批改或数据打标。
- quote 必须逐字复制对应 AI 回答中的连续原文片段，不得改写、概括、翻译或拼接不连续文本；如果无法在该回答原文中找到连续片段，就不要返回该 issue。
${renderDimensionPromptLine(dimensions)}
- 不要因为回答简短、风格普通、没有扩展讲解、没有使用固定教学步骤或没有给出标准答案就标红。
- severity 使用要克制：high 只给会直接误导学生理解学习内容或事实的风险；medium 给需要教师重点核实的可疑解释；low 给轻微但值得定位的表述。
- 每条 AI 回答最多返回 4 个最需要教师定位的 issue；不要再做会话级全局截断。
- 标红片段只是定位疑点，教师最终处理粒度仍是整条 AI 回答气泡和会话级最终提交。

必须覆盖的 AI 回答：
${assistantChecklist}

完整会话：
${transcriptText}`,
  });

  let reviews = normalizePreReviewResults(assistantMessages, (await result.output).results);
  const fallbackTargets = reviews.filter((review) => review.status === 'missing_result' || review.ignoredIssueCount > 0);

  if (fallbackTargets.length > 0) {
    const fallbackReviews = await Promise.all(fallbackTargets.map(async (review) => {
      const message = assistantMessages.find((assistantMessage) => assistantMessage.id === review.messageId);
      if (!message) return review;
      try {
        const fallbackResult = streamText({
          model,
          output: Output.object({ schema: schemas.single }),
          prompt: `你是文韵智途的 AI 预审助手。全会话预审中，这条 AI 回答的结果缺失或 quote 无法匹配原文。请只重审这一条 AI 回答。

要求：
- 只检查 messageId=${message.id} 这条 AI 回答，其他内容只作为上下文。
- quote 必须逐字复制这条 AI 回答中的连续原文片段，不得改写、概括、翻译或拼接不连续文本；如果无法在该回答原文中找到连续片段，就不要返回该 issue。
- 只关注可能误导学生学习的教学正确性风险，供教师核实；不要替教师做最终判错、评分、批改或数据打标。
${renderDimensionPromptLine(dimensions)}
- 不要因为回答简短、风格普通、没有扩展讲解、没有使用固定教学步骤或没有给出标准答案就标红。
- 没有明显教学正确性疑点时返回空 issues。
- 最多返回 4 个最需要教师定位的 issue。

完整会话：
${transcriptText}`,
        });
        return {
          messageId: message.id,
          status: 'checked',
          source: 'single_message',
          ...normalizePreReviewIssuesForMessage(message, (await fallbackResult.output).issues),
        } satisfies NormalizedPreReviewResult;
      } catch (error) {
        return {
          ...review,
          error: error instanceof Error ? error.message : 'Provider 返回未知错误。',
        } satisfies NormalizedPreReviewResult;
      }
    }));
    const fallbackByMessage = new Map(fallbackReviews.map((review) => [review.messageId, review]));
    reviews = reviews.map((review) => fallbackByMessage.get(review.messageId) ?? review);
  }

  // 归一维度键后再做统计与落库：issue 的 label 仍是可读文本，dimensionKey 才是聚合键。
  const dimensioned = withDimensionKeys(reviews);
  const checkedReviews = dimensioned.filter((review) => review.status === 'checked');

  return {
    reviewedMessageIds: checkedReviews.map((review) => review.messageId),
    missingMessageIds: dimensioned.filter((review) => review.status !== 'checked').map((review) => review.messageId),
    messageResults: dimensioned.map(toPreReviewMetadataResult),
    issues: checkedReviews.flatMap((review) => review.issues),
  };
}

export async function runConversationPreReview(conversationId: string, _previousState: AuditSubmissionState, _formData: FormData): Promise<AuditSubmissionState> {
  void _previousState;
  void _formData;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const contextResult = await getConversationContext(conversationId, role.data.id);
  if (!contextResult.ok) return { ok: false, message: contextResult.message };
  // 已封口的会话不再接受新的核实动作：教师明确收口，学生也问不下去了，
  // 此时写入预审记录只会产生永远不会被核实的孤立数据。
  if (contextResult.data.conversation.locked_at) {
    return { ok: true, message: '这个会话已被封口，无需重复发起 AI 预审。' };
  }

  const assistantMessages = contextResult.data.transcript.filter((row) => row.role === 'assistant');
  if (assistantMessages.length === 0) return { ok: false, message: '这个会话还没有 AI 回答，不能发起 AI 预审。' };

  const capability = await getCapability('audit_assist');
  if (!capability.ok) return { ok: false, message: capability.message };
  if (!capability.data.ready) return { ok: false, message: capability.data.blockedReason ?? 'AI 预审能力未就绪。' };
  const model = resolveLanguageModel(capability.data);
  if (!model) return { ok: false, message: 'AI 预审暂时无法发起，请稍后重试；若持续失败请联系管理员。' };

  // 评价维度来自租户配置。读不到就整体降级为「无维度 + 自由 label」，
  // 而不是让预审失败——审查口径配错不该阻断教师核实。
  const supabaseForDimensions = await createClient();
  const { data: profileForDimensions } = await supabaseForDimensions
    .from('profiles')
    .select('school_id')
    .eq('id', role.data.id)
    .maybeSingle();
  const { dimensions } = await loadReviewDimensions(supabaseForDimensions, profileForDimensions?.school_id ?? null);

  let preReview: Awaited<ReturnType<typeof runPreReview>>;
  try {
    preReview = await runPreReview(model, contextResult.data.transcript, dimensions);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? `AI 预审失败：${error.message}` : 'AI 预审失败：Provider 返回未知错误。' };
  }

  const latestAssistant = assistantMessages[assistantMessages.length - 1];
  const supabase = await createClient();
  const { error } = await supabase.from('audit_records').insert({
    source_message_id: latestAssistant.id,
    source_conversation_id: contextResult.data.conversation.id,
    auditor_id: role.data.id,
    class_id: contextResult.data.classId,
    kind: 'metadata',
    status: 'approved',
    quality: 'pre_review',
    prompt: 'AI 预审：完整学生会话',
    original_answer: null,
    corrected_answer: null,
    rationale: preReview.issues.length ? 'AI 预审返回疑点，等待教师核实。' : 'AI 预审未发现明显教学正确性疑点。',
    metadata: {
      teacher_action: 'conversation_pre_review',
      reviewed_at: new Date().toISOString(),
      review_status: preReview.missingMessageIds.length === 0 ? 'ready' : 'partial',
      reviewed_message_ids: preReview.reviewedMessageIds,
      audited_assistant_count: preReview.reviewedMessageIds.length,
      assistant_message_count: assistantMessages.length,
      missing_message_ids: preReview.missingMessageIds,
      message_results: preReview.messageResults,
      issues: preReview.issues,
      model_id: capability.data.modelId,
    },
  });

  if (error) return { ok: false, message: `AI 预审结果保存失败：${error.message}` };
  revalidatePath('/teacher');
  revalidatePath('/teacher/audit');
  if (preReview.missingMessageIds.length > 0) {
    return { ok: true, message: `AI 预审已保存，但当前只覆盖 ${preReview.reviewedMessageIds.length}/${assistantMessages.length} 条 AI 回答；请再次点击补审以补齐缺失结果。` };
  }
  return { ok: true, message: preReview.issues.length ? `AI 预审完成，已覆盖 ${preReview.reviewedMessageIds.length} 条 AI 回答，发现 ${preReview.issues.length} 处需教师定位核实的疑点。` : `AI 预审完成，已覆盖 ${preReview.reviewedMessageIds.length} 条 AI 回答，未发现明显教学正确性疑点。` };
}

/**
 * 会话级「确认提交整个会话」。
 *
 * 两件事在这一步分开落地，此前它们被焊在一起：
 *   · 训练数据物化 —— 只物化**教师显式处置过**的回答（有确认或修订记录）。
 *     此前是「有修订走 needs_correction，无修订一律 accurate」，
 *     于是 10 轮长对话里改过第 3 轮，其余 9 条从未被读过的回答全被写成
 *     accurate 训练样本，并在提交后不可修订——错误被永久固化。
 *   · 封口 —— 教师**可选**写 conversations.locked_at。默认不锁：
 *     已核实但未锁的会话学生可以继续追问（异步答疑、复核后追问、错题再讨论）。
 */
export async function finalizeLearningConversation(conversationId: string, _previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  void _previousState;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const contextResult = await getConversationContext(conversationId, role.data.id);
  if (!contextResult.ok) return { ok: false, message: contextResult.message };
  const { conversation, classId, transcript, auditRows } = contextResult.data;
  // 已提交判定读列（状态真源），不再扫 audit_records 的 JSON。
  if (conversation.finalized_at) {
    return { ok: true, message: '这个会话已经完成核实提交，无需重复提交。' };
  }

  const assistantMessages = transcript.filter((row) => row.role === 'assistant');
  if (assistantMessages.length === 0) return { ok: false, message: '这个会话还没有 AI 回答，不能提交会话级核实。' };

  const auditsByMessage = new Map<string, AuditRow[]>();
  for (const audit of auditRows) {
    if (!audit.source_message_id) continue;
    const rows = auditsByMessage.get(audit.source_message_id) ?? [];
    rows.push(audit);
    auditsByMessage.set(audit.source_message_id, rows);
  }

  const now = new Date().toISOString();
  const materializedRows = [];
  const studentRevisionUpdates: Array<{ messageId: string; correctedAnswer: string }> = [];
  const skippedMessageIds: string[] = [];
  let revisedCount = 0;
  let confirmedCount = 0;

  for (const message of assistantMessages) {
    const messageAudits = auditsByMessage.get(message.id) ?? [];
    // 没有教师显式处置记录的回答一律跳过物化。这是本次改动的全部要点：
    // 「没改过」不等于「看过且认可」，把它写成 accurate 训练样本是在替教师下结论。
    if (!hasTeacherDecision(messageAudits)) {
      skippedMessageIds.push(message.id);
      continue;
    }
    const prompt = nearestPrompt(transcript, message.id) || '源问题未返回；教师在完整会话中完成会话级核实。';
    const existingFinalizedKinds = new Set(messageAudits.filter(isFinalizedMaterializedReview).map((row) => row.kind));
    const revision = revisionFromDraft(latestRevisionDraft(messageAudits)) ?? revisionFromMaterialized(latestMaterializedReview(messageAudits));
    const isMeaningfulRevision = Boolean(revision && revision.correctedAnswer.trim() !== revision.originalAnswer.trim());
    // 维度与评语取教师处置时写下的那一版（确认记录或修订草稿，取较新的），
    // 让「按哪个维度判的、为什么」跟着训练样本一起走。
    const decision = latestTeacherDecision(messageAudits);
    const dimensionKey = decision?.dimension_key ?? null;
    const teacherComment = decision?.teacher_comment ?? null;

    if (isMeaningfulRevision && revision) {
      revisedCount += 1;
      studentRevisionUpdates.push({ messageId: message.id, correctedAnswer: revision.correctedAnswer });
      const commonMetadata = {
        teacher_action: 'revised',
        reviewed_at: now,
        conversation_action: 'conversation_finalized',
        ...(dimensionKey ? { dimension_key: dimensionKey } : {}),
        ...(teacherComment ? { teacher_comment: teacherComment } : {}),
      };
      if (!existingFinalizedKinds.has('sft')) {
        materializedRows.push({
          source_message_id: message.id,
          source_conversation_id: conversation.id,
          auditor_id: role.data.id,
          class_id: classId,
          kind: 'sft' as const,
          status: 'approved' as const,
          quality: 'needs_correction',
          prompt,
          original_answer: revision.originalAnswer,
          corrected_answer: revision.correctedAnswer,
          chosen_answer: null,
          rejected_answer: null,
          rationale: revision.rationale,
          dimension_key: dimensionKey,
          teacher_comment: teacherComment,
          metadata: commonMetadata,
        });
      }
      if (!existingFinalizedKinds.has('dpo')) {
        materializedRows.push({
          source_message_id: message.id,
          source_conversation_id: conversation.id,
          auditor_id: role.data.id,
          class_id: classId,
          kind: 'dpo' as const,
          status: 'approved' as const,
          quality: 'needs_correction',
          prompt,
          original_answer: revision.originalAnswer,
          corrected_answer: null,
          chosen_answer: revision.correctedAnswer,
          rejected_answer: revision.originalAnswer,
          rationale: revision.rationale,
          dimension_key: dimensionKey,
          teacher_comment: teacherComment,
          metadata: commonMetadata,
        });
      }
      continue;
    }

    confirmedCount += 1;
    if (!existingFinalizedKinds.has('sft')) {
      materializedRows.push({
        source_message_id: message.id,
        source_conversation_id: conversation.id,
        auditor_id: role.data.id,
        class_id: classId,
        kind: 'sft' as const,
        status: 'approved' as const,
        quality: 'accurate',
        prompt,
        original_answer: message.content,
        corrected_answer: null,
        chosen_answer: null,
        rejected_answer: null,
        rationale: teacherComment ?? '教师确认这条 AI 回答无误。',
        dimension_key: dimensionKey,
        teacher_comment: teacherComment,
        metadata: { teacher_action: 'confirmed', reviewed_at: now, conversation_action: 'conversation_finalized', ...(dimensionKey ? { dimension_key: dimensionKey } : {}), ...(teacherComment ? { teacher_comment: teacherComment } : {}) },
      });
    }
  }

  // 一条都没处置过就提交，等于把「我不打算让这些进训练数据」和「我全看过了」混成一次点击。
  // 直接拒绝并说清差多少，教师要么去处理，要么就别提交。
  if (materializedRows.length === 0) {
    return {
      ok: false,
      message: `本次会话的 ${assistantMessages.length} 条 AI 回答都还没有你的确认或修订，不会进入训练数据。请先逐条确认无误或修订回答，再提交整个会话。`,
    };
  }

  const latestAssistant = assistantMessages[assistantMessages.length - 1];
  const supabase = await createClient();
  if (materializedRows.length > 0) {
    // 必须取回命中行数：RLS 静默过滤掉的 INSERT 既不报 error 也不返回行，
    // 只看 error 分支的话「一条样本都没进去」和「保存成功」长得一模一样。
    const { data: inserted, error: materializeError } = await supabase
      .from('audit_records')
      .insert(materializedRows)
      .select('id');
    if (materializeError) return { ok: false, message: `会话级核实样本保存失败：${materializeError.message}` };
    if (!inserted || inserted.length !== materializedRows.length) {
      return {
        ok: false,
        message: `核实样本只写入了 ${inserted?.length ?? 0}/${materializedRows.length} 条，本次提交未生效。请刷新后重试；若持续失败请联系管理员。`,
      };
    }
  }

  for (const update of studentRevisionUpdates) {
    const { data: syncedRows, error: syncError } = await supabase
      .from('conversation_messages')
      .update({
        content: update.correctedAnswer,
        parts: teacherRevisionParts(update.correctedAnswer, now),
      })
      .eq('id', update.messageId)
      .eq('conversation_id', conversation.id)
      .select('id');

    if (syncError) return { ok: false, message: `会话级修订同步学生侧失败：${syncError.message}` };
    if (!syncedRows || syncedRows.length === 0) {
      return {
        ok: false,
        message: '修订没有同步到学生侧，本次未保存。请稍后重试；若持续失败请联系管理员。',
      };
    }
  }

  // 状态真源：写会话列。此后所有读者（教师队列、导出、封口判定）都读这些列，
  // 不再扫 audit_records 的 JSON 推导「是否已核实」。
  //
  // 三个终态字段各管一件事，此前它们是一个字段：
  //   finalized_at / finalized_by / review_state —— 核实完成（教学状态）
  //   teacher_comment                            —— 教师给学生的会话级评语
  //   locked_at                                  —— 封口（交互开关，默认不写）
  //
  // 条件更新 + 查行数，两个原因，缺一不可：
  //   · `.is('finalized_at', null)` 让"提交核实"成为一次条件写。两个教师同时点提交时，
  //     后到的那个拿到 0 行而不是把前一个人的时间戳和样本一起覆盖成两份。
  //   · `.select('id')` 让 0 行可辨。RLS 静默过滤掉的 UPDATE 既不报 error 也不返回行，
  //     而"返回 0 行"和"已更新"在只看 error 分支的代码里长得一模一样。
  // deleted_at 过滤是产品硬约束：学生已删除的会话不进入核实，也不能被标记为已核实。
  const shouldLock = String(formData.get('lock_conversation') ?? '') === 'on';
  const { data: finalizedRows, error: finalizeError } = await supabase
    .from('conversations')
    .update({
      finalized_at: now,
      finalized_by: role.data.id,
      review_state: 'finalized',
      teacher_comment: String(formData.get('teacher_comment') ?? '').trim() || null,
      ...(shouldLock ? { locked_at: now } : {}),
    })
    .eq('id', conversation.id)
    .is('finalized_at', null)
    .is('deleted_at', null)
    .select('id');
  if (finalizeError) return { ok: false, message: `会话核实状态写入失败：${finalizeError.message}` };
  if (!finalizedRows || finalizedRows.length === 0) {
    return { ok: false, message: '这个会话已被提交或已被学生删除，本次提交未生效。请刷新后查看最新状态。' };
  }

  // 审计事件：记录本次提交的计数，供导出与追溯。不承担状态判定职责。
  const { error: auditEventError } = await supabase.from('audit_records').insert({
    source_message_id: latestAssistant.id,
    source_conversation_id: conversation.id,
    auditor_id: role.data.id,
    class_id: classId,
    kind: 'metadata',
    status: 'approved',
    quality: 'conversation_finalized',
    prompt: '教师会话级最终核实提交',
    original_answer: null,
    corrected_answer: null,
    rationale: '教师已完成整个会话的学习记录核实。',
    teacher_comment: String(formData.get('teacher_comment') ?? '').trim() || null,
    metadata: {
      teacher_action: 'conversation_finalized',
      finalized_at: now,
      assistant_count: assistantMessages.length,
      confirmed_count: confirmedCount,
      revised_count: revisedCount,
      materialized_record_count: materializedRows.length,
      // 跳过的条数进事件：教师日后回看时能知道当时漏了哪几条、为什么没进训练数据。
      skipped_count: skippedMessageIds.length,
      skipped_message_ids: skippedMessageIds,
      locked: shouldLock,
    },
  });

  if (auditEventError) return { ok: false, message: `会话级最终提交保存失败：${auditEventError.message}` };

  await broadcastStudentConversationUpdate(supabase, conversation.id, {
    kind: 'conversation_finalized',
    revisedAt: now,
  });

  revalidatePath('/teacher');
  revalidatePath('/teacher/audit');
  revalidatePath('/student');
  revalidatePath('/admin/exports');
  // 成功文案必须说清跳过了多少条。不说的话，教师会以为整个会话都进了训练数据，
  // 而没处理过的那几条永远不会有第二次机会——那正是本次要消除的静默。
  const skippedNote = skippedMessageIds.length > 0
    ? `本次未处理的 ${skippedMessageIds.length} 条回答不会进入训练数据。`
    : '全部 AI 回答都已处理。';
  const lockNote = shouldLock ? '已封口，学生不能在该会话继续追问。' : '未封口，学生仍可在该会话继续追问。';
  return { ok: true, message: `会话级核实已提交；${confirmedCount} 条确认无误，${revisedCount} 条使用教师修订版。${skippedNote}${lockNote}` };
}

/**
 * 封口 / 解封。
 *
 * 封口是教师的可选动作，且与核实完成解耦：已核实但未封口的会话学生可以继续追问，
 * 而教师随时可以补封口或解封（此前只有提交核实这一个不可逆的封口入口）。
 */
export async function setConversationLock(conversationId: string, _previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  void _previousState;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const lock = String(formData.get('lock') ?? '') === 'on';
  const contextResult = await getConversationContext(conversationId, role.data.id);
  if (!contextResult.ok) return { ok: false, message: contextResult.message };
  const { conversation } = contextResult.data;
  if (Boolean(conversation.locked_at) === lock) {
    return { ok: true, message: lock ? '这个会话已经是封口状态。' : '这个会话当前未封口。' };
  }

  const supabase = await createClient();
  const { data: updatedRows, error } = await supabase
    .from('conversations')
    .update({ locked_at: lock ? new Date().toISOString() : null })
    .eq('id', conversation.id)
    .is('deleted_at', null)
    .select('id');
  if (error) return { ok: false, message: `${lock ? '封口' : '解封'}失败：${error.message}` };
  if (!updatedRows || updatedRows.length === 0) {
    return { ok: false, message: `${lock ? '封口' : '解封'}没有生效，本次操作未保存。请刷新后重试。` };
  }

  await broadcastStudentConversationUpdate(supabase, conversation.id, {
    kind: 'conversation_finalized',
    revisedAt: new Date().toISOString(),
  });
  revalidatePath('/teacher');
  revalidatePath('/teacher/audit');
  revalidatePath('/student');
  return { ok: true, message: lock ? '已封口：学生不能在该会话继续追问。' : '已解封：学生可以继续在该会话追问。' };
}

export async function saveTeacherPromptPreset(_previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  void _previousState;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const title = String(formData.get('title') ?? '').trim();
  const scenario = String(formData.get('scenario') ?? '').trim();
  const systemInstruction = String(formData.get('system_instruction') ?? '').trim();
  const userTemplate = String(formData.get('user_template') ?? '').trim() || null;
  const variables = String(formData.get('variables') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const errors: Record<string, string> = {};
  if (!title) errors.title = '请填写模板名称。';
  if (!scenario) errors.scenario = '请填写教学场景。';
  if (!systemInstruction) errors.system_instruction = '请填写模板内容。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐模板信息。', errors };

  const supabase = await createClient();
  const { error } = await supabase.from('prompt_presets').insert({
    title,
    scenario,
    system_instruction: systemInstruction,
    user_template: userTemplate,
    variables,
    target_role: 'teacher',
    status: 'draft',
    created_by: role.data.id,
  });
  if (error) return { ok: false, message: `教师预设保存失败：${error.message}` };
  revalidatePath('/teacher/chat');
  revalidatePath('/teacher');
  return { ok: true, message: '模板已保存，可在上方模板列表中选用。' };
}

