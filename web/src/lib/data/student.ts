import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { fail, getCapabilities, ok, requireRole, type DataResult } from './common';
import type { BloomLevel } from '@/components/workbench/bloom-badge';

export type ProjectSessionSummary = { id: string; title: string; messageCount: number; updatedLabel: string };
export type ProjectLevelSummary = { level: BloomLevel; questionCount: number; achievedChallengeCount: number };
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
  highestLevel?: BloomLevel;
  questionCount: number;
  practiceCount: number;
  updatedLabel: string;
  sessions: ProjectSessionSummary[];
  levelSummary: ProjectLevelSummary[];
  challengeProgress: ProjectChallengeProgress;
};
export type DailyArchiveSummary = { sessions: ProjectSessionSummary[]; updatedLabel?: string };
export type StudentWorkspace = { providerBlocked?: string; classificationBlocked?: string; challengeBlocked?: string; dailyArchive: DailyArchiveSummary };
export type ProjectDetail = { project: Database['public']['Tables']['text_projects']['Row']; questions: Database['public']['Tables']['conversation_messages']['Row'][]; practices: Database['public']['Tables']['practice_records']['Row'][]; challengeProgress: ProjectChallengeProgress };

type PracticeSummaryRow = Pick<Database['public']['Tables']['practice_records']['Row'], 'target_bloom_level' | 'achieved' | 'evaluation_state'> & { created_at?: string };
type ConversationSummaryRow = {
  id: string;
  title: string | null;
  updated_at: string;
  conversation_messages?: Array<{ id: string }> | null;
};

function toBloomLevel(value: number | null | undefined): BloomLevel | undefined {
  return value && value >= 1 && value <= 6 ? (value as BloomLevel) : undefined;
}

function toSessionSummary(conversation: ConversationSummaryRow): ProjectSessionSummary {
  return {
    id: conversation.id,
    title: conversation.title ?? '未命名会话',
    messageCount: Array.isArray(conversation.conversation_messages) ? conversation.conversation_messages.length : 0,
    updatedLabel: new Date(conversation.updated_at).toLocaleString('zh-CN'),
  };
}

function buildChallengeProgress(practices: PracticeSummaryRow[]): ProjectChallengeProgress {
  const latestPractice = practices[0];
  const achievedLevels = new Set(practices.filter((practice) => practice.achieved).map((practice) => practice.target_bloom_level));
  const completedLevels = Math.min(achievedLevels.size, 6);
  const confirmedLevel = completedLevels > 0 ? (completedLevels as BloomLevel) : undefined;
  const isComplete = completedLevels >= 6;
  const nextLevel = (isComplete ? 6 : completedLevels + 1) as BloomLevel;
  const currentLevel = nextLevel;
  const statusLabel = (() => {
    if (isComplete) return '已完成六层挑战';
    if (!latestPractice) return '等待挑战确认';
    if (latestPractice.evaluation_state === 'pending') return `L${latestPractice.target_bloom_level} 待作答`;
    if (latestPractice.evaluation_state === 'blocked') return '挑战暂时被阻塞';
    if (latestPractice.evaluation_state === 'failed') return '挑战生成失败';
    if (latestPractice.evaluation_state === 'evaluated' && latestPractice.achieved) return `已确认 L${completedLevels}`;
    if (latestPractice.evaluation_state === 'evaluated' && latestPractice.achieved === false) return completedLevels > 0 ? '待巩固' : '继续挑战';
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
  const classificationBlocked = [caps.bloom_classification, caps.project_classification]
    .filter((capability) => !capability.ready)
    .map((capability) => capability.blockedReason ?? `缺少 ${capability.capability} 真实模型能力配置。`)
    .join('；') || undefined;

  const supabase = await createClient();
  const { data: archiveConversations, error: archiveError } = await supabase
    .from('conversations')
    .select('id,title,updated_at,conversation_messages(id)')
    .eq('owner_id', role.data.id)
    .eq('source', 'student_chat')
    .is('project_id', null)
    .order('updated_at', { ascending: false })
    .limit(8);
  if (archiveError) return fail('error', `日常会话归档加载失败：${archiveError.message}`);

  return ok({
    providerBlocked: caps.student_chat.ready ? undefined : caps.student_chat.blockedReason,
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
  const { data: projects, error } = await supabase.from('text_projects').select('*').eq('owner_id', role.data.id).order('updated_at', { ascending: false });
  if (error) return fail('error', `项目加载失败：${error.message}`);

  const summaries = await Promise.all((projects ?? []).map(async (project) => {
    const [{ data: conversations, error: conversationError }, { data: levelRows, error: levelError }, { data: practices, error: practiceError }] = await Promise.all([
      supabase.from('conversations').select('id,title,updated_at,conversation_messages(id)').eq('project_id', project.id).order('updated_at', { ascending: false }).limit(5),
      supabase.from('conversation_messages').select('bloom_level, conversations!inner(project_id)').eq('conversations.project_id', project.id).eq('role', 'user').eq('bloom_state', 'classified'),
      supabase.from('practice_records').select('target_bloom_level,achieved,evaluation_state,created_at').eq('project_id', project.id).order('created_at', { ascending: false }),
    ]);
    if (conversationError) throw new Error(`会话统计失败：${conversationError.message}`);
    if (levelError) throw new Error(`布鲁姆统计失败：${levelError.message}`);
    if (practiceError) throw new Error(`挑战统计失败：${practiceError.message}`);

    const levelSummary = [1, 2, 3, 4, 5, 6].map((level) => ({
      level: level as BloomLevel,
      questionCount: (levelRows ?? []).filter((row) => row.bloom_level === level).length,
      achievedChallengeCount: (practices ?? []).filter((practice) => practice.target_bloom_level === level && practice.achieved).length,
    }));
    const questionCount = (levelRows ?? []).length;
    const sessions = (conversations ?? []).map((conversation) => toSessionSummary(conversation as ConversationSummaryRow));
    const challengeProgress = buildChallengeProgress(practices ?? []);

    return {
      id: project.id,
      title: project.title,
      author: project.author ?? undefined,
      highestLevel: toBloomLevel(project.highest_bloom_level),
      questionCount,
      practiceCount: practices?.length ?? 0,
      updatedLabel: new Date(project.updated_at).toLocaleString('zh-CN'),
      sessions,
      levelSummary,
      challengeProgress,
    };
  }));

  return ok(summaries);
}

export async function getStudentProject(projectId: string): Promise<DataResult<ProjectDetail | null>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data: project, error } = await supabase.from('text_projects').select('*').eq('id', projectId).eq('owner_id', role.data.id).maybeSingle();
  if (error) return fail('error', `篇目详情加载失败：${error.message}`);
  if (!project) return ok(null);
  const [{ data: questions, error: qError }, { data: practices, error: pError }] = await Promise.all([
    supabase.from('conversation_messages').select('*, conversations!inner(project_id)').eq('conversations.project_id', project.id).eq('role', 'user').eq('bloom_state', 'classified').order('created_at', { ascending: false }),
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
  const awaitingChallengeCount = projects.data.filter((project) => !project.challengeProgress.confirmedLevel).length;
  return ok({ distribution, projects: projects.data, awaitingChallengeCount });
}
