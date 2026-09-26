import { z } from 'zod';
import { hasControlCharacter } from '@/lib/school-login';

import { withApiLogging } from '@/lib/observability/with-api-logging';
import { requireRole } from '@/lib/data/common';
import { createClient } from '@/lib/supabase/server';
import { conversationIdSchema } from '@/lib/request-schemas';

/**
 * 改会话标题。会话标题是学生唯一能自己写的检索线索：
 * 没有它，「三月那次讲受力分析的对话」在几十条历史里根本找不回来。
 *
 * 单独一个路径而不是并进 /api/student/conversations：那个路由的语义是
 * 「删除」与「回滚到某个消息节点」，改标题是第三件事，混在一起两边都难读。
 */

const bodySchema = z.object({
  conversationId: conversationIdSchema,
  title: z.string().trim().min(1).max(80),
});

export async function PATCH(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'student_conversation_rename', route: '/api/student/conversations/title' }, async () => {
    const role = await requireRole('student');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request', issues: [{ message: 'Malformed JSON body' }] }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: '标题不能为空，也不能超过 80 个字。', issues: parsed.error.flatten() }, { status: 400 });
    }
    // 控制字符会把标题在检索框与列表里折断，看起来像「标题被截断了」。
    if (hasControlCharacter(parsed.data.title)) {
      return Response.json({ error: '标题里不能有换行或制表符。' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: updated, error } = await supabase
      .from('conversations')
      .update({ title: parsed.data.title })
      .eq('id', parsed.data.conversationId)
      .eq('owner_id', role.data.id)
      .eq('source', 'student_chat')
      .is('deleted_at', null)
      .select('id');
    if (error) return Response.json({ error: `标题保存失败：${error.message}` }, { status: 500 });
    // 0 行 = 会话不存在、已删除或不属于这个学生；报「已保存」等于让学生以为改成功了。
    if (!updated || updated.length === 0) {
      return Response.json({ error: '标题未保存：会话不存在、已被删除，或不属于你。' }, { status: 404 });
    }

    return Response.json({ ok: true, title: parsed.data.title });
  });
}
