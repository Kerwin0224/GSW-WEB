'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from './common';

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
  } | Array<{
    class_id: string | null;
    project_id: string | null;
    source: string;
  }>;
};

type AuditRow = {
  id: string;
  kind: 'sft' | 'dpo';
  status: string;
  original_answer: string | null;
  corrected_answer: string | null;
  chosen_answer: string | null;
  created_at: string;
  updated_at: string;
};

type ReviewState = 'pending' | 'confirmed' | 'revised';

type SourceContext = {
  source: SourceMessage;
  classId: string;
  prompt: string;
  originalAnswer: string;
  currentAnswer: string;
  reviewState: ReviewState;
};

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function reviewTimestamp(row: AuditRow) {
  return row.updated_at || row.created_at;
}

function resolveReviewState(audits: AuditRow[]): ReviewState {
  const reviewed = audits.filter((audit) => audit.status === 'approved' || audit.status === 'exported');
  if (reviewed.length === 0) return 'pending';

  const latestReviewed = [...reviewed].sort((left, right) => reviewTimestamp(right).localeCompare(reviewTimestamp(left)))[0];
  if (!latestReviewed) return 'pending';
  if (latestReviewed.kind === 'dpo' || latestReviewed.corrected_answer || latestReviewed.chosen_answer) return 'revised';
  return 'confirmed';
}

