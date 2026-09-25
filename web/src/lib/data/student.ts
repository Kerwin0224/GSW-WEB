import 'server-only';

import type { UIMessage } from 'ai';

import { createClient } from '@/lib/supabase/server';
import { canonicalizeUiMessageParts, toSessionSummary, type ConversationMessageRow, type ConversationSummaryRow } from '@/lib/chat-message-parts';
import type { Database } from '@/lib/supabase/database.types';
import { fail, getCapabilities, ok, requireRole, type DataResult } from './common';
import { isStudentConversationFinalized } from './conversation-finalization';
import { BLOOM_LEVELS, toBloomLevel, type BloomLevel } from '@/lib/bloom-levels';

export type ProjectSessionSummary = { id: string; title: string; messageCount: number; updatedLabel: string; projectId?: string };
export type ProjectLevelSummary = { level: BloomLevel; pathQuestionCount: number; confirmedChallengeCount: number };
export type StudentConversationInitial = { id: string; title: string; projectId?: string; spaceId?: string; conversationFinalized: boolean; messages: UIMessage[] };
export type ProjectBloomMatrixRow = {
  id: string;
  name: string;
  confirmedLevel?: BloomLevel;
  statusLabel: string;
  levels: Array<{ level: BloomLevel; state: 'achieved' | 'current' | 'locked' }>;
};
export type ProjectChallengeProgress = {
  confirmedLevel?: BloomLevel;
  latestTargetLevel?: BloomLevel;
  attemptedCount: number;
  achievedCount: number;
  latestState?: 'pending' | 'evaluated' | 'failed' | 'blocked';
  completedLevels: number;
  currentLevel: BloomLevel;
  nextLevel: BloomLevel;
  statusLabel: string;
  isComplete: boolean;
  levels: Array<{ level: BloomLevel; state: 'achieved' | 'current' | 'locked' }>;
};
export type ProjectSummary = {
  id: string;
  name: string;
  subtitle?: string;
  questionCount: number;
  practiceCount: number;
  updatedLabel: string;
  sessions: ProjectSessionSummary[];
  levelSummary: ProjectLevelSummary[];
  challengeProgress: ProjectChallengeProgress;
};
export type DailyArchiveSummary = { sessions: ProjectSessionSummary[]; updatedLabel?: string };
export type StudentWorkspace = { providerBlocked?: string; projectClassificationBlocked?: string; bloomClassificationBlocked?: string; challengeBlocked?: string; dailyArchive: DailyArchiveSummary };
export type ProjectDetail = { project: Database['public']['Tables']['projects']['Row']; questions: Database['public']['Tables']['conversation_messages']['Row'][]; practices: Database['public']['Tables']['practice_records']['Row'][]; challengeProgress: ProjectChallengeProgress };

type PracticeSummaryRow = Pick<Database['public']['Tables']['practice_records']['Row'], 'target_bloom_level' | 'achieved' | 'evaluation_state'> & { created_at?: string };
type ConversationMessageWithBloomRow = ConversationMessageRow & Pick<Database['public']['Tables']['conversation_messages']['Row'], 'bloom_level' | 'bloom_state'>;

/**
 * 把数据库里的 bloom_level / bloom_state 注入到消息 parts 里，
 * 以便客户端 AIMessageList 在历史会话加载时也能正确渲染 BloomStatusBadge。
 * 只有用户消息才有布鲁姆认知路径；AI 回答消息直接走 toInitialMessage。
 */
