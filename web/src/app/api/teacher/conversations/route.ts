import { z } from 'zod';

import { withApiLogging } from '@/lib/observability/with-api-logging';
import { requireRole } from '@/lib/data/common';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  conversationId: z.string().trim().uuid(),
});

export async function DELETE(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'teacher_conversation_delete', route: '/api/teacher/conversations' }, async () => {
    const role = await requireRole('teacher');
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
      .eq('source', 'teacher_chat')
      .maybeSingle();

    if (loadError) return Response.json({ error: `会话加载失败：${loadError.message}` }, { status: 500 });
    if (!conversation || conversation.deleted_at) return Response.json({ error: '会话不存在或已删除。' }, { status: 404 });

    const { error: deleteError } = await supabase
      .from('conversations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', conversation.id)
      .eq('owner_id', role.data.id)
      .eq('source', 'teacher_chat');

    if (deleteError) return Response.json({ error: `会话删除失败：${deleteError.message}` }, { status: 500 });

    return Response.json({ ok: true });
  });
}