async function getSourceContext(sourceMessageId: string, teacherId: string): Promise<{ ok: true; data: SourceContext } | { ok: false; message: string }> {
  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase
    .from('conversation_messages')
    .select('id,conversation_id,content,created_at,parts,conversations!inner(class_id,project_id,source)')
    .eq('id', sourceMessageId)
    .eq('role', 'assistant')
    .single();

  if (sourceError || !source) {
    return { ok: false, message: `源记录不可访问：${sourceError?.message ?? 'not found'}` };
  }

  const conversation = firstJoined(source.conversations);
  if (!conversation?.class_id || conversation.source !== 'student_chat' || !conversation.project_id) {
    return { ok: false, message: '只有学生项目中的 AI 回答可以进入学习记录核实。' };
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
      .select('id,kind,status,original_answer,corrected_answer,chosen_answer,created_at,updated_at')
      .eq('source_message_id', source.id)
      .order('created_at', { ascending: true }),
  ]);

  if (transcriptError) {
    return { ok: false, message: `学习记录上下文加载失败：${transcriptError.message}` };
  }

  if (auditError) {
    return { ok: false, message: `核实历史加载失败：${auditError.message}` };
  }

  const transcript = transcriptRows ?? [];
  const sourceIndex = transcript.findIndex((row) => row.id === source.id);
  const prompt = sourceIndex <= 0
    ? ''
    : [...transcript.slice(0, sourceIndex)].reverse().find((row) => row.role === 'user')?.content?.trim() ?? '';

  if (!prompt) {
    return { ok: false, message: '缺少这条 AI 回答对应的学生问题，不能脱离上下文核实。' };
  }

  const reviewedAudits = ((auditRows ?? []) as AuditRow[]).filter((row) => row.status === 'approved' || row.status === 'exported');
  const originalAnswer = reviewedAudits.find((row) => row.original_answer?.trim())?.original_answer?.trim() ?? source.content.trim();

  return {
    ok: true,
    data: {
      source: source as SourceMessage,
      classId: conversation.class_id,
      prompt,
      originalAnswer,
      currentAnswer: source.content.trim(),
      reviewState: resolveReviewState(reviewedAudits),
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

  const { source, classId, prompt, originalAnswer, reviewState } = contextResult.data;
  if (reviewState === 'confirmed') {
    return { ok: true, message: '这条记录已经确认无误；如需调整，请直接保存修订。' };
  }

  if (reviewState === 'revised') {
    return { ok: true, message: '这条记录当前已是教师修订版；如需继续调整，请直接保存修订。' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('audit_records').insert({
    source_message_id: source.id,
    source_conversation_id: source.conversation_id,
    auditor_id: role.data.id,
    class_id: classId,
    kind: 'sft',
    status: 'approved',
    quality: 'accurate',
    prompt,
    original_answer: originalAnswer,
    corrected_answer: null,
    rationale: '教师确认无误。',
    metadata: { teacher_action: 'confirmed', reviewed_at: new Date().toISOString() },
  });

  if (error) return { ok: false, message: `确认记录保存失败：${error.message}` };
  revalidatePath('/teacher');
  revalidatePath('/teacher/audit');
  revalidatePath('/teacher/analytics');
  revalidatePath('/admin/exports');
  return { ok: true, message: '已确认无误，这条记录会按当前最新核实版本进入导出集合。' };
}

export async function reviseLearningRecord(sourceMessageId: string, _previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  void _previousState;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const correctedAnswer = String(formData.get('corrected_answer') ?? '').trim();
  const rationale = String(formData.get('rationale') ?? '').trim();
  const errors: Record<string, string> = {};
  if (!correctedAnswer) errors.corrected_answer = '请直接在回答气泡中写入修订版。';
  if (!rationale) errors.rationale = '请简要说明修订原因，便于后续复核。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐修订信息。', errors };

  const contextResult = await getSourceContext(sourceMessageId, role.data.id);
  if (!contextResult.ok) return { ok: false, message: contextResult.message };

  const { source, classId, prompt, originalAnswer, currentAnswer } = contextResult.data;
  if (correctedAnswer === currentAnswer) {
    return { ok: false, message: '修订版与当前展示回答一致，请修改后再保存。', errors: { corrected_answer: '修订版与当前展示回答一致，请修改后再保存。' } };
  }

  const metadata = { teacher_action: 'revised', reviewed_at: new Date().toISOString() };
  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from('conversation_messages')
    .update({
      content: correctedAnswer,
      parts: [{ type: 'text', text: correctedAnswer }, { type: 'data-teacher-revision', data: { revised: true } }],
    })
    .eq('id', source.id);

  if (updateError) return { ok: false, message: `学生侧修订同步失败：${updateError.message}` };

  const { error: insertError } = await supabase.from('audit_records').insert([
    {
      source_message_id: source.id,
      source_conversation_id: source.conversation_id,
      auditor_id: role.data.id,
      class_id: classId,
      kind: 'sft',
      status: 'approved',
      quality: 'needs_correction',
      prompt,
      original_answer: originalAnswer,
      corrected_answer: correctedAnswer,
      rationale,
      metadata,
    },
    {
      source_message_id: source.id,
      source_conversation_id: source.conversation_id,
      auditor_id: role.data.id,
      class_id: classId,
      kind: 'dpo',
      status: 'approved',
      prompt,
      original_answer: originalAnswer,
      chosen_answer: correctedAnswer,
      rejected_answer: originalAnswer,
      rationale,
      metadata,
    },
  ]);

  if (insertError) {
    await supabase
      .from('conversation_messages')
      .update({ content: source.content, parts: source.parts as never })
      .eq('id', source.id);
    return { ok: false, message: `修订记录保存失败，学生侧回答已回滚：${insertError.message}` };
  }

  revalidatePath('/teacher');
  revalidatePath('/teacher/audit');
  revalidatePath('/teacher/analytics');
  revalidatePath('/student');
  revalidatePath('/admin/exports');
  return { ok: true, message: '修订已保存，导出只会使用这条回答的最新核实版本。' };
}

export async function submitSftAudit(sourceMessageId: string, previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  return confirmLearningRecord(sourceMessageId, previousState, formData);
}

export async function submitDpoAudit(sourceMessageId: string, previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  return reviseLearningRecord(sourceMessageId, previousState, formData);
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
  if (!systemInstruction) errors.system_instruction = '请填写 System Instruction。';
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
  revalidatePath('/teacher/instructions');
  revalidatePath('/teacher');
  return { ok: true, message: '教师预设已保存为草稿。' };
}
