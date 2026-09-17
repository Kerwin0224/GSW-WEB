import 'server-only';

import type { createClient } from '@/lib/supabase/server';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * 会话是否已被教师最终核实。
 *
 * 只认 RPC：它读 conversations.finalized_at 这一状态真源，并且带本人 / student_chat /
 * 未删除三重限定。此前 RPC 失败时回落到直接扫 audit_records 的 metadata JSON，
 * 那条路既绕过上面三重限定（曾掩盖过一个真实授权缺口），又是全仓已废弃的
 * 「用事件日志推当前状态」写法——状态错了必须让它显式报错，而不是换条路猜。
 */
export async function isStudentConversationFinalized(supabase: SupabaseClient, conversationId: string) {
  const { data, error } = await supabase.rpc('is_student_conversation_finalized', { p_conversation_id: conversationId });
  if (error) throw new Error(`教师核实状态检查失败：${error.message}`);
  return data === true;
}
