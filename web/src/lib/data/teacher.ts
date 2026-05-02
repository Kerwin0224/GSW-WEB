import { createClient } from '@/lib/supabase/server';
import { fail, getCapability, ok, requireRole, type DataResult } from './common';
import type { Database } from '@/lib/supabase/database.types';

export type TeacherWorkspace = { presets: Database['public']['Tables']['prompt_presets']['Row'][]; providerBlocked?: string };
export type AuditQueueRecord = { id: string; conversationId: string; sourceMessageId: string; prompt: string; answer: string; classId: string | null; createdAt: string };

export async function getTeacherWorkspace(): Promise<DataResult<TeacherWorkspace>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();
  const [{ data: presets, error }, cap] = await Promise.all([
    supabase.from('prompt_presets').select('*').eq('status', 'published').eq('target_role', 'teacher').order('updated_at', { ascending: false }),
    getCapability('teacher_chat'),
  ]);
  if (error) return fail('error', `Prompt 预设加载失败：${error.message}`);
  return ok({ presets: presets ?? [], providerBlocked: cap.ok && cap.data.ready ? undefined : cap.ok ? cap.data.blockedReason : cap.message });
}

export async function getTeacherAuditQueue(): Promise<DataResult<AuditQueueRecord[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id,conversation_id,content,created_at,conversations!inner(id,class_id,owner_id,source), audit_records(id)')
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return fail('error', `审计队列加载失败：${error.message}`);

  const candidateRows = ((data ?? []) as Array<{
    id: string;
    conversation_id: string;
    content: string;
    created_at: string;
    audit_records?: Array<{ id: string }>;
    conversations?: { class_id: string | null } | Array<{ class_id: string | null }>;
  }>).filter((row) => !row.audit_records || row.audit_records.length === 0);

  const prompts = await Promise.all(candidateRows.map(async (row) => {
    const { data: promptRow } = await supabase
      .from('conversation_messages')
      .select('content')
      .eq('conversation_id', row.conversation_id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return [row.id, promptRow?.content ?? '源问题未返回；请先核对完整对话再标注。'] as const;
  }));
  const promptByMessageId = new Map(prompts);

  return ok(candidateRows.map((row) => {
    const conversation = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      sourceMessageId: row.id,
      prompt: promptByMessageId.get(row.id) ?? '源问题未返回；请先核对完整对话再标注。',
      answer: row.content,
      classId: conversation?.class_id ?? null,
      createdAt: row.created_at,
    };
  }));
}

export async function getTeacherAnalytics() {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();
  const [{ count: classCount, error: classError }, { count: auditCount, error: auditError }] = await Promise.all([
    supabase.from('class_memberships').select('id', { count: 'exact', head: true }).eq('profile_id', role.data.id).eq('role', 'teacher'),
    supabase.from('audit_records').select('id', { count: 'exact', head: true }).eq('auditor_id', role.data.id).eq('status', 'pending'),
  ]);
  if (classError) return fail('error', `班级统计失败：${classError.message}`);
  if (auditError) return fail('error', `审计统计失败：${auditError.message}`);
  return ok({ assignedClasses: classCount ?? 0, auditWorkload: auditCount ?? 0, studentsNeedingReview: 0 });
}
