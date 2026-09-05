import 'server-only';

import type { UIMessage } from 'ai';

import { createClient } from '@/lib/supabase/server';
import { canonicalizeUiMessageParts } from '@/lib/chat-message-parts';
import type { Database } from '@/lib/supabase/database.types';
import { fail, getCapabilities, ok, requireRole, type DataResult } from './common';
import { isStudentConversationFinalized } from './conversation-finalization';
import type { BloomLevel } from '@/lib/challenge-progression';

export type ProjectSessionSummary = { id: string; title: string; messageCount: number; updatedLabel: string; projectId?: string };
export type ProjectLevelSummary = { level: BloomLevel; pathQuestionCount: number; confirmedChallengeCount: number };
export type StudentConversationInitial = { id: string; title: string; projectId?: string; conversationFinalized: boolean; messages: UIMessage[] };
export type ProjectBloomMatrixRow = {
  id: string;
  title: string;
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
  title: string;
  author?: string;
  questionCount: number;
  practiceCount: number;
  updatedLabel: string;
  sessions: ProjectSessionSummary[];
  levelSummary: ProjectLevelSummary[];
  challengeProgress: ProjectChallengeProgress;
};
export type DailyArchiveSummary = { sessions: ProjectSessionSummary[]; updatedLabel?: string };
export type StudentWorkspace = { providerBlocked?: string; projectClassificationBlocked?: string; bloomClassificationBlocked?: string; classificationBlocked?: string; challengeBlocked?: string; dailyArchive: DailyArchiveSummary };
export type ProjectDetail = { project: Database['public']['Tables']['text_projects']['Row']; questions: Database['public']['Tables']['conversation_messages']['Row'][]; practices: Database['public']['Tables']['practice_records']['Row'][]; challengeProgress: ProjectChallengeProgress };

type PracticeSummaryRow = Pick<Database['public']['Tables']['practice_records']['Row'], 'target_bloom_level' | 'achieved' | 'evaluation_state'> & { created_at?: string };
type ConversationSummaryRow = {
  id: string;
  title: string | null;
  updated_at: string;
  project_id?: string | null;
  conversation_messages?: Array<{ id: string }> | null;
};
type ConversationMessageRow = Pick<Database['public']['Tables']['conversation_messages']['Row'], 'id' | 'role' | 'content' | 'parts'>;
type ConversationMessageWithBloomRow = ConversationMessageRow & Pick<Database['public']['Tables']['conversation_messages']['Row'], 'bloom_level' | 'bloom_state'>;

function toBloomLevel(value: number | null | undefined): BloomLevel | undefined {
  return value && value >= 1 && value <= 6 ? (value as BloomLevel) : undefined;
}

function toSessionSummary(conversation: ConversationSummaryRow): ProjectSessionSummary {
  return {
    id: conversation.id,
    title: conversation.title ?? '未命名会话',
    messageCount: Array.isArray(conversation.conversation_messages) ? conversation.conversation_messages.length : 0,
    updatedLabel: new Date(conversation.updated_at).toLocaleString('zh-CN'),
    projectId: conversation.project_id ?? undefined,
  };
}

function toInitialMessage(message: ConversationMessageRow): UIMessage {
  return {
    id: message.id,
    role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
    parts: canonicalizeUiMessageParts(message.content, message.parts),
  };
}

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
    levels: ([1, 2, 3, 4, 5, 6] as BloomLevel[]).map((level) => ({
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
  const classificationBlocked = [bloomClassificationBlocked, projectClassificationBlocked].filter(Boolean).join('；') || undefined;

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
    classificationBlocked,
    challengeBlocked: caps.practice_generation.ready && caps.practice_evaluation.ready ? undefined : '挑战生成或挑战确认能力尚未就绪。',
    dailyArchive: {
      sessions: (archiveConversations ?? []).map((conversation) => toSessionSummary(conversation as ConversationSummaryRow)),
      updatedLabel: archiveConversations?.[0]?.updated_at ? new Date(archiveConversations[0].updated_at).toLocaleString('zh-CN') : undefined,
    },
  });
}

