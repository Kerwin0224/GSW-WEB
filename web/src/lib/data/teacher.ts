import type { UIMessage } from 'ai';
import { canonicalizeUiMessageParts } from '@/lib/chat-message-parts';
import { createClient } from '@/lib/supabase/server';
import { containsPreReviewQuote, isPreReviewResultChecked, normalizePreReviewIssuesForMessage, type NormalizedPreReviewIssue } from '@/lib/teacher-pre-review';
import { fail, getCapability, ok, requireRole, type DataResult } from './common';
import type { Database } from '@/lib/supabase/database.types';
import {
  asMetadataObject,
  firstJoined,
  isApprovedAudit,
  isRevisionDraft,
  latestMaterializedReview,
  latestMetadataByAction,
  latestRevisionDraft,
  metadataAction,
  metadataText,
  resolveRevisionDisplay,
  resolveReviewState,
  reviewTimestamp,
  type AuditRowBase,
  type ReviewState,
} from './audit-record';

export type TeacherSessionSummary = { id: string; title: string; messageCount: number; updatedLabel: string };
export type TeacherConversationInitial = { id: string; title: string; messages: UIMessage[] };
export type TeacherWorkspace = { presets: Database['public']['Tables']['prompt_presets']['Row'][]; teacherPresets: Database['public']['Tables']['prompt_presets']['Row'][]; providerBlocked?: string; sessions: TeacherSessionSummary[] };
export type TeacherAnalytics = {
  assignedClasses: number;
  auditWorkload: number;
  studentsWaitingChallenge: number;
  reviewedCount: number;
  weeklyAuditCoverage: { coveragePercent: number; audited: number; pending: number; eligible: number };
  stuckStudents: Array<{ studentId: string; studentName: string; className: string; lowLevelAttempts: number; attempts: number; auditHref: string }>;
  weakProjects: Array<{ projectId: string; title: string; className: string; notAchieved: number; attempts: number; weakRate: number; auditHref: string }>;
};
export type TeacherPreReviewIssue = { messageId: string; quote: string; label: string; severity: 'low' | 'medium' | 'high' };
export type { ReviewState } from './audit-record';
export type PreReviewState = 'not_run' | 'ready' | 'partial' | 'blocked' | 'failed';
export type TeacherAuditMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  originalContent?: string;
  revisedContent?: string;
  createdAt: string;
  isSource: boolean;
  reviewState?: ReviewState;
  preReviewChecked: boolean;
  preReviewIssues: TeacherPreReviewIssue[];
};
export type AuditQueueRecord = {
  id: string;
  conversationId: string;
  sourceMessageId: string;
  prompt: string;
  answer: string;
  classId: string | null;
  classLabel: string;
  studentName: string;
  projectTitle: string;
  sessionLabel: string;
  createdAt: string;
  transcript: TeacherAuditMessage[];
  preReviewIssues: TeacherPreReviewIssue[];
  preReviewState: PreReviewState;
  preReviewBlocked?: string;
  reviewState: ReviewState;
  conversationFinalized: boolean;
  finalizedAt?: string;
  assistantCount: number;
  preReviewCoveredMessageCount: number;
  pendingAssistantCount: number;
  revisedAssistantCount: number;
  riskAssistantCount: number;
};

type ConversationJoin = {
  class_id: string | null;
  project_id: string | null;
  source: string;
  title?: string | null;
  deleted_at?: string | null;
  profiles?: { display_name?: string | null } | Array<{ display_name?: string | null }>;
  text_projects?: { title?: string | null } | Array<{ title?: string | null }>;
  classes?: { name?: string | null } | Array<{ name?: string | null }>;
};

type ReviewAuditRow = AuditRowBase & {
  source_message_id?: string | null;
  source_conversation_id?: string | null;
  rationale?: string | null;
};

type ConversationSummaryRow = {
  id: string;
  title: string | null;
  updated_at: string;
  conversation_messages?: Array<{ id: string }> | null;
};
type ConversationMessageRow = Pick<Database['public']['Tables']['conversation_messages']['Row'], 'id' | 'role' | 'content' | 'parts'>;

