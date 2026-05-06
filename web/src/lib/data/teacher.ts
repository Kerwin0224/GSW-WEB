import { createGateway, generateObject, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fail, getCapability, ok, requireRole, resolveEnvSecret, type CapabilityStatus, type DataResult } from './common';
import type { Database } from '@/lib/supabase/database.types';

export type TeacherWorkspace = { presets: Database['public']['Tables']['prompt_presets']['Row'][]; teacherPresets: Database['public']['Tables']['prompt_presets']['Row'][]; providerBlocked?: string };
export type TeacherAuditMessage = { id: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; createdAt: string; isSource: boolean };
export type TeacherPreReviewIssue = { quote: string; label: string; severity: 'low' | 'medium' | 'high' };
export type ReviewState = 'pending' | 'confirmed' | 'revised';
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
  preReviewBlocked?: string;
  reviewState: ReviewState;
};

type ConversationJoin = {
  class_id: string | null;
  project_id: string | null;
  source: string;
  title?: string | null;
  profiles?: { display_name?: string | null } | Array<{ display_name?: string | null }>;
  text_projects?: { title?: string | null } | Array<{ title?: string | null }>;
  classes?: { name?: string | null } | Array<{ name?: string | null }>;
};

type ReviewAuditRow = {
  kind?: string | null;
  status?: string | null;
  corrected_answer?: string | null;
  chosen_answer?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CandidateRow = {
  id: string;
  conversation_id: string;
  content: string;
  created_at: string;
  audit_records?: ReviewAuditRow[];
  conversations?: ConversationJoin | ConversationJoin[];
};

function resolveLanguageModel(capability: CapabilityStatus): LanguageModel | null {
  if (!capability.modelId) return null;
  const apiKey = resolveEnvSecret(capability.secretRef);
  if (!apiKey) return null;
  if (capability.providerType === 'gateway') return createGateway({ apiKey, baseURL: capability.baseUrl ?? process.env.AI_GATEWAY_BASE_URL })(capability.modelId);
  return createOpenAI({ apiKey, baseURL: capability.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined })(capability.modelId);
}

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function reviewTimestamp(row: ReviewAuditRow) {
  return row.updated_at ?? row.created_at ?? '';
}

function resolveReviewState(audits: ReviewAuditRow[] | undefined): ReviewState {
  const reviewed = (audits ?? []).filter((audit) => audit.status === 'approved' || audit.status === 'exported');
  if (reviewed.length === 0) return 'pending';

  const latestReviewed = [...reviewed].sort((left, right) => reviewTimestamp(right).localeCompare(reviewTimestamp(left)))[0];
  if (!latestReviewed) return 'pending';
  if (latestReviewed.kind === 'dpo' || latestReviewed.corrected_answer || latestReviewed.chosen_answer) return 'revised';
  return 'confirmed';
}

const preReviewSchema = z.object({
  issues: z.array(z.object({
    quote: z.string(),
    label: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
  })),
});

async function runPreReview(model: LanguageModel, prompt: string, answer: string): Promise<TeacherPreReviewIssue[]> {
  const result = await generateObject({
    model,
    schema: preReviewSchema,
    prompt: `你是教师审阅助手。请检查 AI 回答是否可能误导学生学习古诗文。只返回最多 3 个需要教师核实的句段，不要输出长解释。\n学生问题：${prompt}\nAI回答：${answer}`,
  });
  const issues = result.object.issues;
  return issues.filter((issue) => issue.quote.trim() && issue.label.trim()).slice(0, 3);
}

async function getTeacherClassIds(teacherId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('class_memberships').select('class_id').eq('profile_id', teacherId).eq('role', 'teacher');
  if (error) return { ok: false as const, message: `教师班级范围加载失败：${error.message}` };
  return { ok: true as const, classIds: (data ?? []).map((row) => row.class_id) };
}

export async function getTeacherWorkspace(): Promise<DataResult<TeacherWorkspace>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();
  const [{ data: presets, error }, cap] = await Promise.all([
    supabase.from('prompt_presets').select('*').eq('status', 'published').eq('target_role', 'teacher').order('updated_at', { ascending: false }),
    getCapability('teacher_chat'),
  ]);
  if (error) return fail('error', `Prompt 预设加载失败：${error.message}`);
  return ok({ presets: presets ?? [], teacherPresets: presets ?? [], providerBlocked: cap.ok && cap.data.ready ? undefined : cap.ok ? cap.data.blockedReason : cap.message });
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
      .select('id,conversation_id,content,created_at,conversations!inner(class_id,project_id,source,title,profiles(display_name),text_projects(title),classes(name)), audit_records(kind,status,corrected_answer,chosen_answer,created_at,updated_at)')
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(200),
    getCapability('audit_assist'),
  ]);
  if (messageResult.error) return fail('error', `审阅队列加载失败：${messageResult.error.message}`);

  const candidateRows = ((messageResult.data ?? []) as CandidateRow[])
    .filter((row) => {
      const conversation = firstJoined(row.conversations);
      return Boolean(
        conversation?.class_id
        && classScope.classIds.includes(conversation.class_id)
        && conversation.source === 'student_chat'
        && conversation.project_id,
      );
    })
    .map((row) => ({ row, reviewState: resolveReviewState(row.audit_records) }))
    .sort((left, right) => {
      if (left.reviewState === right.reviewState) return right.row.created_at.localeCompare(left.row.created_at);
      if (left.reviewState === 'pending') return -1;
      if (right.reviewState === 'pending') return 1;
      if (left.reviewState === 'revised' && right.reviewState === 'confirmed') return -1;
      if (left.reviewState === 'confirmed' && right.reviewState === 'revised') return 1;
      return right.row.created_at.localeCompare(left.row.created_at);
    })
    .slice(0, 30);

  const preReviewModel = auditCap.ok && auditCap.data.ready ? resolveLanguageModel(auditCap.data) : null;
  const preReviewBlocked = preReviewModel ? undefined : auditCap.ok ? auditCap.data.blockedReason : auditCap.message;

  const records = await Promise.all(candidateRows.map(async ({ row, reviewState }) => {
    const { data: transcriptRows, error: transcriptError } = await supabase
      .from('conversation_messages')
      .select('id,role,content,created_at')
      .eq('conversation_id', row.conversation_id)
      .order('created_at', { ascending: true });

    if (transcriptError) throw new Error(`会话记录加载失败：${transcriptError.message}`);

    const transcript = (transcriptRows ?? []).map((transcriptRow) => ({
      id: transcriptRow.id,
      role: transcriptRow.role,
      content: transcriptRow.content,
      createdAt: transcriptRow.created_at,
      isSource: transcriptRow.id === row.id,
    }));

    const sourceIndex = transcript.findIndex((item) => item.id === row.id);
    const prompt = sourceIndex <= 0 ? '源问题未返回；请先核对完整对话再确认。' : [...transcript.slice(0, sourceIndex)].reverse().find((item) => item.role === 'user')?.content ?? '源问题未返回；请先核对完整对话再确认。';
    const conversation = firstJoined(row.conversations);
    const profile = firstJoined(conversation?.profiles);
    const project = firstJoined(conversation?.text_projects);
    const klass = firstJoined(conversation?.classes);

    let preReviewIssues: TeacherPreReviewIssue[] = [];
    let rowPreReviewBlocked = preReviewBlocked;
    if (preReviewModel) {
      try {
        preReviewIssues = await runPreReview(preReviewModel, prompt, row.content);
      } catch (error) {
        rowPreReviewBlocked = error instanceof Error ? `AI 预审调用失败：${error.message}` : 'AI 预审调用失败：Provider 返回未知错误。';
        preReviewIssues = [];
      }
    }

    return {
      id: row.id,
      conversationId: row.conversation_id,
      sourceMessageId: row.id,
      prompt,
      answer: row.content,
      classId: conversation?.class_id ?? null,
      classLabel: klass?.name?.trim() || '未命名班级',
      studentName: profile?.display_name ?? '学生',
      projectTitle: project?.title ?? '未关联篇目',
      sessionLabel: conversation?.title?.trim() || `会话 ${row.conversation_id.slice(0, 8)}`,
      createdAt: row.created_at,
      transcript,
      preReviewIssues,
      preReviewBlocked: rowPreReviewBlocked,
      reviewState,
    } satisfies AuditQueueRecord;
  }));

  return ok(records);
}