function toInitialMessageWithBloom(message: ConversationMessageWithBloomRow): UIMessage {
  const base = canonicalizeUiMessageParts(message.content, message.parts);
  if (message.role !== 'user') return { id: message.id, role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user', parts: base };

  const bloomState = message.bloom_state;
  const bloomLevel = toBloomLevel(message.bloom_level);

  // 将布鲁姆路径状态作为 data part 追加到 parts 末尾，
  // 供客户端 applyBloomStatus 风格的逻辑在初始加载时直接读取。
  const bloomPart = bloomState === 'classified' && bloomLevel
    ? { type: 'data-student-bloom' as const, data: { messageId: message.id, state: 'classified' as const, level: bloomLevel } }
    : bloomState === 'pending'
      ? { type: 'data-student-bloom' as const, data: { messageId: message.id, state: 'pending' as const } }
      : bloomState === 'failed'
        ? { type: 'data-student-bloom' as const, data: { messageId: message.id, state: 'failed' as const } }
        : null;

  return {
    id: message.id,
    role: 'user',
    parts: bloomPart ? [...base, bloomPart] : base,
  };
}

function buildChallengeProgress(practices: PracticeSummaryRow[]): ProjectChallengeProgress {
  const latestPractice = practices[0];
  const achievedLevels = new Set(practices.filter((practice) => practice.achieved).map((practice) => practice.target_bloom_level));
  const consecutiveFailedAttempts = (() => {
    if (!latestPractice || latestPractice.evaluation_state !== 'evaluated' || latestPractice.achieved !== false) return 0;
    let count = 0;
    for (const practice of practices) {
      if (practice.target_bloom_level !== latestPractice.target_bloom_level) break;
      if (practice.evaluation_state === 'evaluated' && practice.achieved === false) {
        count += 1;
        continue;
      }
      break;
    }
    return count;
  })();
  // 取从 L1 开始连续通过的最高层级；跳层数据不计入确认结果，防御历史脏数据。
  let confirmedLevel: BloomLevel | undefined;
  for (let level = 1; level <= 6; level++) {
    if (achievedLevels.has(level)) confirmedLevel = level as BloomLevel;
    else break;
  }
  const completedLevels = confirmedLevel ?? 0;
  const isComplete = completedLevels >= 6;
  const nextLevel = (isComplete ? 6 : completedLevels + 1) as BloomLevel;
  const currentLevel = nextLevel;
  const statusLabel = (() => {
    if (isComplete) return '已完成全部六层挑战';
    if (!latestPractice) return '等待挑战';
    if (latestPractice.evaluation_state === 'pending') return `L${latestPractice.target_bloom_level} 待作答`;
    if (latestPractice.evaluation_state === 'blocked') return '挑战暂时被阻塞';
    if (latestPractice.evaluation_state === 'failed') return '挑战生成失败';
    if (latestPractice.evaluation_state === 'evaluated' && latestPractice.achieved) return `已确认 L${completedLevels}`;
    if (latestPractice.evaluation_state === 'evaluated' && latestPractice.achieved === false) return consecutiveFailedAttempts >= 2 ? '需要巩固' : '待巩固';
    return '继续挑战';
  })();

  return {
    confirmedLevel,
    latestTargetLevel: toBloomLevel(latestPractice?.target_bloom_level),
    attemptedCount: practices.length,
    achievedCount: practices.filter((practice) => practice.achieved).length,
    latestState: latestPractice?.evaluation_state,
    completedLevels,
    currentLevel,
    nextLevel,
    statusLabel,
    isComplete,
    levels: BLOOM_LEVELS.map((level) => ({
      level,
      state: achievedLevels.has(level) ? 'achieved' : level === currentLevel && !isComplete ? 'current' : 'locked',
    })),
  };
}

export async function getStudentWorkspace(): Promise<DataResult<StudentWorkspace>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const caps = await getCapabilities(['student_chat', 'bloom_classification', 'project_classification', 'practice_generation', 'practice_evaluation']);
  const bloomClassificationBlocked = caps.bloom_classification.ready ? undefined : caps.bloom_classification.blockedReason ?? '缺少 bloom_classification 真实模型能力配置。';
  const projectClassificationBlocked = caps.project_classification.ready ? undefined : caps.project_classification.blockedReason ?? '缺少 project_classification 真实模型能力配置。';

  const supabase = await createClient();
  const { data: archiveConversations, error: archiveError } = await supabase
    .from('conversations')
    .select('id,title,updated_at,project_id,conversation_messages(id)')
    .eq('owner_id', role.data.id)
    .eq('source', 'student_chat')
    .is('project_id', null)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(8);
  if (archiveError) return fail('error', `日常会话归档加载失败：${archiveError.message}`);

  return ok({
    providerBlocked: caps.student_chat.ready ? undefined : caps.student_chat.blockedReason,
    projectClassificationBlocked,
    bloomClassificationBlocked,
    challengeBlocked: caps.practice_generation.ready && caps.practice_evaluation.ready ? undefined : '挑战生成或挑战确认能力尚未就绪。',
    dailyArchive: {
      sessions: (archiveConversations ?? []).map((conversation) => toSessionSummary(conversation as ConversationSummaryRow)),
      updatedLabel: archiveConversations?.[0]?.updated_at ? new Date(archiveConversations[0].updated_at).toLocaleString('zh-CN') : undefined,
    },
  });
}

