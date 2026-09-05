import 'server-only';

import type { createClient } from '@/lib/supabase/server';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * 教师修订 / 会话级最终提交后，在学生侧对应会话频道广播一次变更。
 *
 * 云端 Supabase 自定义会话不登录 Supabase Auth，浏览器端不能可靠依赖
 * postgres_changes（RLS 基于 current_app_user_id，Realtime 服务端拿不到
 * 自定义 session）。Broadcast 不受 RLS 约束，而学生只监听自己当前会话 id
 * 对应的频道，泄露面仅为“该会话内容被更新”这一信号，不会透出具体内容。
 *
 * 使用 channel.httpSend 显式走 REST API 发送 broadcast；supabase-js v3 起
 * 会弃用 channel.send() 对 REST 的自动回退。REST 调用不需要先 subscribe，
 * 也就避免了在服务端建立长连接的开销。
 *
 * 失败只写 warn，不阻塞教师已落库的修订；学生端仍有 visibility 刷新和
 * 5 秒轮询兜底。
 *
 * 不携带 messageIds 等细节：payload 仅作为“本会话有更新”信号使用，学生端
 * 收到信号后走服务端 RSC（RLS 把关）重新拉取消息内容；这样即便 channel 被
 * 非预期身份订阅，也只会泄露“某会话此时有活动”这一粒度的时间信号。
 */
export async function broadcastStudentConversationUpdate(
  supabase: SupabaseClient,
  conversationId: string,
  payload: { kind: 'teacher_revision' | 'conversation_finalized'; revisedAt: string },
) {
  const channel = supabase.channel(`student-conversation-sync-${conversationId}`, {
    config: { broadcast: { self: false } },
  });
  try {
    const result = await channel.httpSend('student-conversation-update', payload);
    if (!result.success) {
      console.warn('[student-conversation-broadcast] non-success response', {
        conversationId,
        kind: payload.kind,
        status: result.status,
        error: result.error,
      });
    }
  } catch (error) {
    console.warn('[student-conversation-broadcast] threw', {
      conversationId,
      kind: payload.kind,
      error: error instanceof Error ? error.message : error,
    });
  } finally {
    await supabase.removeChannel(channel).catch(() => {});
  }
}
