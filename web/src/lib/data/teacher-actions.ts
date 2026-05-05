'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from './common';

export type AuditSubmissionState = { ok: boolean; message: string; errors?: Record<string, string> };

type SourceMessage = {
  id: string;
  conversation_id: string;
  content: string;
  conversations?: { class_id: string | null } | Array<{ class_id: string | null }>;
};

async function getSourceMessage(sourceMessageId: string): Promise<{ ok: true; source: SourceMessage; classId: string | null } | { ok: false; message: string }> {
  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase
    .from('conversation_messages')
    .select('id,conversation_id,content,conversations!inner(class_id)')
    .eq('id', sourceMessageId)
    .eq('role', 'assistant')
    .single();
  if (sourceError || !source) return { ok: false, message: `源记录不可访问：${sourceError?.message ?? 'not found'}` };
  const conversation = Array.isArray(source.conversations) ? source.conversations[0] : source.conversations;
  return { ok: true, source: source as SourceMessage, classId: conversation?.class_id ?? null };
}

export async function confirmLearningRecord(sourceMessageId: string, _previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const prompt = String(formData.get('prompt') ?? '').trim();
  const originalAnswer = String(formData.get('original_answer') ?? '').trim();
  const errors: Record<string, string> = {};
  if (!prompt) errors.prompt = '缺少源问题，不能脱离上下文确认。';
  if (!originalAnswer) errors.original_answer = '缺少 AI 原回答。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请先选择完整学习记录。', errors };

  const sourceResult = await getSourceMessage(sourceMessageId);
  if (!sourceResult.ok) return { ok: false, message: sourceResult.message };
  const supabase = await createClient();
  const { source, classId } = sourceResult;
  const { data: existingApproved, error: existingError } = await supabase
    .from('audit_records')
    .select('id,status')
    .eq('source_message_id', source.id)
    .in('status', ['approved', 'exported'])
    .limit(1)
    .maybeSingle();
  if (existingError) return { ok: false, message: `核实状态检查失败：${existingError.message}` };
  if (existingApproved) return { ok: false, message: '这条学习记录已经核实过，不能重复确认或修订。' };

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
  revalidatePath('/teacher/audit');
  revalidatePath('/admin/exports');
  return { ok: true, message: '已确认无误，这条记录可进入后台导出集合。' };
}

export async function reviseLearningRecord(sourceMessageId: string, _previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const prompt = String(formData.get('prompt') ?? '').trim();
  const originalAnswer = String(formData.get('original_answer') ?? '').trim();
  const correctedAnswer = String(formData.get('corrected_answer') ?? '').trim();
  const rationale = String(formData.get('rationale') ?? '').trim();
  const errors: Record<string, string> = {};
  if (!prompt) errors.prompt = '缺少源问题。';
  if (!originalAnswer) errors.original_answer = '缺少 AI 原回答。';
  if (!correctedAnswer) errors.corrected_answer = '请直接在回答气泡中写入修订版。';
  if (correctedAnswer && correctedAnswer === originalAnswer) errors.corrected_answer = '修订版与原回答一致，请修改后再保存。';
  if (!rationale) errors.rationale = '请简要说明修订原因，便于后续复核。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐修订信息。', errors };

  const sourceResult = await getSourceMessage(sourceMessageId);
  if (!sourceResult.ok) return { ok: false, message: sourceResult.message };
  const supabase = await createClient();
  const { source, classId } = sourceResult;
  const { data: existingApproved, error: existingError } = await supabase
    .from('audit_records')
    .select('id,status')
    .eq('source_message_id', source.id)
    .in('status', ['approved', 'exported'])
    .limit(1)
    .maybeSingle();
  if (existingError) return { ok: false, message: `核实状态检查失败：${existingError.message}` };
  if (existingApproved) return { ok: false, message: '这条学习记录已经核实过，不能重复确认或修订。' };
  const metadata = { teacher_action: 'revised', reviewed_at: new Date().toISOString() };

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
      .update({ content: source.content, parts: [{ type: 'text', text: source.content }] })
      .eq('id', source.id);
    return { ok: false, message: `修订记录保存失败，学生侧回答已回滚：${insertError.message}` };
  }
  revalidatePath('/teacher/audit');
  revalidatePath('/student');
  revalidatePath('/admin/exports');
  return { ok: true, message: '修订已保存，学生侧只会看到教师修订版。' };
}

export async function submitSftAudit(sourceMessageId: string, previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  return confirmLearningRecord(sourceMessageId, previousState, formData);
}

export async function submitDpoAudit(sourceMessageId: string, previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  return reviseLearningRecord(sourceMessageId, previousState, formData);
}

export async function saveTeacherPromptPreset(_previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
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
