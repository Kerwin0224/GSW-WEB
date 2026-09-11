import { z } from 'zod';

import { withApiLogging } from '@/lib/observability/with-api-logging';
import { requireRole } from '@/lib/data/common';
import { createClient } from '@/lib/supabase/server';
import { isStudentConversationFinalized } from '@/lib/data/conversation-finalization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  conversationId: z.string().trim().uuid(),
});

export async function DELETE(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'student_conversation_delete', route: '/api/student/conversations' }, async () => {
    const role = await requireRole('student');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request', issues: [{ message: 'Malformed JSON body' }] }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    const supabase = await createClient();
    const { data: conversation, error: loadError } = await supabase
      .from('conversations')
      .select('id,deleted_at')
      .eq('id', parsed.data.conversationId)
      .eq('owner_id', role.data.id)
      .eq('source', 'student_chat')
      .maybeSingle();

    if (loadError) return Response.json({ error: `会话加载失败：${loadError.message}` }, { status: 500 });
    if (!conversation || conversation.deleted_at) return Response.json({ error: '会话不存在或已删除。' }, { status: 404 });

    const { error: deleteError } = await supabase
      .from('conversations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', conversation.id)
      .eq('owner_id', role.data.id)
      .eq('source', 'student_chat');

    if (deleteError) return Response.json({ error: `会话删除失败：${deleteError.message}` }, { status: 500 });

    return Response.json({ ok: true });
  });
}

// 会话中间节点编辑/回滚：删除某个用户消息节点及其后的全部消息，
// 客户端随后以编辑后的文本重发首问/追问，实现"回到某节点改写上下文"。
// 只允许以用户消息为节点；教师已核实的会话不可回滚。
const truncateSchema = z.object({
  conversationId: z.string().trim().uuid(),
  messageId: z.string().trim().uuid(),
});

export async function PATCH(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'student_conversation_truncate', route: '/api/student/conversations' }, async () => {
    const role = await requireRole('student');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request', issues: [{ message: 'Malformed JSON body' }] }, { status: 400 });
    }
    const parsed = truncateSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    const supabase = await createClient();
    const { data: conversation, error: loadError } = await supabase
      .from('conversations')
      .select('id,deleted_at')
      .eq('id', parsed.data.conversationId)
      .eq('owner_id', role.data.id)
      .eq('source', 'student_chat')
      .maybeSingle();

    if (loadError) return Response.json({ error: `会话加载失败：${loadError.message}` }, { status: 500 });
    if (!conversation || conversation.deleted_at) return Response.json({ error: '会话不存在或已删除。' }, { status: 404 });

    if (await isStudentConversationFinalized(supabase, conversation.id)) {
      return Response.json({ error: '该会话已完成教师核实，不能回滚。', blockedReason: 'teacher_conversation_finalized' }, { status: 409 });
    }

    const { data: rows, error: messagesError } = await supabase
      .from('conversation_messages')
      .select('id,role')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });
    if (messagesError) return Response.json({ error: `消息加载失败：${messagesError.message}` }, { status: 500 });

    const orderedRows = rows ?? [];
    const nodeIndex = orderedRows.findIndex((row) => row.id === parsed.data.messageId);
    if (nodeIndex === -1) return Response.json({ error: '消息不存在或不属于该会话。' }, { status: 404 });
    if (orderedRows[nodeIndex].role !== 'user') return Response.json({ error: '只能从你自己的提问处回滚。' }, { status: 400 });
    const removeIds = orderedRows.slice(nodeIndex).map((row) => row.id);
    if (removeIds.length === 0) return Response.json({ error: '该节点之后没有可回滚的内容。' }, { status: 400 });

    const { error: deleteError } = await supabase
      .from('conversation_messages')
      .delete()
      .in('id', removeIds);
    if (deleteError) return Response.json({ error: `回滚失败：${deleteError.message}` }, { status: 500 });

    return Response.json({ ok: true, removedCount: removeIds.length });
  });
}