export async function getStudentProjects(options: { page?: number; pageSize?: number } = {}): Promise<DataResult<ProjectSummary[]>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();

  // 分页为可选：不传 pageSize 时保持全量（供需要完整项目树的调用方，如提问侧边栏）。
  const paginated = typeof options.pageSize === 'number';
  const pageSize = Math.max(1, options.pageSize ?? 0);
  const page = Math.max(1, options.page ?? 1);

  // 单次查询：通过嵌套 select 拉取项目 + 关联会话 + 挑战记录，
  // 消除原来 N 个项目 × 4 次查询的 N+1 问题。
  const projectsQuery = supabase
    .from('projects')
    .select(`
      *,
      conversations!conversations_project_id_fkey(id,title,updated_at,project_id,deleted_at,conversation_messages(id)),
      practice_records(target_bloom_level,achieved,evaluation_state,created_at)
    `)
    .eq('owner_id', role.data.id)
    .order('updated_at', { ascending: false });

  const { data: projects, error } = paginated
    ? await projectsQuery.range((page - 1) * pageSize, page * pageSize - 1)
    : await projectsQuery;
  if (error) return fail('error', `项目加载失败：${error.message}`);

  type MessageRow = { id: string; bloom_level: number | null; bloom_state: string; conversations: { project_id: string | null; deleted_at: string | null } | { project_id: string | null; deleted_at: string | null }[] };

  // 用户消息统计按当前页的项目收窄：分页的意义就是不再全量拉取，
  // 顺带把原来"拉学生所有项目全部用户消息"的最大开销一起砍掉。
  const pageProjectIds = ((projects ?? []) as unknown as Array<{ id: string }>).map((project) => project.id);
  const messagesByProject = new Map<string, MessageRow[]>();
  if (pageProjectIds.length > 0) {
    const { data: pageUserMessages, error: messagesError } = await supabase
      .from('conversation_messages')
      .select('id,bloom_level,bloom_state,conversations!inner(project_id,deleted_at)')
      .eq('conversations.owner_id', role.data.id)
      .is('conversations.deleted_at', null)
      .eq('role', 'user')
      .in('conversations.project_id', pageProjectIds);
    if (messagesError) return fail('error', `项目问题统计失败：${messagesError.message}`);

    for (const msg of (pageUserMessages ?? []) as MessageRow[]) {
      const conv = Array.isArray(msg.conversations) ? msg.conversations[0] : msg.conversations;
      const pid = conv?.project_id;
      if (!pid) continue;
      const list = messagesByProject.get(pid) ?? [];
      list.push(msg);
      messagesByProject.set(pid, list);
    }
  }

  type ProjectRow = Database['public']['Tables']['projects']['Row'] & {
    conversations: Array<ConversationSummaryRow & { deleted_at: string | null }>;
    practice_records: PracticeSummaryRow[];
  };

  const summaries = (projects ?? []).map((raw) => {
    const project = raw as unknown as ProjectRow;
    // 过滤已删除会话，取最近 5 条
    const activeConversations = (project.conversations ?? [])
      .filter((c) => c.deleted_at === null)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5);
    const practices = (project.practice_records ?? [])
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

    const projectMessages = messagesByProject.get(project.id) ?? [];
    const questionCount = projectMessages.length;
    const pathRows = projectMessages.filter((m) => m.bloom_state === 'classified');

    const levelSummary = BLOOM_LEVELS.map((level) => ({
      level: level as BloomLevel,
      pathQuestionCount: pathRows.filter((row) => row.bloom_level === level).length,
      confirmedChallengeCount: practices.filter((practice) => practice.target_bloom_level === level && practice.achieved).length,
    }));
    const sessions = activeConversations.map((conversation) => toSessionSummary(conversation as ConversationSummaryRow));
    const challengeProgress = buildChallengeProgress(practices);

    return {
      id: project.id,
      name: project.name,
      subtitle: project.subtitle ?? undefined,
      questionCount,
      practiceCount: practices.length,
      updatedLabel: new Date(project.updated_at).toLocaleString('zh-CN'),
      sessions,
      levelSummary,
      challengeProgress,
    };
  });

  return ok(summaries);
}


