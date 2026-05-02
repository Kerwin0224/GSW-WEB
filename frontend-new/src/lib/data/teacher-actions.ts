'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from './common';

export type AuditSubmissionState = { ok: boolean; message: string; errors?: Record<string, string> };

export async function submitSftAudit(sourceMessageId: string, _previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const quality = String(formData.get('quality') ?? 'accurate');
  const prompt = String(formData.get('prompt') ?? '').trim();
  const originalAnswer = String(formData.get('original_answer') ?? '').trim();
  const correctedAnswer = String(formData.get('corrected_answer') ?? '').trim();
  const rationale = String(formData.get('rationale') ?? '').trim();
  const errors: Record<string, string> = {};

  if (!prompt) errors.prompt = '缺少源问题，不能脱离上下文提交。';
  if (!originalAnswer) errors.original_answer = '缺少模型原回答。';
  if (!['accurate', 'needs_correction', 'reject'].includes(quality)) errors.quality = '请选择有效质量状态。';
  if (quality === 'needs_correction' && !correctedAnswer) errors.corrected_answer = '需要修正时必须填写修正后答案。';
  if ((quality === 'needs_correction' || quality === 'reject') && !rationale) errors.rationale = '修正或拒绝入库时必须填写理由。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐 SFT 标注必填项。', errors };

  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase
    .from('conversation_messages')
    .select('id,conversation_id,content,conversations!inner(class_id)')
    .eq('id', sourceMessageId)
    .eq('role', 'assistant')
    .single();
  if (sourceError || !source) return { ok: false, message: `源记录不可访问：${sourceError?.message ?? 'not found'}` };
  const conversation = Array.isArray(source.conversations) ? source.conversations[0] : source.conversations;

  const { error } = await supabase.from('audit_records').insert({
    source_message_id: source.id,
    source_conversation_id: source.conversation_id,
    auditor_id: role.data.id,
    class_id: conversation?.class_id ?? null,
    kind: 'sft',
    status: quality === 'reject' ? 'rejected' : 'approved',
    quality,
    prompt,
    original_answer: originalAnswer,
    corrected_answer: quality === 'needs_correction' ? correctedAnswer : null,
    rationale: rationale || null,
  });
  if (error) return { ok: false, message: `SFT 标注保存失败：${error.message}` };
  return { ok: true, message: 'SFT 标注已保存。' };
}

export async function submitDpoAudit(sourceMessageId: string, _previousState: AuditSubmissionState, formData: FormData): Promise<AuditSubmissionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const prompt = String(formData.get('prompt') ?? '').trim();
  const originalAnswer = String(formData.get('original_answer') ?? '').trim();
  const chosenAnswer = String(formData.get('chosen_answer') ?? '').trim();
  const rejectedAnswer = String(formData.get('rejected_answer') ?? '').trim();
  const rationale = String(formData.get('preference_rationale') ?? '').trim();
  const errors: Record<string, string> = {};

  if (!prompt) errors.prompt = '缺少源问题。';
  if (!originalAnswer) errors.original_answer = '缺少模型原回答。';
  if (!chosenAnswer) errors.chosen_answer = '必须填写 chosen answer。';
  if (!rejectedAnswer) errors.rejected_answer = '必须填写 rejected answer。';
  if (!rationale) errors.preference_rationale = '必须填写偏好理由。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐 DPO 标注必填项。', errors };

  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase
    .from('conversation_messages')
    .select('id,conversation_id,content,conversations!inner(class_id)')
    .eq('id', sourceMessageId)
    .eq('role', 'assistant')
    .single();
  if (sourceError || !source) return { ok: false, message: `源记录不可访问：${sourceError?.message ?? 'not found'}` };
  const conversation = Array.isArray(source.conversations) ? source.conversations[0] : source.conversations;

  const { error } = await supabase.from('audit_records').insert({
    source_message_id: source.id,
    source_conversation_id: source.conversation_id,
    auditor_id: role.data.id,
    class_id: conversation?.class_id ?? null,
    kind: 'dpo',
    status: 'approved',
    prompt,
    original_answer: originalAnswer,
    chosen_answer: chosenAnswer,
    rejected_answer: rejectedAnswer,
    rationale,
  });
  if (error) return { ok: false, message: `DPO 标注保存失败：${error.message}` };
  return { ok: true, message: 'DPO 标注已保存。' };
}
