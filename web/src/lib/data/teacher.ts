import type { UIMessage } from 'ai';
import { canonicalizeUiMessageParts } from '@/lib/chat-message-parts';
import { createClient } from '@/lib/supabase/server';
import { isPreReviewResultChecked, normalizePreReviewIssuesForMessage, type NormalizedPreReviewIssue } from '@/lib/teacher-pre-review';
import { fail, getCapability, ok, requireRole, type DataResult } from './common';
import type { Database } from '@/lib/supabase/database.types';
import {
  asMetadataObject,
  firstJoined,
  latestMetadataByAction,
  resolveRevisionDisplay,
  resolveReviewState,
  type AuditRowBase,
  type ReviewState,
} from './audit-record';

export type TeacherSessionSummary = { id: string; title: string; messageCount: number; updatedLabel: string };
export type TeacherConversationInitial = { id: string; title: string; messages: UIMessage[] };
export type TeacherWorkspace = { presets: Database['public']['Tables']['prompt_presets']['Row'][]; teacherPresets: Database['public']['Tables']['prompt_presets']['Row'][]; providerBlocked?: string; sessions: TeacherSessionSummary[] };
export type TeacherAnalytics = {
  assignedClasses: number;
  auditWorkload: number;
  reviewedCount: number;
  weeklyAuditCoverage: { coveragePercent: number; audited: number; pending: number; eligible: number };
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

export type TeacherClassRule = {
  classId: string;
  className: string;
  /** 本人为这个班配置的、当前生效的归类规则（published）；无则 null。 */
  rule: string | null;
  /** 本人是否有草稿（未发布）。 */
  hasDraft: boolean;
  /** 同班其他任课教师已配置的规则条数（提示"本班已有 N 位老师配了规则"）。 */
  peerRuleCount: number;
  studentCount: number;
};

/**
 * 教师视角的"我的班级 + 我为各班配置的归类规则"。
 * 这是"把归类能力交给老师"的入口数据：教师在这里为每个班写自己学科的归类口径。
 *
 * 每师每班一条：只取**本人**的规则作为可编辑对象；同班其他教师的规则只计数，
 * 因为那是别人学科的口径，本人不该在这里改写。
 */
export async function getTeacherClassRules(): Promise<DataResult<TeacherClassRule[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();

  const { data: memberships, error } = await supabase
    .from('class_memberships')
    .select('class_id,classes(name)')
    .eq('profile_id', role.data.id)
    .eq('role', 'teacher');
  if (error) return fail('error', `任教班级加载失败：${error.message}`);

  const rows = (memberships ?? []) as Array<{ class_id: string; classes: { name: string | null } | Array<{ name: string | null }> | null }>;
  if (rows.length === 0) return ok([]);

  const classIds = rows.map((row) => row.class_id);
  const [presetsResult, studentsResult] = await Promise.all([
    supabase
      .from('prompt_presets')
      .select('class_id,status,system_instruction,created_by')
      .in('class_id', classIds)
      .eq('purpose', 'project_classification')
      .order('updated_at', { ascending: false }),
    supabase.from('class_memberships').select('class_id').in('class_id', classIds).eq('role', 'student'),
  ]);
  if (presetsResult.error) return fail('error', `归类规则加载失败：${presetsResult.error.message}`);
  if (studentsResult.error) return fail('error', `班级学生数加载失败：${studentsResult.error.message}`);

  // 本人的生效规则 / 本人草稿：只看 created_by = 自己。
  const ownRuleByClass = new Map<string, string>();
  const ownDraftClasses = new Set<string>();
  // 其他教师的生效规则数：按 (class, 作者) 去重计数。
  const peerRuleKeys = new Set<string>();
  const teacherId = role.data.id;
  for (const preset of (presetsResult.data ?? []) as Array<{ class_id: string | null; status: string; system_instruction: string; created_by: string | null }>) {
    if (!preset.class_id) continue;
    const isOwn = preset.created_by === teacherId;
    if (isOwn) {
      if (preset.status === 'published' && !ownRuleByClass.has(preset.class_id)) {
        ownRuleByClass.set(preset.class_id, preset.system_instruction);
      } else if (preset.status === 'draft') {
        ownDraftClasses.add(preset.class_id);
      }
    } else if (preset.status === 'published' && preset.created_by) {
      peerRuleKeys.add(`${preset.class_id}:${preset.created_by}`);
    }
  }

  const studentCountByClass = new Map<string, number>();
  for (const row of (studentsResult.data ?? []) as Array<{ class_id: string }>) {
    studentCountByClass.set(row.class_id, (studentCountByClass.get(row.class_id) ?? 0) + 1);
  }

  return ok(rows.map((row) => {
    const klass = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    return {
      classId: row.class_id,
      className: klass?.name?.trim() || '未命名班级',
      rule: ownRuleByClass.get(row.class_id) ?? null,
      hasDraft: ownDraftClasses.has(row.class_id),
      peerRuleCount: Array.from(peerRuleKeys).filter((key) => key.startsWith(`${row.class_id}:`)).length,
      studentCount: studentCountByClass.get(row.class_id) ?? 0,
    };
  }));
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

export type TeacherAuditQueueStatus = 'pending' | 'all';
export type TeacherAuditQueueOptions = { page?: number; pageSize?: number; status?: TeacherAuditQueueStatus };
export type TeacherAuditQueuePage = {
  records: AuditQueueRecord[];
  /** 当前筛选下的会话总数（不受分页影响）。 */
  total: number;
  /** 待核实会话总数（不受筛选/分页影响）。 */
  pendingTotal: number;
  page: number;
  pageSize: number;
  status: TeacherAuditQueueStatus;
};

/**
 * 教师学习记录核实队列。
 *
 * 第一性：队列的主体是**会话**，不是消息。此前按消息查询（limit 500）→ 在 JS 里推导
 * 会话状态 → 最后 slice(0,30)，而截断发生在推导之前：已核实的会话照样占满名额，
 * 未核实的被静默丢弃，界面还显示「暂无待审核」。核实是要担责的队列，不能丢数据。
 *
 * 现在：未核实过滤（finalized_at is null）在 SQL 完成，分页在 SQL 完成，计数精确。
 * 只有「详情」部分（逐条消息与预审疑点）才按当前页的会话 id 拉取。
 */
export async function getTeacherAuditQueue(options: TeacherAuditQueueOptions = {}): Promise<DataResult<TeacherAuditQueuePage>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;

  const classScope = await getTeacherClassIds(role.data.id);
  if (!classScope.ok) return fail('error', classScope.message);

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const status: TeacherAuditQueueStatus = options.status ?? 'pending';
  if (classScope.classIds.length === 0) return ok({ records: [], total: 0, pendingTotal: 0, page, pageSize, status });

  const supabase = await createClient();
  const countScoped = (pendingOnly: boolean) => {
    const query = supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .in('class_id', classScope.classIds)
      .eq('source', 'student_chat')
      .is('deleted_at', null)
      .not('project_id', 'is', null);
    return pendingOnly ? query.is('finalized_at', null) : query;
  };

  let queueQuery = supabase
    .from('conversations')
    .select('id,title,class_id,project_id,updated_at,finalized_at,profiles(display_name),text_projects(title),classes(name)', { count: 'exact' })
    .in('class_id', classScope.classIds)
    .eq('source', 'student_chat')
    .is('deleted_at', null)
    .not('project_id', 'is', null)
    .order('updated_at', { ascending: false });
  if (status === 'pending') queueQuery = queueQuery.is('finalized_at', null);

  const [queueResult, pendingResult, auditCap] = await Promise.all([
    queueQuery.range((page - 1) * pageSize, page * pageSize - 1),
    countScoped(true),
    getCapability('audit_assist'),
  ]);
  if (queueResult.error) return fail('error', `学习记录核实加载失败：${queueResult.error.message}`);
  if (pendingResult.error) return fail('error', `待核实数量统计失败：${pendingResult.error.message}`);

  type QueueConversationRow = {
    id: string;
    title: string | null;
    class_id: string | null;
    project_id: string | null;
    updated_at: string;
    finalized_at: string | null;
    profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null;
    text_projects: { title: string | null } | Array<{ title: string | null }> | null;
    classes: { name: string | null } | Array<{ name: string | null }> | null;
  };

  const conversationRows = (queueResult.data ?? []) as QueueConversationRow[];
  const total = queueResult.count ?? 0;
  const pendingTotal = pendingResult.count ?? 0;
  if (conversationRows.length === 0) return ok({ records: [], total, pendingTotal, page, pageSize, status });

  const conversationIds = conversationRows.map((row) => row.id);
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

  const records = conversationRows.flatMap((row) => {
    const rawTranscript = transcriptByConversation.get(row.id) ?? [];
    const assistantTranscript = rawTranscript.filter((item) => item.role === 'assistant');
    // 没有 AI 回答的会话不在核实范围内（无处可核），跳过而非占位。
    if (assistantTranscript.length === 0) return [];

    const latestAssistant = assistantTranscript[assistantTranscript.length - 1];
    const conversationAudits = auditsByConversation.get(row.id) ?? [];
    const assistantIds = new Set(assistantTranscript.map((item) => item.id));
    const assistantMessages = assistantTranscript.map((item) => ({ id: item.id, content: item.content }));
    const preReviewRow = latestMetadataByAction(conversationAudits, 'conversation_pre_review');
    const parsedPreReview = parsePreReview(preReviewRow, assistantMessages);
    const preReviewIssues = parsedPreReview.issues;
    const issuesByMessage = new Map<string, TeacherPreReviewIssue[]>();
    for (const issue of preReviewIssues) {
      const issues = issuesByMessage.get(issue.messageId) ?? [];
      issues.push(issue);
      issuesByMessage.set(issue.messageId, issues);
    }

    const assistantStates = assistantTranscript.map((item) => ({ id: item.id, reviewState: resolveReviewState(auditsByMessage.get(item.id)) }));
    const revisedAssistantCount = assistantStates.filter((item) => item.reviewState === 'revised').length;
    // 会话是否已核实，读列而不是扫 audit_records 的 JSON。
    const conversationFinalized = row.finalized_at !== null;
    const pendingAssistantCount = conversationFinalized ? 0 : assistantStates.length;
    const conversationReviewState: ReviewState = conversationFinalized
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

    const latestAssistantIndex = transcript.findIndex((item) => item.id === latestAssistant.id);
    const prompt = latestAssistantIndex <= 0
      ? '源问题未返回；请先核对完整对话再确认。'
      : [...transcript.slice(0, latestAssistantIndex)].reverse().find((item) => item.role === 'user')?.content ?? '源问题未返回；请先核对完整对话再确认。';
    const profile = firstJoined(row.profiles);
    const project = firstJoined(row.text_projects);
    const klass = firstJoined(row.classes);

    return [{
      id: row.id,
      conversationId: row.id,
      sourceMessageId: latestAssistant.id,
      prompt,
      answer: latestAssistant.content,
      classId: row.class_id,
      classLabel: klass?.name?.trim() || '未命名班级',
      studentName: profile?.display_name?.trim() || '未命名学生',
      projectTitle: project?.title?.trim() || '未关联篇目',
      sessionLabel: row.title?.trim() || `会话 ${row.id.slice(0, 8)}`,
      createdAt: latestAssistant.created_at,
      transcript,
      preReviewIssues,
      preReviewState,
      preReviewBlocked: preReviewState === 'blocked' ? auditBlocked : preReviewState === 'failed' ? String(preReviewMetadata.error ?? 'AI 预审失败，请手动重新发起。') : undefined,
      reviewState: conversationReviewState,
      conversationFinalized,
      finalizedAt: row.finalized_at ?? undefined,
      assistantCount: assistantStates.length,
      preReviewCoveredMessageCount,
      pendingAssistantCount,
      revisedAssistantCount,
      riskAssistantCount: new Set(preReviewIssues.map((issue) => issue.messageId)).size,
    } satisfies AuditQueueRecord];
  });
  // 不再在 JS 里重排：分页由 SQL 决定（updated_at desc），
  // 页内再按风险重排会让"第 1 页 / 第 2 页"的边界看起来是乱的。
  // 待核实过滤（finalized_at is null）已在 SQL 完成，风险排序留给后续需要时再下推到 SQL。

  return ok({ records, total, pendingTotal, page, pageSize, status });
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
    reviewedCount: reviewed.length,
    weeklyAuditCoverage: { coveragePercent, audited, pending, eligible },
  });
}
