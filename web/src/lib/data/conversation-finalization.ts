import 'server-only';

import { getAppSession } from '@/lib/session';
import type { createClient } from '@/lib/supabase/server';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * 会话所有者 id。锁定判定必须带本人限定，所以从签名 cookie 取当前学生，
 * 而不是让每个调用点各传一遍——漏传一次就等于把「能不能问」放开给所有人。
 */
async function currentOwnerId() {
  const session = await getAppSession();
  if (!session?.sub) throw new Error('会话已失效，请重新登录后再试。');
  return session.sub;
}

/**
 * 学生侧的「核实终态」有两个互不相干的含义，此前被压在同一个字段上：
 *
 *   · 核实完成 —— 教师已对该会话完成学习记录核实，训练样本已物化。
 *     它是**教学状态**，不约束学生还能不能提问。
 *   · 锁问 —— 教师显式选择封口，学生不能在该会话继续追问。
 *     它是**交互开关**，且可撤销：教师点错了要能解开。
 *
 * 探究型学习、异步答疑、复核后追问、错题再讨论都要求「已核实但仍可追问」，
 * 所以这里读 conversations.locked_at，而不是 finalized_at。
 *
 * 仍然不读 RPC：库里的 is_student_conversation_finalized 是按旧语义
 * （finalized_at 非空即封口）落库的，迁移已定稿。应用层照抄那三重限定
 * ——本人 / student_chat / 未删除——再叠加 locked_at，权限面与原 RPC 等价。
 */
export async function isStudentConversationLocked(supabase: SupabaseClient, conversationId: string) {
  const ownerId = await currentOwnerId();
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('owner_id', ownerId)
    .eq('source', 'student_chat')
    .is('deleted_at', null)
    .not('locked_at', 'is', null)
    .maybeSingle();
  if (error) throw new Error(`会话锁定状态检查失败：${error.message}`);
  return data !== null;
}

/** 学生端要看到的教师反馈：会话级评语 + 两个终态。读不到行就报出来，不猜。 */
export type StudentConversationFeedback = {
  teacherComment: string | null;
  finalizedAt: string | null;
  lockedAt: string | null;
};

export async function getStudentConversationFeedback(
  supabase: SupabaseClient,
  conversationId: string,
  ownerId: string,
): Promise<StudentConversationFeedback> {
  const { data, error } = await supabase
    .from('conversations')
    .select('teacher_comment,finalized_at,locked_at')
    .eq('id', conversationId)
    .eq('owner_id', ownerId)
    .eq('source', 'student_chat')
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`教师反馈加载失败：${error.message}`);
  if (!data) throw new Error('会话不存在或已删除。');
  return {
    teacherComment: data.teacher_comment?.trim() || null,
    finalizedAt: data.finalized_at ?? null,
    lockedAt: data.locked_at ?? null,
  };
}
