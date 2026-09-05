'use server';

import { generateObject, type LanguageModel } from 'ai';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  normalizePreReviewIssuesForMessage,
  normalizePreReviewResults,
  toPreReviewMetadataResult,
  type NormalizedPreReviewResult,
} from '@/lib/teacher-pre-review';
import { getCapability, jsonForDatabase, requireRole, resolveLanguageModel } from './common';
import { broadcastStudentConversationUpdate } from './student-conversation-broadcast';
import {
  asMetadataObject,
  firstJoined,
  isApprovedAudit,
  isRevisionDraft,
  latestMaterializedReview,
  latestRevisionDraft,
  metadataAction,
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
  conversationFinalized: boolean;
};

type ConversationContext = {
  conversation: { id: string; class_id: string | null; project_id: string | null; source: string; title: string | null };
  classId: string;
  transcript: Array<{ id: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; created_at: string }>;
  auditRows: AuditRow[];
};

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

function isConversationFinalized(audits: AuditRow[]) {
  return audits.some((audit) => audit.kind === 'metadata' && isApprovedAudit(audit) && metadataAction(audit) === 'conversation_finalized');
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
    .select('id,class_id,project_id,source,title')
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

  const { data: membership, error: membershipError } = await supabase
    .from('class_memberships')
    .select('id')
    .eq('class_id', conversation.class_id)
    .eq('profile_id', teacherId)
    .eq('role', 'teacher')
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, message: `教师班级权限校验失败：${membershipError.message}` };
  }

  if (!membership) {
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
      .select('id,source_message_id,source_conversation_id,kind,status,original_answer,corrected_answer,chosen_answer,rejected_answer,rationale,metadata,created_at,updated_at')
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
  if (conversation.deleted_at) {
    return { ok: false, message: '该会话已被学生删除，不能再进入学习记录核实。' };
  }

  const { data: membership, error: membershipError } = await supabase
    .from('class_memberships')
    .select('id')
    .eq('class_id', conversation.class_id)
    .eq('profile_id', teacherId)
    .eq('role', 'teacher')
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return { ok: false, message: `教师班级权限校验失败：${membershipError.message}` };
  }

  if (!membership) {
    return { ok: false, message: '你无权核实这条学习记录。' };
  }

  const [{ data: transcriptRows, error: transcriptError }, { data: auditRows, error: auditError }] = await Promise.all([
    supabase
      .from('conversation_messages')
      .select('id,role,content,created_at')
      .eq('conversation_id', source.conversation_id)
      .order('created_at', { ascending: true }),
    supabase
      .from('audit_records')
      .select('id,source_message_id,source_conversation_id,kind,status,original_answer,corrected_answer,chosen_answer,rejected_answer,rationale,metadata,created_at,updated_at')
      .eq('source_conversation_id', source.conversation_id)
      .order('created_at', { ascending: true }),
  ]);

  if (transcriptError) {
    return { ok: false, message: `学习记录上下文加载失败：${transcriptError.message}` };
  }

  if (auditError) {
    return { ok: false, message: `核实历史加载失败：${auditError.message}` };
  }

  const transcript = (transcriptRows ?? []) as ConversationContext['transcript'];
  const prompt = nearestPrompt(transcript, source.id);

  if (!prompt) {
    return { ok: false, message: '缺少这条 AI 回答对应的学生问题，不能脱离上下文核实。' };
  }

  const conversationAudits = (auditRows ?? []) as AuditRow[];
  const sourceAudits = conversationAudits.filter((row) => row.source_message_id === source.id);
  const reviewedAudits = sourceAudits.filter(isApprovedAudit);
  const originalAnswer = resolveOriginalAnswer(source.content, sourceAudits);

  return {
    ok: true,
    data: {
      source: source as SourceMessage,
      classId: conversation.class_id,
      prompt,
      originalAnswer,
      currentAnswer: source.content.trim(),
      reviewState: resolveReviewState(reviewedAudits),
      conversationFinalized: isConversationFinalized(conversationAudits),
    },
  };
}