type CandidateRow = {
  id: string;
  conversation_id: string;
  content: string;
  created_at: string;
  conversations?: ConversationJoin | ConversationJoin[];
};

function parseStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * 从会话级 AI 预审 metadata 中提取规范化 issues 和覆盖追踪。
 * issue 规范化委托给 teacher-pre-review.ts 的 normalizePreReviewIssuesForMessage，
 * 确保 quote 匹配验证、去重和截断逻辑只有一份实现。
 */
function parsePreReview(
  row: ReviewAuditRow | undefined,
  assistantMessages: Array<{ id: string; content: string }>,
) {
  const assistantIds = new Set(assistantMessages.map((m) => m.id));
  if (!row) return { issues: [] as TeacherPreReviewIssue[], reviewedMessageIds: new Set<string>() };
  const metadata = asMetadataObject(row.metadata);
  const reviewedMessageIds = new Set<string>();
  const issues: TeacherPreReviewIssue[] = [];
  const issueKeys = new Set<string>();

  // 从 metadata 中提取已覆盖的消息 ID
  for (const messageId of [
    ...parseStringArray(metadata.reviewed_message_ids),
    ...parseStringArray(metadata.reviewedMessageIds),
    ...parseStringArray(metadata.audited_message_ids),
  ]) {
    if (assistantIds.has(messageId)) reviewedMessageIds.add(messageId);
  }

  const appendIssues = (normalized: NormalizedPreReviewIssue[]) => {
    for (const issue of normalized) {
      const key = `${issue.messageId}\u0000${issue.quote}\u0000${issue.label}`;
      if (issueKeys.has(key)) continue;
      issueKeys.add(key);
      issues.push(issue);
      reviewedMessageIds.add(issue.messageId);
    }
  };

  // 处理顶层 issues 数组（旧格式）
  const rawIssues = metadata.issues;
  if (Array.isArray(rawIssues)) {
    // 按 messageId 分组后委托给 normalizePreReviewIssuesForMessage
    const issuesByMsg = new Map<string, unknown[]>();
    for (const issueValue of rawIssues) {
      const obj = asMetadataObject(issueValue);
      const msgId = typeof obj.messageId === 'string' ? obj.messageId : typeof obj.message_id === 'string' ? obj.message_id : '';
      if (!assistantIds.has(msgId)) continue;
      const list = issuesByMsg.get(msgId) ?? [];
      list.push(issueValue);
      issuesByMsg.set(msgId, list);
    }
    for (const [msgId, msgIssues] of issuesByMsg) {
      const msg = assistantMessages.find((m) => m.id === msgId);
      if (!msg) continue;
      const { issues: normalized } = normalizePreReviewIssuesForMessage(msg, msgIssues);
      appendIssues(normalized);
    }
  }

  // 处理 message_results / messageResults 数组（新格式）
  const rawResults = metadata.message_results ?? metadata.messageResults;
  if (Array.isArray(rawResults)) {
    for (const resultValue of rawResults) {
      const result = asMetadataObject(resultValue);
      const messageId = typeof result.messageId === 'string' ? result.messageId : typeof result.message_id === 'string' ? result.message_id : '';
      if (assistantIds.has(messageId)) {
        if (isPreReviewResultChecked(result)) {
          reviewedMessageIds.add(messageId);
        } else {
          reviewedMessageIds.delete(messageId);
        }
      }
      if (Array.isArray(result.issues)) {
        const msg = assistantMessages.find((m) => m.id === messageId);
        if (msg) {
          const { issues: normalized } = normalizePreReviewIssuesForMessage(msg, result.issues);
          appendIssues(normalized);
        }
      }
    }
  }

  // 从覆盖集中移除明确标记为缺失的消息
  for (const messageId of [
    ...parseStringArray(metadata.missing_message_ids),
    ...parseStringArray(metadata.missingMessageIds),
  ]) {
    reviewedMessageIds.delete(messageId);
  }

  return { issues, reviewedMessageIds };
}