export async function getTeacherAnalytics() {
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
      .select('id,created_at,conversations!inner(class_id,project_id,source),audit_records(kind,status,corrected_answer,chosen_answer,created_at,updated_at)')
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  if (classError) return fail('error', `班级统计失败：${classError.message}`);
  if (messageError) return fail('error', `学习记录统计失败：${messageError.message}`);

  const eligibleRows = ((messageRows ?? []) as Array<{
    id: string;
    created_at: string;
    audit_records?: ReviewAuditRow[];
    conversations?: { class_id: string | null; project_id: string | null; source: string } | Array<{ class_id: string | null; project_id: string | null; source: string }>;
  }>).filter((row) => {
    const conversation = firstJoined(row.conversations);
    return Boolean(
      conversation?.class_id
      && classScope.classIds.includes(conversation.class_id)
      && conversation.source === 'student_chat'
      && conversation.project_id,
    );
  });

  const auditStates = eligibleRows.map((row) => ({ createdAt: row.created_at, reviewState: resolveReviewState(row.audit_records) }));
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
    studentsNeedingReview: auditStates.filter((row) => row.reviewState === 'pending').length,
    reviewedCount: reviewed.length,
    weeklyAuditCoverage: { coveragePercent, audited, pending, eligible },
    stuckStudents: [] as Array<{ studentId: string; studentName: string; className: string; lowLevelAttempts: number; attempts: number; auditHref: string }>,
    weakProjects: [] as Array<{ projectId: string; title: string; className: string; notAchieved: number; attempts: number; weakRate: number; auditHref: string }>,
  });
}