/**
 * 挑战入口的项目列表。与 getStudentProjects 的关键区别：不拉会话与消息正文，
 * 只取挑战进度所需的三张表的窄列。挑战页要的是"哪些项目能挑战、挑战到什么程度"，
 * 之前复用了学习记录页那套带嵌套会话的重量查询，属于口径错配。
 */
export type ChallengeProjectSummary = Pick<ProjectSummary, 'id' | 'name' | 'subtitle' | 'questionCount' | 'challengeProgress'>;

export async function getStudentChallengeProjects(): Promise<DataResult<ChallengeProjectSummary[]>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();

  const [{ data: projects, error }, { data: practices, error: practiceError }, { data: messages, error: messageError }] = await Promise.all([
    supabase.from('projects').select('id,name,subtitle,updated_at').eq('owner_id', role.data.id).order('updated_at', { ascending: false }),
    supabase.from('practice_records').select('project_id,target_bloom_level,achieved,evaluation_state,created_at').eq('student_id', role.data.id),
    supabase
      .from('conversation_messages')
      .select('id,conversations!inner(project_id,owner_id,deleted_at)')
      .eq('conversations.owner_id', role.data.id)
      .is('conversations.deleted_at', null)
      .eq('role', 'user')
      .not('conversations.project_id', 'is', null),
  ]);
  if (error) return fail('error', `项目加载失败：${error.message}`);
  if (practiceError) return fail('error', `挑战记录加载失败：${practiceError.message}`);
  if (messageError) return fail('error', `提问统计失败：${messageError.message}`);

  const practicesByProject = new Map<string, PracticeSummaryRow[]>();
  for (const practice of (practices ?? []) as Array<PracticeSummaryRow & { project_id: string }>) {
    const list = practicesByProject.get(practice.project_id) ?? [];
    list.push(practice);
    practicesByProject.set(practice.project_id, list);
  }

  const questionCountByProject = new Map<string, number>();
  for (const message of (messages ?? []) as Array<{ conversations: { project_id: string | null } | Array<{ project_id: string | null }> }>) {
    const conv = Array.isArray(message.conversations) ? message.conversations[0] : message.conversations;
    if (!conv?.project_id) continue;
    questionCountByProject.set(conv.project_id, (questionCountByProject.get(conv.project_id) ?? 0) + 1);
  }

  return ok(((projects ?? []) as Array<{ id: string; name: string; subtitle: string | null }>).map((project) => ({
    id: project.id,
    name: project.name,
    subtitle: project.subtitle ?? undefined,
    questionCount: questionCountByProject.get(project.id) ?? 0,
    challengeProgress: buildChallengeProgress(
      (practicesByProject.get(project.id) ?? []).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    ),
  })));
}

export async function getStudentConversation(conversationId: string): Promise<DataResult<StudentConversationInitial | null>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id,title,project_id,space_id')
    .eq('id', conversationId)
    .eq('owner_id', role.data.id)
    .eq('source', 'student_chat')
    .is('deleted_at', null)
    .maybeSingle();
  if (conversationError) return fail('error', `会话加载失败：${conversationError.message}`);
  if (!conversation) return ok(null);

  try {
    const [messagesResult, conversationFinalized] = await Promise.all([
      supabase
        .from('conversation_messages')
        .select('id,role,content,parts,bloom_level,bloom_state')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true }),
      isStudentConversationFinalized(supabase, conversation.id),
    ]);
    const { data: messages, error: messagesError } = messagesResult;
    if (messagesError) return fail('error', `会话记录加载失败：${messagesError.message}`);
    return ok({
      id: conversation.id,
      title: conversation.title ?? '未命名会话',
      spaceId: conversation.space_id ?? undefined,
      projectId: conversation.project_id ?? undefined,
      conversationFinalized,
      messages: (messages ?? []).map((message) => toInitialMessageWithBloom(message as ConversationMessageWithBloomRow)),
    });
  } catch (error) {
    return fail('error', error instanceof Error ? error.message : '教师核实状态检查失败');
  }
}