async function getTeacherClassIds(teacherId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('class_memberships').select('class_id').eq('profile_id', teacherId).eq('role', 'teacher');
  if (error) return { ok: false as const, message: `教师班级范围加载失败：${error.message}` };
  return { ok: true as const, classIds: (data ?? []).map((row) => row.class_id) };
}

function toTeacherSessionSummary(conversation: ConversationSummaryRow): TeacherSessionSummary {
  return {
    id: conversation.id,
    title: conversation.title ?? '未命名会话',
    messageCount: Array.isArray(conversation.conversation_messages) ? conversation.conversation_messages.length : 0,
    updatedLabel: new Date(conversation.updated_at).toLocaleString('zh-CN'),
  };
}

function toInitialMessage(message: ConversationMessageRow): UIMessage {
  return {
    id: message.id,
    role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
    parts: canonicalizeUiMessageParts(message.content, message.parts),
  };
}

export async function getTeacherWorkspace(): Promise<DataResult<TeacherWorkspace>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();
  const [{ data: presets, error }, { data: teacherPresets, error: teacherPresetError }, { data: conversations, error: conversationError }, cap] = await Promise.all([
    supabase.from('prompt_presets').select('*').eq('status', 'published').eq('target_role', 'teacher').order('updated_at', { ascending: false }),
    supabase.from('prompt_presets').select('*').eq('target_role', 'teacher').eq('created_by', role.data.id).order('updated_at', { ascending: false }),
    supabase.from('conversations').select('id,title,updated_at,conversation_messages(id)').eq('owner_id', role.data.id).eq('source', 'teacher_chat').is('deleted_at', null).order('updated_at', { ascending: false }).limit(12),
    getCapability('teacher_chat'),
  ]);
  if (error) return fail('error', `提示词模板加载失败：${error.message}`);
  if (teacherPresetError) return fail('error', `教师自建模板加载失败：${teacherPresetError.message}`);
  if (conversationError) return fail('error', `教师会话加载失败：${conversationError.message}`);
  const presetMap = new Map([...(teacherPresets ?? []), ...(presets ?? [])].map((preset) => [preset.id, preset]));
  return ok({ presets: Array.from(presetMap.values()), teacherPresets: teacherPresets ?? [], providerBlocked: cap.ok && cap.data.ready ? undefined : cap.ok ? cap.data.blockedReason : cap.message, sessions: (conversations ?? []).map((conversation) => toTeacherSessionSummary(conversation as ConversationSummaryRow)) });
}

export async function getTeacherConversation(conversationId: string): Promise<DataResult<TeacherConversationInitial | null>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id,title')
    .eq('id', conversationId)
    .eq('owner_id', role.data.id)
    .eq('source', 'teacher_chat')
    .is('deleted_at', null)
    .maybeSingle();
  if (conversationError) return fail('error', `会话加载失败：${conversationError.message}`);
  if (!conversation) return ok(null);

  const { data: messages, error: messagesError } = await supabase
    .from('conversation_messages')
    .select('id,role,content,parts')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true });
  if (messagesError) return fail('error', `会话记录加载失败：${messagesError.message}`);

  return ok({
    id: conversation.id,
    title: conversation.title ?? '未命名会话',
    messages: (messages ?? []).map((message) => toInitialMessage(message as ConversationMessageRow)),
  });
}

