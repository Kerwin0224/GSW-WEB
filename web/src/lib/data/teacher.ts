import type { UIMessage } from 'ai';
import { canonicalizeUiMessageParts } from '@/lib/chat-message-parts';
import { createClient } from '@/lib/supabase/server';
import { isPreReviewResultChecked, normalizePreReviewIssuesForMessage, type NormalizedPreReviewIssue } from '@/lib/teacher-pre-review';
import { fail, getCapability, ok, requireRole, type DataResult } from './common';
import { buildAuditQueueGroups, type AuditQueueEntry, type AuditQueueGroup, type AuditQueueSession, type PreReviewState } from '@/lib/audit-queue';
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
  /**
   * 这条消息落库时保存的 parts（正文 + 工具调用）。
   * 教师核实时要看「这个结论是查来的还是编的」，所以工具调用必须带出来，
   * 不能只给正文。已由 toPersistedAssistantParts 裁剪过（不含工具返回值）。
   */
  parts: unknown[];
};
type ReviewAuditRow = AuditRowBase & {
  source_message_id?: string | null;
  source_conversation_id?: string | null;
  rationale?: string | null;
};

/** 核实队列与详情共用的会话行：两者都要 班级/学生/项目 三处上级标签。 */
type QueueConversationRow = {
  id: string;
  title: string | null;
  class_id: string | null;
  project_id: string | null;
  updated_at: string;
  finalized_at: string | null;
  profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null;
  projects: { name: string | null } | Array<{ name: string | null }> | null;
  classes: { name: string | null } | Array<{ name: string | null }> | null;
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

// ─── 学习记录核实：列表与详情解耦 ────────────────────────────────────────────
//
// 第一性：核实队列的主体是**会话**，列表与详情是两种查询。
// 此前一条查询同时干两件事——为了渲染列表行，把整页会话的全部消息正文都取了回来，
// 客户端组件再拿着这些正文自己分组、自己统计。代价有三：
//   · 列表查询长成了详情查询（数据量与页面体积都随「一页有多少条会话」而非「打开哪一条」增长）
//   · 分组语义只活在视图里，没法单测
//   · 选中态只能存在客户端 state 里，于是看板点进来落不到具体会话
// 现在：列表只取导航需要的字段，详情按会话 id 单独取，选中态放进 URL。

export type TeacherAuditQueueStatus = 'pending' | 'all';
export type TeacherAuditQueueOptions = { page?: number; pageSize?: number; status?: TeacherAuditQueueStatus };
export type { PreReviewState, AuditQueueSession, AuditQueueGroup } from '@/lib/audit-queue';

export type TeacherAuditQueuePage = {
  groups: AuditQueueGroup[];
  /** 当前筛选下的会话总数（不受分页影响）。 */
  total: number;
  /** 待核实会话总数（不受筛选/分页影响）。 */
  pendingTotal: number;
  page: number;
  pageSize: number;
  status: TeacherAuditQueueStatus;
};

/** 单会话的完整核实视图：逐条消息、预审疑点、修订对照、提交状态。 */
export type AuditSessionDetail = {
  conversationId: string;
  classId: string | null;
  classLabel: string;
  studentName: string;
  projectName: string;
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

/**
 * 列表用的预审摘要：只读会话级预审事件里**已存好的**计数与标签，不拿正文复核。
 * 详情走 parsePreReview（对当前正文逐条校验 quote）——两者共用同一份 metadata 契约，
 * 但列表不需要为了一句「3 处疑点」把正文全拉回来。
 */
function summarizePreReview(row: ReviewAuditRow | undefined, assistantCount: number, blockedReason?: string) {
  const metadata = asMetadataObject(row?.metadata);
  const coveredMessageIds = new Set(parseStringArray(metadata.reviewed_message_ids));
  for (const messageId of parseStringArray(metadata.missing_message_ids)) coveredMessageIds.delete(messageId);

  const issueLabels: string[] = [];
  const issueKeys = new Set<string>();
  const riskMessageIds = new Set<string>();
  for (const issueValue of Array.isArray(metadata.issues) ? metadata.issues : []) {
    const issue = asMetadataObject(issueValue);
    const messageId = typeof issue.messageId === 'string' ? issue.messageId : typeof issue.message_id === 'string' ? issue.message_id : '';
    if (messageId) riskMessageIds.add(messageId);
    const label = typeof issue.label === 'string' ? issue.label.trim() : '';
    const key = `${messageId}\u0000${label}`;
    if (!label || issueKeys.has(key)) continue;
    issueKeys.add(key);
    if (issueLabels.length < 4) issueLabels.push(label);
  }

  const failed = metadata.review_status === 'failed' || metadata.status === 'failed' || typeof metadata.error === 'string';
  const preReviewState: PreReviewState = row
    ? failed ? 'failed' : coveredMessageIds.size >= assistantCount ? 'ready' : 'partial'
    : blockedReason ? 'blocked' : 'not_run';

  return {
    preReviewState,
    preReviewCoveredMessageCount: coveredMessageIds.size,
    issueCount: issueKeys.size,
    issueLabels,
    riskAssistantCount: riskMessageIds.size,
    preReviewBlocked: preReviewState === 'failed'
      ? String(metadata.error ?? 'AI 预审失败，请手动重新发起。')
      : preReviewState === 'blocked' ? blockedReason : undefined,
  };
}

/**
 * 学习记录核实队列（列表）。
 *
 * 列表查询只碰导航需要的字段：会话行、AI 回答条数、会话级预审事件。
 * 逐条消息与修订对照属于详情，由 getTeacherAuditSession 单独取。
 *
 * 分页与「未核实」过滤都在 SQL 完成，计数精确——此前在 JS 里推导 + slice(0,30)，
 * 截断早于推导，已核实的会话占坑把未核实的静默挤出去，界面还显示「暂无待审核」。
 */
export async function getTeacherAuditQueue(options: TeacherAuditQueueOptions = {}): Promise<DataResult<TeacherAuditQueuePage>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;

  const classScope = await getTeacherClassIds(role.data.id);
  if (!classScope.ok) return fail('error', classScope.message);

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const status: TeacherAuditQueueStatus = options.status ?? 'pending';
  const emptyPage = { groups: [], total: 0, pendingTotal: 0, page, pageSize, status };
  if (classScope.classIds.length === 0) return ok(emptyPage);

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
    .select('id,title,class_id,project_id,updated_at,finalized_at,profiles(display_name),projects(name),classes(name)', { count: 'exact' })
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

  const conversationRows = (queueResult.data ?? []) as QueueConversationRow[];
  const total = queueResult.count ?? 0;
  const pendingTotal = pendingResult.count ?? 0;
  if (conversationRows.length === 0) return ok({ ...emptyPage, total, pendingTotal });

  const conversationIds = conversationRows.map((row) => row.id);
  const [messageResult, preReviewResult] = await Promise.all([
    // 只要 id 与 role：列表只需要「这条会话有几条 AI 回答」。正文属于详情。
    supabase
      .from('conversation_messages')
      .select('id,conversation_id,role')
      .in('conversation_id', conversationIds)
      .eq('role', 'assistant'),
    // 会话级预审事件：每次运行一条，取最新的一条即可。
    supabase
      .from('audit_records')
      .select('source_conversation_id,kind,status,metadata,created_at')
      .in('source_conversation_id', conversationIds)
      .eq('kind', 'metadata')
      .eq('quality', 'pre_review')
      .in('status', ['approved', 'exported'])
      .order('created_at', { ascending: true }),
  ]);
  if (messageResult.error) return fail('error', `AI 回答数统计失败：${messageResult.error.message}`);
  if (preReviewResult.error) return fail('error', `AI 预审状态加载失败：${preReviewResult.error.message}`);

  const assistantCountByConversation = new Map<string, number>();
  for (const row of (messageResult.data ?? []) as Array<{ conversation_id: string }>) {
    assistantCountByConversation.set(row.conversation_id, (assistantCountByConversation.get(row.conversation_id) ?? 0) + 1);
  }

  // 查询按 created_at 升序，后写覆盖先写 → 每个会话留下最新一条预审事件。
  const latestPreReviewByConversation = new Map<string, ReviewAuditRow>();
  for (const row of (preReviewResult.data ?? []) as Array<ReviewAuditRow & { source_conversation_id: string | null }>) {
    if (row.source_conversation_id) latestPreReviewByConversation.set(row.source_conversation_id, row);
  }

  const auditBlocked = auditCap.ok && auditCap.data.ready ? undefined : auditCap.ok ? auditCap.data.blockedReason : auditCap.message;

  const entries: AuditQueueEntry[] = conversationRows.flatMap((row) => {
    const assistantCount = assistantCountByConversation.get(row.id) ?? 0;
    // 没有 AI 回答的会话不在核实范围内（无处可核），跳过而非占位。
    if (assistantCount === 0) return [];
    const summary = summarizePreReview(latestPreReviewByConversation.get(row.id), assistantCount, auditBlocked);
    return [{
      classId: row.class_id,
      classLabel: firstJoined(row.classes)?.name?.trim() || '未命名班级',
      studentName: firstJoined(row.profiles)?.display_name?.trim() || '未命名学生',
      projectName: firstJoined(row.projects)?.name?.trim() || '未关联项目',
      session: {
        conversationId: row.id,
        sessionLabel: row.title?.trim() || `会话 ${row.id.slice(0, 8)}`,
        updatedAt: row.updated_at,
        finalized: row.finalized_at !== null,
        assistantCount,
        ...summary,
      } satisfies AuditQueueSession,
    }];
  });

  return ok({ groups: buildAuditQueueGroups(entries), total, pendingTotal, page, pageSize, status });
}

/**
 * 单会话的完整核实视图。
 *
 * 与列表分开取的理由见文件头。会话 id 不在本人班级范围内一律返回 null
 * ——不区分「不存在」与「无权访问」，避免探测。
 */
export async function getTeacherAuditSession(conversationId: string): Promise<DataResult<AuditSessionDetail | null>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;

  const classScope = await getTeacherClassIds(role.data.id);
  if (!classScope.ok) return fail('error', classScope.message);
  if (classScope.classIds.length === 0) return ok(null);

  const supabase = await createClient();
  const { data: conversationRow, error: conversationError } = await supabase
    .from('conversations')
    .select('id,title,class_id,updated_at,finalized_at,profiles(display_name),projects(name),classes(name)')
    .eq('id', conversationId)
    .eq('source', 'student_chat')
    .is('deleted_at', null)
    .maybeSingle();
  if (conversationError) return fail('error', `会话加载失败：${conversationError.message}`);

  const row = conversationRow as QueueConversationRow | null;
  if (!row || !row.class_id || !classScope.classIds.includes(row.class_id)) return ok(null);

  const [transcriptResult, auditResult, auditCap] = await Promise.all([
    supabase
      .from('conversation_messages')
      .select('id,conversation_id,role,content,parts,created_at')
      .eq('conversation_id', row.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('audit_records')
      .select('source_message_id,source_conversation_id,kind,status,original_answer,corrected_answer,chosen_answer,rejected_answer,metadata,created_at,updated_at')
      .eq('source_conversation_id', row.id)
      .order('created_at', { ascending: true }),
    getCapability('audit_assist'),
  ]);
  if (transcriptResult.error) return fail('error', `会话记录加载失败：${transcriptResult.error.message}`);
  if (auditResult.error) return fail('error', `核实记录加载失败：${auditResult.error.message}`);

  const rawTranscript = (transcriptResult.data ?? []) as Array<{ id: string; conversation_id: string; role: TeacherAuditMessage['role']; content: string; parts: unknown; created_at: string }>;
  const assistantTranscript = rawTranscript.filter((item) => item.role === 'assistant');
  if (assistantTranscript.length === 0) return ok(null);

  const conversationAudits = (auditResult.data ?? []) as ReviewAuditRow[];
  const auditsByMessage = new Map<string, ReviewAuditRow[]>();
  for (const audit of conversationAudits) {
    if (!audit.source_message_id) continue;
    const rows = auditsByMessage.get(audit.source_message_id) ?? [];
    rows.push(audit);
    auditsByMessage.set(audit.source_message_id, rows);
  }

  const assistantMessages = assistantTranscript.map((item) => ({ id: item.id, content: item.content }));
  const assistantIds = new Set(assistantMessages.map((message) => message.id));
  const preReviewRow = latestMetadataByAction(conversationAudits, 'conversation_pre_review');
  const parsedPreReview = parsePreReview(preReviewRow, assistantMessages);
  const preReviewIssues = parsedPreReview.issues;

  const issuesByMessage = new Map<string, TeacherPreReviewIssue[]>();
  for (const issue of preReviewIssues) {
    const issues = issuesByMessage.get(issue.messageId) ?? [];
    issues.push(issue);
    issuesByMessage.set(issue.messageId, issues);
  }

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
      parts: Array.isArray(transcriptRow.parts) ? transcriptRow.parts : [],
    };
  });

  const revisedAssistantCount = assistantTranscript.filter((item) => resolveReviewState(auditsByMessage.get(item.id)) === 'revised').length;
  const conversationFinalized = row.finalized_at !== null;
  const preReviewMetadata = asMetadataObject(preReviewRow?.metadata);
  const preReviewFailed = preReviewMetadata.review_status === 'failed' || preReviewMetadata.status === 'failed' || typeof preReviewMetadata.error === 'string';
  const preReviewCoveredMessageCount = parsedPreReview.reviewedMessageIds.size;
  const auditBlocked = auditCap.ok && auditCap.data.ready ? undefined : auditCap.ok ? auditCap.data.blockedReason : auditCap.message;
  const preReviewState: PreReviewState = preReviewRow
    ? preReviewFailed ? 'failed' : preReviewCoveredMessageCount >= assistantIds.size ? 'ready' : 'partial'
    : auditBlocked ? 'blocked' : 'not_run';
  const latestAssistant = assistantTranscript[assistantTranscript.length - 1];

  return ok({
    conversationId: row.id,
    classId: row.class_id,
    classLabel: firstJoined(row.classes)?.name?.trim() || '未命名班级',
    studentName: firstJoined(row.profiles)?.display_name?.trim() || '未命名学生',
    projectName: firstJoined(row.projects)?.name?.trim() || '未关联项目',
    sessionLabel: row.title?.trim() || `会话 ${row.id.slice(0, 8)}`,
    createdAt: latestAssistant.created_at,
    transcript,
    preReviewIssues,
    preReviewState,
    preReviewBlocked: preReviewState === 'blocked' ? auditBlocked : preReviewState === 'failed' ? String(preReviewMetadata.error ?? 'AI 预审失败，请手动重新发起。') : undefined,
    reviewState: conversationFinalized ? (revisedAssistantCount > 0 ? 'revised' : 'confirmed') : 'pending',
    conversationFinalized,
    finalizedAt: row.finalized_at ?? undefined,
    assistantCount: assistantTranscript.length,
    preReviewCoveredMessageCount,
    pendingAssistantCount: conversationFinalized ? 0 : assistantTranscript.length,
    revisedAssistantCount,
    riskAssistantCount: new Set(preReviewIssues.map((issue) => issue.messageId)).size,
  });
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