export async function getStudentProject(projectId: string): Promise<DataResult<ProjectDetail | null>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data: project, error } = await supabase.from('projects').select('*').eq('id', projectId).eq('owner_id', role.data.id).maybeSingle();
  if (error) return fail('error', `项目详情加载失败：${error.message}`);
  if (!project) return ok(null);
  const [{ data: questions, error: qError }, { data: practices, error: pError }] = await Promise.all([
    supabase.from('conversation_messages').select('*, conversations!inner(project_id,deleted_at)').eq('conversations.project_id', project.id).is('conversations.deleted_at', null).eq('role', 'user').eq('bloom_state', 'classified').order('created_at', { ascending: false }),
    supabase.from('practice_records').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
  ]);
  if (qError) return fail('error', `问题记录加载失败：${qError.message}`);
  if (pError) return fail('error', `挑战记录加载失败：${pError.message}`);
  const challengeProgress = buildChallengeProgress(practices ?? []);
  return ok({ project, questions: (questions ?? []) as Database['public']['Tables']['conversation_messages']['Row'][], practices: practices ?? [], challengeProgress });
}

/**
 * 学习记录页的聚合统计。刻意不经过 getStudentProjects：
 * 分页之后项目列表只覆盖当前页，而页顶指标与层级分布是"全部项目"口径，
 * 必须来自独立聚合查询。这三条查询都只取窄列/计数，不拉会话与消息正文。
 */
export async function getStudentProjectStats(): Promise<DataResult<{
  projectCount: number;
  questionCount: number;
  challengeCount: number;
  awaitingChallengeCount: number;
  distribution: Array<{ level: number; count: number }>;
}>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();

  const [projectsResult, questionsResult, practicesResult] = await Promise.all([
    // highest_bloom_level 由 practice_records 触发器维护，读它即可得到"已通过最高层级"。
    supabase.from('projects').select('highest_bloom_level').eq('owner_id', role.data.id),
    supabase
      .from('conversation_messages')
      .select('id, conversations!inner(owner_id,project_id,deleted_at)', { count: 'exact', head: true })
      .eq('conversations.owner_id', role.data.id)
      .is('conversations.deleted_at', null)
      .eq('role', 'user')
      .not('conversations.project_id', 'is', null),
    supabase.from('practice_records').select('id', { count: 'exact', head: true }).eq('student_id', role.data.id),
  ]);
  if (projectsResult.error) return fail('error', `项目统计失败：${projectsResult.error.message}`);
  if (questionsResult.error) return fail('error', `提问统计失败：${questionsResult.error.message}`);
  if (practicesResult.error) return fail('error', `挑战统计失败：${practicesResult.error.message}`);

  const projectRows = (projectsResult.data ?? []) as Array<{ highest_bloom_level: number | null }>;
  return ok({
    projectCount: projectRows.length,
    questionCount: questionsResult.count ?? 0,
    challengeCount: practicesResult.count ?? 0,
    awaitingChallengeCount: projectRows.filter((row) => row.highest_bloom_level === null).length,
    distribution: BLOOM_LEVELS.map((level) => ({
      level,
      count: projectRows.filter((row) => row.highest_bloom_level === level).length,
    })),
  });
}

export async function getStudentProfileSummary(options: { page?: number; pageSize?: number } = {}): Promise<DataResult<{
  distribution: Array<{ level: number; count: number }>;
  projectBloomMatrix: ProjectBloomMatrixRow[];
  projects: ProjectSummary[];
  totalProjects: number;
  questionCount: number;
  challengeCount: number;
  awaitingChallengeCount: number;
}>> {
  const [projects, stats] = await Promise.all([getStudentProjects(options), getStudentProjectStats()]);
  if (!projects.ok) return projects;
  if (!stats.ok) return stats;
  const projectBloomMatrix: ProjectBloomMatrixRow[] = projects.data.map((project) => ({
    id: project.id,
    name: project.name,
    confirmedLevel: project.challengeProgress.confirmedLevel,
    statusLabel: project.challengeProgress.statusLabel,
    levels: project.challengeProgress.levels,
  }));
  return ok({
    distribution: stats.data.distribution,
    projectBloomMatrix,
    projects: projects.data,
    totalProjects: stats.data.projectCount,
    questionCount: stats.data.questionCount,
    challengeCount: stats.data.challengeCount,
    awaitingChallengeCount: stats.data.awaitingChallengeCount,
  });
}