export async function getStudentProjects(): Promise<DataResult<ProjectSummary[]>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();

  // 单次查询：通过嵌套 select 拉取项目 + 关联会话 + 挑战记录，
  // 消除原来 N 个项目 × 4 次查询的 N+1 问题。
  const [{ data: projects, error }, { data: allUserMessages, error: messagesError }] = await Promise.all([
    supabase
      .from('text_projects')
      .select(`
        *,
        conversations!conversations_project_id_fkey(id,title,updated_at,project_id,deleted_at,conversation_messages(id)),
        practice_records(target_bloom_level,achieved,evaluation_state,created_at)
      `)
      .eq('owner_id', role.data.id)
      .order('updated_at', { ascending: false }),
    // 学生所有未删除会话中的用户消息（用于问题计数和布鲁姆路径统计）
    supabase
      .from('conversation_messages')
      .select('id,bloom_level,bloom_state,conversations!inner(project_id,deleted_at)')
      .eq('conversations.owner_id', role.data.id)
      .is('conversations.deleted_at', null)
      .eq('role', 'user')
      .not('conversations.project_id', 'is', null),
  ]);
  if (error) return fail('error', `项目加载失败：${error.message}`);
  if (messagesError) return fail('error', `项目问题统计失败：${messagesError.message}`);

  // 按 project_id 分组用户消息
  type MessageRow = { id: string; bloom_level: number | null; bloom_state: string; conversations: { project_id: string | null; deleted_at: string | null } | { project_id: string | null; deleted_at: string | null }[] };
  const messagesByProject = new Map<string, MessageRow[]>();
  for (const msg of (allUserMessages ?? []) as MessageRow[]) {
    const conv = Array.isArray(msg.conversations) ? msg.conversations[0] : msg.conversations;
    const pid = conv?.project_id;
    if (!pid) continue;
    const list = messagesByProject.get(pid) ?? [];
    list.push(msg);
    messagesByProject.set(pid, list);
  }

  type ProjectRow = Database['public']['Tables']['text_projects']['Row'] & {
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

    const levelSummary = [1, 2, 3, 4, 5, 6].map((level) => ({
      level: level as BloomLevel,
      pathQuestionCount: pathRows.filter((row) => row.bloom_level === level).length,
      confirmedChallengeCount: practices.filter((practice) => practice.target_bloom_level === level && practice.achieved).length,
    }));
    const sessions = activeConversations.map((conversation) => toSessionSummary(conversation as ConversationSummaryRow));
    const challengeProgress = buildChallengeProgress(practices);

    return {
      id: project.id,
      title: project.title,
      author: project.author ?? undefined,
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


export async function getStudentConversation(conversationId: string): Promise<DataResult<StudentConversationInitial | null>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id,title,project_id')
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
  const { data: project, error } = await supabase.from('text_projects').select('*').eq('id', projectId).eq('owner_id', role.data.id).maybeSingle();
  if (error) return fail('error', `篇目详情加载失败：${error.message}`);
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

export async function getStudentProfileSummary() {
  const projects = await getStudentProjects();
  if (!projects.ok) return projects;
  const distribution = [1, 2, 3, 4, 5, 6].map((level) => ({
    level,
    count: projects.data.filter((project) => project.challengeProgress.confirmedLevel === level).length,
  }));
  const projectBloomMatrix: ProjectBloomMatrixRow[] = projects.data.map((project) => ({
    id: project.id,
    title: project.title,
    confirmedLevel: project.challengeProgress.confirmedLevel,
    statusLabel: project.challengeProgress.statusLabel,
    levels: project.challengeProgress.levels,
  }));
  const awaitingChallengeCount = projects.data.filter((project) => !project.challengeProgress.confirmedLevel).length;
  return ok({ distribution, projectBloomMatrix, projects: projects.data, awaitingChallengeCount });
}
