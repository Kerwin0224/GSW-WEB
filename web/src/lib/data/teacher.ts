import { createGateway, generateObject, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fail, getCapability, ok, requireRole, resolveEnvSecret, type CapabilityStatus, type DataResult } from './common';
import type { Database } from '@/lib/supabase/database.types';

export type TeacherWorkspace = { presets: Database['public']['Tables']['prompt_presets']['Row'][]; teacherPresets: Database['public']['Tables']['prompt_presets']['Row'][]; providerBlocked?: string };
export type TeacherAuditMessage = { id: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; createdAt: string; isSource: boolean };
export type TeacherPreReviewIssue = { quote: string; label: string; severity: 'low' | 'medium' | 'high' };
export type AuditQueueRecord = {
  id: string;
  conversationId: string;
  sourceMessageId: string;
  prompt: string;
  answer: string;
  classId: string | null;
  studentName: string;
  projectTitle: string;
  createdAt: string;
  transcript: TeacherAuditMessage[];
  preReviewIssues: TeacherPreReviewIssue[];
  preReviewBlocked?: string;
};

function resolveLanguageModel(capability: CapabilityStatus): LanguageModel | null {
  if (!capability.modelId) return null;
  const apiKey = resolveEnvSecret(capability.secretRef);
  if (!apiKey) return null;
  if (capability.providerType === 'gateway') return createGateway({ apiKey, baseURL: capability.baseUrl ?? process.env.AI_GATEWAY_BASE_URL })(capability.modelId);
  return createOpenAI({ apiKey, baseURL: capability.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined })(capability.modelId);
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
  const supabase = await createClient();
  const [messageResult, auditCap] = await Promise.all([
    supabase
      .from('conversation_messages')
      .select('id,conversation_id,content,created_at,conversations!inner(id,class_id,owner_id,source,profiles(display_name),text_projects(title)), audit_records(id,status)')
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(30),
    getCapability('audit_assist'),
  ]);
  if (messageResult.error) return fail('error', `审阅队列加载失败：${messageResult.error.message}`);

  const candidateRows = ((messageResult.data ?? []) as Array<{
    id: string;
    conversation_id: string;
    content: string;
    created_at: string;
    audit_records?: Array<{ id: string; status?: string }>;
    conversations?: { class_id: string | null; owner_id?: string | null; profiles?: { display_name?: string | null } | Array<{ display_name?: string | null }>; text_projects?: { title?: string | null } | Array<{ title?: string | null }> } | Array<{ class_id: string | null; owner_id?: string | null; profiles?: { display_name?: string | null } | Array<{ display_name?: string | null }>; text_projects?: { title?: string | null } | Array<{ title?: string | null }> }>;
  }>).filter((row) => !row.audit_records?.some((record) => record.status === 'approved' || record.status === 'exported'));

  const preReviewModel = auditCap.ok && auditCap.data.ready ? resolveLanguageModel(auditCap.data) : null;
  const preReviewBlocked = preReviewModel ? undefined : auditCap.ok ? auditCap.data.blockedReason : auditCap.message;

  const records = await Promise.all(candidateRows.map(async (row) => {
    const [{ data: transcriptRows }, { data: promptRow }] = await Promise.all([
      supabase
        .from('conversation_messages')
        .select('id,role,content,created_at')
        .eq('conversation_id', row.conversation_id)
        .order('created_at', { ascending: true }),
      supabase
        .from('conversation_messages')
        .select('content')
        .eq('conversation_id', row.conversation_id)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const conversation = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations;
    const profile = Array.isArray(conversation?.profiles) ? conversation?.profiles[0] : conversation?.profiles;
    const project = Array.isArray(conversation?.text_projects) ? conversation?.text_projects[0] : conversation?.text_projects;
    const prompt = promptRow?.content ?? '源问题未返回；请先核对完整对话再确认。';
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
      studentName: profile?.display_name ?? '学生',
      projectTitle: project?.title ?? '未归档篇目',
      createdAt: row.created_at,
      transcript: (transcriptRows ?? []).map((transcriptRow) => ({ id: transcriptRow.id, role: transcriptRow.role, content: transcriptRow.content, createdAt: transcriptRow.created_at, isSource: transcriptRow.id === row.id })),
      preReviewIssues,
      preReviewBlocked: rowPreReviewBlocked,
    };
  }));

  return ok(records);
}

export async function getTeacherAnalytics() {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weekStartIso = weekStart.toISOString();
  const [{ count: classCount, error: classError }, { count: auditCount, error: auditError }, { count: reviewedCount, error: reviewedError }, { count: weeklyEligible, error: weeklyEligibleError }, { count: weeklyAudited, error: weeklyAuditedError }] = await Promise.all([
    supabase.from('class_memberships').select('id', { count: 'exact', head: true }).eq('profile_id', role.data.id).eq('role', 'teacher'),
    supabase.from('conversation_messages').select('id', { count: 'exact', head: true }).eq('role', 'assistant'),
    supabase.from('audit_records').select('id', { count: 'exact', head: true }).eq('auditor_id', role.data.id).in('status', ['approved', 'rejected', 'exported']),
    supabase.from('conversation_messages').select('id', { count: 'exact', head: true }).eq('role', 'assistant').gte('created_at', weekStartIso),
    supabase.from('audit_records').select('id', { count: 'exact', head: true }).eq('auditor_id', role.data.id).gte('updated_at', weekStartIso).in('status', ['approved', 'rejected', 'exported']),
  ]);
  if (classError) return fail('error', `班级统计失败：${classError.message}`);
  if (auditError) return fail('error', `待核实统计失败：${auditError.message}`);
  if (reviewedError) return fail('error', `已核实统计失败：${reviewedError.message}`);
  if (weeklyEligibleError) return fail('error', `本周候选统计失败：${weeklyEligibleError.message}`);
  if (weeklyAuditedError) return fail('error', `本周核实统计失败：${weeklyAuditedError.message}`);
  const eligible = weeklyEligible ?? 0;
  const audited = weeklyAudited ?? 0;
  const pending = Math.max(eligible - audited, 0);
  const coveragePercent = eligible > 0 ? Math.min(Math.round((audited / eligible) * 100), 100) : 0;
  return ok({
    assignedClasses: classCount ?? 0,
    auditWorkload: auditCount ?? 0,
    studentsNeedingReview: auditCount ?? 0,
    reviewedCount: reviewedCount ?? 0,
    weeklyAuditCoverage: { coveragePercent, audited, pending, eligible },
    stuckStudents: [] as Array<{ studentId: string; studentName: string; className: string; lowLevelAttempts: number; attempts: number; auditHref: string }>,
    weakProjects: [] as Array<{ projectId: string; title: string; className: string; notAchieved: number; attempts: number; weakRate: number; auditHref: string }>,
  });
}