export async function getTeacherAuditQueue(): Promise<DataResult<AuditQueueRecord[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;

  const classScope = await getTeacherClassIds(role.data.id);
  if (!classScope.ok) return fail('error', classScope.message);
  if (classScope.classIds.length === 0) return ok([]);

  const supabase = await createClient();
  const [messageResult, auditCap] = await Promise.all([
    supabase
      .from('conversation_messages')
      .select('id,conversation_id,content,created_at,conversations!inner(class_id,project_id,source,title,deleted_at,profiles(display_name),text_projects(title),classes(name))')
      .eq('role', 'assistant')
      .is('conversations.deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500),
    getCapability('audit_assist'),
  ]);
  if (messageResult.error) return fail('error', `学习记录核实加载失败：${messageResult.error.message}`);

  const scopedRows = ((messageResult.data ?? []) as CandidateRow[])
    .filter((row) => {
      const conversation = firstJoined(row.conversations);
      return Boolean(
        conversation?.class_id
        && classScope.classIds.includes(conversation.class_id)
        && conversation.source === 'student_chat'
        && conversation.project_id
        && conversation.deleted_at === null,
      );
    });

  const rowsByConversation = new Map<string, CandidateRow[]>();
  for (const row of scopedRows) {
    const rows = rowsByConversation.get(row.conversation_id) ?? [];
    rows.push(row);
    rowsByConversation.set(row.conversation_id, rows);
  }

  const candidateConversations = Array.from(rowsByConversation.entries())
    .map(([conversationId, rows]) => {
      const sortedRows = [...rows].sort((left, right) => right.created_at.localeCompare(left.created_at));
      return { conversationId, latestRow: sortedRows[0] };
    })
    .sort((left, right) => right.latestRow.created_at.localeCompare(left.latestRow.created_at))
    .slice(0, 30);

  if (candidateConversations.length === 0) return ok([]);

  const conversationIds = candidateConversations.map((conversation) => conversation.conversationId);
  const [transcriptResult, auditResult] = await Promise.all([
    supabase
      .from('conversation_messages')
      .select('id,conversation_id,role,content,created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true }),
    supabase
      .from('audit_records')
      .select('source_message_id,source_conversation_id,kind,status,original_answer,corrected_answer,chosen_answer,rejected_answer,metadata,created_at,updated_at')
      .in('source_conversation_id', conversationIds)
      .order('created_at', { ascending: true }),
  ]);

  if (transcriptResult.error) return fail('error', `会话记录加载失败：${transcriptResult.error.message}`);
  if (auditResult.error) return fail('error', `核实记录加载失败：${auditResult.error.message}`);

  const transcriptByConversation = new Map<string, Array<{ id: string; conversation_id: string; role: TeacherAuditMessage['role']; content: string; created_at: string }>>();
  for (const row of (transcriptResult.data ?? []) as Array<{ id: string; conversation_id: string; role: TeacherAuditMessage['role']; content: string; created_at: string }>) {
    const rows = transcriptByConversation.get(row.conversation_id) ?? [];
    rows.push(row);
    transcriptByConversation.set(row.conversation_id, rows);
  }

  const auditsByConversation = new Map<string, ReviewAuditRow[]>();
  const auditsByMessage = new Map<string, ReviewAuditRow[]>();
  for (const audit of (auditResult.data ?? []) as ReviewAuditRow[]) {
    if (audit.source_conversation_id) {
      const rows = auditsByConversation.get(audit.source_conversation_id) ?? [];
      rows.push(audit);
      auditsByConversation.set(audit.source_conversation_id, rows);
    }
    if (audit.source_message_id) {
      const rows = auditsByMessage.get(audit.source_message_id) ?? [];
      rows.push(audit);
      auditsByMessage.set(audit.source_message_id, rows);
    }
  }

  const auditBlocked = auditCap.ok && auditCap.data.ready ? undefined : auditCap.ok ? auditCap.data.blockedReason : auditCap.message;

  const records = candidateConversations.map(({ conversationId, latestRow }) => {
    const rawTranscript = transcriptByConversation.get(conversationId) ?? [];
    const conversationAudits = auditsByConversation.get(conversationId) ?? [];
    const assistantIds = new Set(rawTranscript.filter((item) => item.role === 'assistant').map((item) => item.id));
    const assistantMessages = rawTranscript.filter((item) => item.role === 'assistant').map((item) => ({ id: item.id, content: item.content }));
    const preReviewRow = latestMetadataByAction(conversationAudits, 'conversation_pre_review');
    const finalizedRow = latestMetadataByAction(conversationAudits, 'conversation_finalized');
    const parsedPreReview = parsePreReview(preReviewRow, assistantMessages);
    const preReviewIssues = parsedPreReview.issues;
    const issuesByMessage = new Map<string, TeacherPreReviewIssue[]>();
    for (const issue of preReviewIssues) {
      const issues = issuesByMessage.get(issue.messageId) ?? [];
      issues.push(issue);
      issuesByMessage.set(issue.messageId, issues);
    }

    const assistantStates = rawTranscript
      .filter((item) => item.role === 'assistant')
      .map((item) => ({ id: item.id, reviewState: resolveReviewState(auditsByMessage.get(item.id)) }));
    const revisedAssistantCount = assistantStates.filter((item) => item.reviewState === 'revised').length;
    const pendingAssistantCount = finalizedRow ? 0 : assistantStates.length;
    const conversationReviewState: ReviewState = finalizedRow
      ? revisedAssistantCount > 0 ? 'revised' : 'confirmed'
      : 'pending';
    const preReviewMetadata = asMetadataObject(preReviewRow?.metadata);
    const preReviewFailed = preReviewMetadata.review_status === 'failed' || preReviewMetadata.status === 'failed' || typeof preReviewMetadata.error === 'string';
    const preReviewCoveredMessageCount = parsedPreReview.reviewedMessageIds.size;
    const preReviewState: PreReviewState = preReviewRow
      ? preReviewFailed ? 'failed' : preReviewCoveredMessageCount >= assistantIds.size ? 'ready' : 'partial'
      : auditBlocked ? 'blocked' : 'not_run';

    const transcript: TeacherAuditMessage[] = rawTranscript.map((transcriptRow) => {
      const isAssistant = transcriptRow.role === 'assistant';
      const messageAudits = isAssistant ? auditsByMessage.get(transcriptRow.id) : undefined;
      const revisionDisplay = isAssistant ? resolveRevisionDisplay(messageAudits) : null;
      return {
        id: transcriptRow.id,
        role: transcriptRow.role,
        content: transcriptRow.content,
        originalContent: revisionDisplay?.originalAnswer,
        revisedContent: revisionDisplay?.correctedAnswer,
        createdAt: transcriptRow.created_at,
        isSource: isAssistant,
        reviewState: isAssistant ? resolveReviewState(messageAudits) : undefined,
        preReviewChecked: isAssistant && parsedPreReview.reviewedMessageIds.has(transcriptRow.id),
        preReviewIssues: issuesByMessage.get(transcriptRow.id) ?? [],
      };
    });

    const latestAssistantIndex = transcript.findIndex((item) => item.id === latestRow.id);
    const prompt = latestAssistantIndex <= 0
      ? '源问题未返回；请先核对完整对话再确认。'
      : [...transcript.slice(0, latestAssistantIndex)].reverse().find((item) => item.role === 'user')?.content ?? '源问题未返回；请先核对完整对话再确认。';
    const conversation = firstJoined(latestRow.conversations);
    const profile = firstJoined(conversation?.profiles);
    const project = firstJoined(conversation?.text_projects);
    const klass = firstJoined(conversation?.classes);

    const finalizedMetadata = asMetadataObject(finalizedRow?.metadata);
    return {
      id: conversationId,
      conversationId,
      sourceMessageId: latestRow.id,
      prompt,
      answer: latestRow.content,
      classId: conversation?.class_id ?? null,
      classLabel: klass?.name?.trim() || '未命名班级',
      studentName: profile?.display_name ?? '学生',
      projectTitle: project?.title ?? '未关联篇目',
      sessionLabel: conversation?.title?.trim() || `会话 ${conversationId.slice(0, 8)}`,
      createdAt: latestRow.created_at,
      transcript,
      preReviewIssues,
      preReviewState,
      preReviewBlocked: preReviewState === 'blocked' ? auditBlocked : preReviewState === 'failed' ? String(preReviewMetadata.error ?? 'AI 辅助审计失败，请手动重新发起。') : undefined,
      reviewState: conversationReviewState,
      conversationFinalized: Boolean(finalizedRow),
      finalizedAt: typeof finalizedMetadata.finalized_at === 'string' ? finalizedMetadata.finalized_at : finalizedRow ? reviewTimestamp(finalizedRow) : undefined,
      assistantCount: assistantStates.length,
      preReviewCoveredMessageCount,
      pendingAssistantCount,
      revisedAssistantCount,
      riskAssistantCount: new Set(preReviewIssues.map((issue) => issue.messageId)).size,
    } satisfies AuditQueueRecord;
  }).sort((left, right) => {
    if (left.conversationFinalized !== right.conversationFinalized) return left.conversationFinalized ? 1 : -1;
    if (left.riskAssistantCount !== right.riskAssistantCount) return right.riskAssistantCount - left.riskAssistantCount;
    return right.createdAt.localeCompare(left.createdAt);
  });

  return ok(records);
}

export async function getTeacherAnalytics(): Promise<DataResult<TeacherAnalytics>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;

  const classScope = await getTeacherClassIds(role.data.id);
  if (!classScope.ok) return fail('error', classScope.message);

  const supabase = await createClient();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weekStartIso = weekStart.toISOString();

  const [{ count: classCount, error: classError }, { data: messageRows, error: messageError }] = await Promise.all([
    supabase.from('class_memberships').select('id', { count: 'exact', head: true }).eq('profile_id', role.data.id).eq('role', 'teacher'),
    supabase
      .from('conversation_messages')
      .select('id,conversation_id,created_at,conversations!inner(class_id,project_id,source,deleted_at),audit_records(kind,status,corrected_answer,chosen_answer,created_at,updated_at)')
      .eq('role', 'assistant')
      .is('conversations.deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  if (classError) return fail('error', `班级统计失败：${classError.message}`);
  if (messageError) return fail('error', `学习记录统计失败：${messageError.message}`);

  const eligibleRows = ((messageRows ?? []) as Array<{
    id: string;
    conversation_id: string;
    created_at: string;
    audit_records?: ReviewAuditRow[];
    conversations?: { class_id: string | null; project_id: string | null; source: string; deleted_at: string | null } | Array<{ class_id: string | null; project_id: string | null; source: string; deleted_at: string | null }>;
  }>).filter((row) => {
    const conversation = firstJoined(row.conversations);
    return Boolean(
      conversation?.class_id
      && classScope.classIds.includes(conversation.class_id)
      && conversation.source === 'student_chat'
      && conversation.project_id
      && conversation.deleted_at === null,
    );
  });
  const latestEligibleRowsByConversation = new Map<string, (typeof eligibleRows)[number]>();
  for (const row of eligibleRows) {
    if (!latestEligibleRowsByConversation.has(row.conversation_id)) {
      latestEligibleRowsByConversation.set(row.conversation_id, row);
    }
  }

  const auditStates = Array.from(latestEligibleRowsByConversation.values()).map((row) => ({ createdAt: row.created_at, reviewState: resolveReviewState(row.audit_records) }));
  const reviewed = auditStates.filter((row) => row.reviewState !== 'pending');
  const weeklyEligibleRows = auditStates.filter((row) => row.createdAt >= weekStartIso);
  const weeklyAuditedRows = weeklyEligibleRows.filter((row) => row.reviewState !== 'pending');
  const eligible = weeklyEligibleRows.length;
  const audited = weeklyAuditedRows.length;
  const pending = Math.max(eligible - audited, 0);
  const coveragePercent = eligible > 0 ? Math.min(Math.round((audited / eligible) * 100), 100) : 0;

  return ok({
    assignedClasses: classCount ?? 0,
    auditWorkload: auditStates.filter((row) => row.reviewState === 'pending').length,
    studentsWaitingChallenge: 0,
    reviewedCount: reviewed.length,
    weeklyAuditCoverage: { coveragePercent, audited, pending, eligible },
    stuckStudents: [] as Array<{ studentId: string; studentName: string; className: string; lowLevelAttempts: number; attempts: number; auditHref: string }>,
    weakProjects: [] as Array<{ projectId: string; title: string; className: string; notAchieved: number; attempts: number; weakRate: number; auditHref: string }>,
  });
}