export async function confirmLearningRecord(sourceMessageId: string, _previousState: AuditSubmissionState, _formData: FormData): Promise<AuditSubmissionState> {
  void _previousState;
  void _formData;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const contextResult = await getSourceContext(sourceMessageId, role.data.id);
  if (!contextResult.ok) return { ok: false, message: contextResult.message };

  const { reviewState, conversationFinalized } = contextResult.data;
  if (conversationFinalized) {
    return { ok: true, message: '这个会话已经完成最终核实提交；学生侧已停止继续追问。' };
  }

  if (reviewState === 'confirmed') {
    return { ok: true, message: '单条确认已并入会话级最终提交；如需调整，请直接保存修订。' };
  }

  if (reviewState === 'revised') {
    return { ok: true, message: '这条记录当前已是教师修订版；如需继续调整，请直接保存修订。' };
  }

  revalidatePath('/teacher');
  revalidatePath('/teacher/audit');
  return { ok: true, message: '单条确认已收敛到“确认提交整个会话”；未修订回答会在会话级最终提交时进入 SFT。' };
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

  const { source, classId, prompt, originalAnswer, currentAnswer, conversationFinalized } = contextResult.data;
  if (conversationFinalized) {
    return { ok: false, message: '这个会话已经完成最终核实提交，不能继续修订回答。' };
  }

  if (correctedAnswer === currentAnswer) {
    return { ok: false, message: '修订版与当前展示回答一致，请修改后再保存。', errors: { corrected_answer: '修订版与当前展示回答一致，请修改后再保存。' } };
  }

  const now = new Date().toISOString();
  const metadata = {
    teacher_action: 'revision_draft',
    reviewed_at: now,
    original_answer: originalAnswer,
    corrected_answer: correctedAnswer,
    rationale,
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
      message: '学生侧修订同步失败：RLS 未放行对会话消息的 UPDATE。请联系管理员检查 conversation_messages 的教师修订策略。',
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
  return { ok: true, message: '修订已保存并同步学生侧；最终提交整个会话前不会进入 SFT/DPO。' };
}

const preReviewIssueSchema = z.object({
  quote: z.string(),
  label: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
});

const conversationPreReviewSchema = z.object({
  results: z.array(z.object({
    messageId: z.string(),
    issues: z.array(preReviewIssueSchema.extend({ messageId: z.string().optional() })),
  })),
});

const singleMessagePreReviewSchema = z.object({
  issues: z.array(z.object({
    quote: z.string(),
    label: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
  })),
});

async function runPreReview(model: LanguageModel, transcript: ConversationContext['transcript']) {
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

  const result = await generateObject({
    model,
    schema: conversationPreReviewSchema,
    prompt: `你是文韵智途的 AI 预审助手。请在教师进行学习记录核实前，预审完整学生会话中的所有 AI 回答。

要求：
- 预审对象是整个会话里的所有学生提问与 AI 回答；判断某条 AI 回答时，可以参考它前后的学生提问和上下文。
- 必须返回 results 数组，并且每条 AI 回答都必须有且仅有一项结果；不要只返回有问题的回答。
- results.messageId 必须逐字使用下面清单中的 messageId；没有明显教学正确性疑点的回答也要返回 issues: []。
- 只定位可能误导学生学习古诗文的教学正确性风险，供教师核实；不要替教师做最终判错、评分、批改或数据打标。
- quote 必须逐字复制对应 AI 回答中的连续原文片段，不得改写、概括、翻译或拼接不连续文本；如果无法在该回答原文中找到连续片段，就不要返回该 issue。
- 优先关注误解字词句意、误引原文、错判作者/背景、情感脉络或表达手法解释牵强、把无依据推测说成定论、与学生问题明显不匹配的教学引导。
- 不要因为回答简短、风格普通、没有扩展讲解、没有使用固定教学步骤或没有给出标准答案就标红。
- severity 使用要克制：high 只给会直接误导学生理解篇目或事实的风险；medium 给需要教师重点核实的可疑解释；low 给轻微但值得定位的表述。
- 每条 AI 回答最多返回 4 个最需要教师定位的 issue；不要再做会话级全局截断。
- 标红片段只是定位疑点，教师最终处理粒度仍是整条 AI 回答气泡和会话级最终提交。

必须覆盖的 AI 回答：
${assistantChecklist}

完整会话：
${transcriptText}`,
  });

  let reviews = normalizePreReviewResults(assistantMessages, result.object.results);
  const fallbackTargets = reviews.filter((review) => review.status === 'missing_result' || review.ignoredIssueCount > 0);

  if (fallbackTargets.length > 0) {
    const fallbackReviews = await Promise.all(fallbackTargets.map(async (review) => {
      const message = assistantMessages.find((assistantMessage) => assistantMessage.id === review.messageId);
      if (!message) return review;
      try {
        const fallbackResult = await generateObject({
          model,
          schema: singleMessagePreReviewSchema,
          prompt: `你是文韵智途的 AI 预审助手。全会话预审中，这条 AI 回答的结果缺失或 quote 无法匹配原文。请只重审这一条 AI 回答。

要求：
- 只检查 messageId=${message.id} 这条 AI 回答，其他内容只作为上下文。
- quote 必须逐字复制这条 AI 回答中的连续原文片段，不得改写、概括、翻译或拼接不连续文本；如果无法在该回答原文中找到连续片段，就不要返回该 issue。
- 只关注可能误导学生学习古诗文的教学正确性风险，供教师核实；不要替教师做最终判错、评分、批改或数据打标。
- 优先关注误解字词句意、误引原文、错判作者/背景、情感脉络或表达手法解释牵强、把无依据推测说成定论、与学生问题明显不匹配的教学引导。
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
          ...normalizePreReviewIssuesForMessage(message, fallbackResult.object.issues),
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

  const checkedReviews = reviews.filter((review) => review.status === 'checked');

  return {
    reviewedMessageIds: checkedReviews.map((review) => review.messageId),
    missingMessageIds: reviews.filter((review) => review.status !== 'checked').map((review) => review.messageId),
    messageResults: reviews.map(toPreReviewMetadataResult),
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
  if (isConversationFinalized(contextResult.data.auditRows)) {
    return { ok: true, message: '这个会话已经完成最终核实提交，无需重复发起 AI 辅助审计。' };
  }

  const assistantMessages = contextResult.data.transcript.filter((row) => row.role === 'assistant');
  if (assistantMessages.length === 0) return { ok: false, message: '这个会话还没有 AI 回答，不能发起 AI 辅助审计。' };

  const capability = await getCapability('audit_assist');
  if (!capability.ok) return { ok: false, message: capability.message };
  if (!capability.data.ready) return { ok: false, message: capability.data.blockedReason ?? 'AI 辅助审计能力未就绪。' };
  const model = resolveLanguageModel(capability.data);
  if (!model) return { ok: false, message: `${capability.data.providerName ?? 'Provider'} 的 secret_ref 未在服务端环境中解析成功，不能发起 AI 辅助审计。` };

  let preReview: Awaited<ReturnType<typeof runPreReview>>;
  try {
    preReview = await runPreReview(model, contextResult.data.transcript);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? `AI 辅助审计失败：${error.message}` : 'AI 辅助审计失败：Provider 返回未知错误。' };
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
    prompt: 'AI 辅助审计：完整学生会话',
    original_answer: null,
    corrected_answer: null,
    rationale: preReview.issues.length ? 'AI 辅助审计返回疑点，等待教师核实。' : 'AI 辅助审计未发现明显教学正确性疑点。',
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

  if (error) return { ok: false, message: `AI 辅助审计结果保存失败：${error.message}` };
  revalidatePath('/teacher');
  revalidatePath('/teacher/audit');
  if (preReview.missingMessageIds.length > 0) {
    return { ok: true, message: `AI 辅助审计已保存，但当前只覆盖 ${preReview.reviewedMessageIds.length}/${assistantMessages.length} 条 AI 回答；请再次点击补审以补齐缺失结果。` };
  }
  return { ok: true, message: preReview.issues.length ? `AI 辅助审计完成，已覆盖 ${preReview.reviewedMessageIds.length} 条 AI 回答，发现 ${preReview.issues.length} 处需教师定位核实的疑点。` : `AI 辅助审计完成，已覆盖 ${preReview.reviewedMessageIds.length} 条 AI 回答，未发现明显教学正确性疑点。` };
}

export async function finalizeLearningConversation(conversationId: string, _previousState: AuditSubmissionState, _formData: FormData): Promise<AuditSubmissionState> {
  void _previousState;
  void _formData;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const contextResult = await getConversationContext(conversationId, role.data.id);
  if (!contextResult.ok) return { ok: false, message: contextResult.message };
  const { conversation, classId, transcript, auditRows } = contextResult.data;
  if (isConversationFinalized(auditRows)) {
    return { ok: true, message: '这个会话已经完成最终核实提交，学生侧不能继续追问。' };
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
  let revisedCount = 0;
  let confirmedCount = 0;

  for (const message of assistantMessages) {
    const messageAudits = auditsByMessage.get(message.id) ?? [];
    const prompt = nearestPrompt(transcript, message.id) || '源问题未返回；教师在完整会话中完成会话级核实。';
    const existingFinalizedKinds = new Set(messageAudits.filter(isFinalizedMaterializedReview).map((row) => row.kind));
    const revision = revisionFromDraft(latestRevisionDraft(messageAudits)) ?? revisionFromMaterialized(latestMaterializedReview(messageAudits));
    const isMeaningfulRevision = Boolean(revision && revision.correctedAnswer.trim() !== revision.originalAnswer.trim());

    if (isMeaningfulRevision && revision) {
      revisedCount += 1;
      studentRevisionUpdates.push({ messageId: message.id, correctedAnswer: revision.correctedAnswer });
      const commonMetadata = {
        teacher_action: 'revised',
        reviewed_at: now,
        conversation_action: 'conversation_finalized',
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
        rationale: '教师提交会话级最终核实，未修订的 AI 回答确认无误。',
        metadata: { teacher_action: 'confirmed', reviewed_at: now, conversation_action: 'conversation_finalized' },
      });
    }
  }

  const latestAssistant = assistantMessages[assistantMessages.length - 1];
  const supabase = await createClient();
  if (materializedRows.length > 0) {
    const { error: materializeError } = await supabase.from('audit_records').insert(materializedRows);
    if (materializeError) return { ok: false, message: `会话级核实样本保存失败：${materializeError.message}` };
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
        message: '会话级修订同步学生侧失败：RLS 未放行对会话消息的 UPDATE。请联系管理员检查 conversation_messages 的教师修订策略。',
      };
    }
  }

  const { error: finalizeError } = await supabase.from('audit_records').insert({
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
    rationale: '教师已完成整个会话的学习记录核实；学生侧停止在该会话继续追问。',
    metadata: {
      teacher_action: 'conversation_finalized',
      finalized_at: now,
      assistant_count: assistantMessages.length,
      confirmed_count: confirmedCount,
      revised_count: revisedCount,
      materialized_record_count: materializedRows.length,
    },
  });

  if (finalizeError) return { ok: false, message: `会话级最终提交保存失败：${finalizeError.message}` };

  await broadcastStudentConversationUpdate(supabase, conversation.id, {
    kind: 'conversation_finalized',
    revisedAt: now,
  });

  revalidatePath('/teacher');
  revalidatePath('/teacher/audit');
  revalidatePath('/student');
  revalidatePath('/admin/exports');
  return { ok: true, message: `会话级核实已提交；${confirmedCount} 条确认无误，${revisedCount} 条使用教师修订版，学生侧不能再继续追问这个会话。` };
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
  if (!title) errors.title = '请填写预设标题。';
  if (!scenario) errors.scenario = '请填写教学场景。';
  if (!systemInstruction) errors.system_instruction = '请填写提示词内容。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐教师预设信息。', errors };

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
  return { ok: true, message: '教师预设已保存为草稿。' };
}
