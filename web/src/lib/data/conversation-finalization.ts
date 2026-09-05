import 'server-only';

import type { createClient } from '@/lib/supabase/server';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function asMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function isStudentConversationFinalized(supabase: SupabaseClient, conversationId: string) {
  const { data: rpcData, error: rpcError } = await supabase.rpc('is_student_conversation_finalized', { p_conversation_id: conversationId });
  if (!rpcError && typeof rpcData === 'boolean') return rpcData;

  const { data, error } = await supabase
    .from('audit_records')
    .select('id,metadata,status,kind')
    .eq('source_conversation_id', conversationId)
    .eq('kind', 'metadata')
    .in('status', ['approved', 'exported'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(`教师核实状态检查失败：${error.message}`);
  return (data ?? []).some((row) => asMetadataObject(row.metadata).teacher_action === 'conversation_finalized');
}
