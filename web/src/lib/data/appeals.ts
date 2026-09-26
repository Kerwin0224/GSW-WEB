'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { fail, ok, requireRole, type ActionState, type DataResult } from './common';

/**
 * appeals.ts —— 学生对核实结论的申诉。
 *
 * 此前核实是不可逆终点：学生不知道自己被核实过，更没有渠道说「AI 那句是对的」。
 * 教师把结论写进训练数据后，学生唯一能做的反应是删掉会话重问一遍——那条记录
 * 就此从核实视野里消失，而训练样本里留着的仍是错误答案。
 *
 * 申诉不是「撤销核实」：它只把「有争议」这件事摆到教师面前，由教师决定
 * 是维持（upheld）还是撤回（withdrawn）。谁都不许静默丢弃一条申诉。
 */

export type AppealState = 'open' | 'upheld' | 'withdrawn';

/** 客户端组件要拿这个形状做 useActionState，从数据层原样再导出，不另抄一份。 */
export type { ActionState };

export type StudentAppeal = {
  id: string;
  conversationId: string;
  conversationTitle: string;
  body: string;
  state: AppealState;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type TeacherAppeal = StudentAppeal & {
  studentName: string;
  className: string;
  projectName: string;
  teacherComment: string | null;
};

const STATE_LABEL: Record<AppealState, string> = {
  open: '待处理',
  upheld: '维持原结论',
  withdrawn: '撤回结论',
};

export function appealStateLabel(state: AppealState): string {
  return STATE_LABEL[state];
}

type AppealConversation = {
  title: string | null;
  teacher_comment?: string | null;
  profiles?: { display_name: string | null } | Array<{ display_name: string | null }> | null;
  projects?: { name: string | null } | Array<{ name: string | null }> | null;
  classes?: { name: string | null } | Array<{ name: string | null }> | null;
};

type AppealRow = {
  id: string;
  conversation_id: string;
  raised_by: string;
  body: string;
  state: AppealState;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  conversations?: AppealConversation | AppealConversation[] | null;
};

function joined<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

/**
 * 学生提出的申诉。
 *
 * 库里已经落了 `conversation_id is not null` 与「会话已核实」的双重约束，
 * 应用层再查一次是为了把「不能对未核实的会话申诉」变成一句可读的话，
 * 而不是让 RLS 抛一句英文。
 */
export async function createVerificationAppeal(conversationId: string, body: string): Promise<ActionState> {
  const role = await requireRole('student');
  if (!role.ok) return { ok: false, message: role.message };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, message: '请写清楚你不同意的结论。', errors: { body: '请写清楚你不同意的结论。' } };

  const supabase = await createClient();
  const { data: conversation, error: loadError } = await supabase
    .from('conversations')
    .select('id,finalized_at')
    .eq('id', conversationId)
    .eq('owner_id', role.data.id)
    .eq('source', 'student_chat')
    .is('deleted_at', null)
    .maybeSingle();
  if (loadError) return { ok: false, message: `会话加载失败：${loadError.message}` };
  if (!conversation) return { ok: false, message: '会话不存在或已删除。' };
  if (!conversation.finalized_at) return { ok: false, message: '这个会话还没有完成教师核实，暂时不需要申诉。' };

  // 已有未处理的申诉时不重复提交：教师只处理一条，重复提交只会把队列刷长。
  const { data: openAppeals, error: openError } = await supabase
    .from('verification_appeals')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('raised_by', role.data.id)
    .eq('state', 'open')
    .limit(1);
  if (openError) return { ok: false, message: `申诉状态加载失败：${openError.message}` };
  if ((openAppeals ?? []).length > 0) {
    return { ok: false, message: '你已经为这个会话提交过申诉，教师处理完之前不能重复提交。' };
  }

  const { data: written, error } = await supabase
    .from('verification_appeals')
    .insert({ conversation_id: conversationId, raised_by: role.data.id, body: trimmed })
    .select('id');
  if (error) return { ok: false, message: `申诉提交失败：${error.message}` };
  // 0 行 = RLS 静默过滤掉的写入，error 分支看不出来。不检查就会报「已提交」而队列里没有。
  if (!written || written.length === 0) {
    return { ok: false, message: '申诉没有保存，本次提交未生效。请刷新后重试；若持续失败请联系管理员。' };
  }

  revalidatePath('/student');
  return { ok: true, message: '申诉已提交，教师会在核实队列里看到。' };
}

/** 我提过的申诉。 */
export async function listMyAppeals(): Promise<DataResult<StudentAppeal[]>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('verification_appeals')
    .select('id,conversation_id,body,state,resolution_note,resolved_at,created_at,conversations!inner(title)')
    .eq('raised_by', role.data.id)
    // 学生删掉的会话不再出现在任何业务查询里：申诉列表也不能把它捞回来，
    // 否则学生会看到一条自己明明删掉、却还挂着一个未处理申诉的会话。
    .is('conversations.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return fail('error', `申诉列表加载失败：${error.message}`);

  return ok(((data ?? []) as unknown as AppealRow[]).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    conversationTitle: joined(row.conversations)?.title?.trim() || '未命名会话',
    body: row.body,
    state: row.state,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  })));
}

/**
 * 教师侧的申诉队列。
 *
 * 可见性完全交给 RLS（学校/班级/空间三路判据与学习记录核实一致），
 * 应用层不再另写一套授权——两套判据迟早漂移，漂移的那次就是越权。
 */
export async function listTeacherAppeals(state?: AppealState): Promise<DataResult<TeacherAppeal[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();

  let query = supabase
    .from('verification_appeals')
    .select('id,conversation_id,body,state,resolution_note,resolved_at,created_at,conversations!inner(title,teacher_comment,profiles(display_name),projects(name),classes(name))')
    // 同理：教师侧也不能在已删除的会话上处理申诉。
    .is('conversations.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (state) query = query.eq('state', state);
  const { data, error } = await query;
  if (error) return fail('error', `申诉队列加载失败：${error.message}`);

  return ok(((data ?? []) as unknown as AppealRow[]).map((row) => {
    const conversation = joined(row.conversations);
    return {
      id: row.id,
      conversationId: row.conversation_id,
      conversationTitle: conversation?.title?.trim() || '未命名会话',
      body: row.body,
      state: row.state,
      resolutionNote: row.resolution_note,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      studentName: joined(conversation?.profiles)?.display_name?.trim() || '未命名学生',
      className: joined(conversation?.classes)?.name?.trim() || '未分班',
      projectName: joined(conversation?.projects)?.name?.trim() || '未关联项目',
      teacherComment: conversation?.teacher_comment?.trim() || null,
    };
  }));
}

/**
 * 处理一条申诉：维持或撤回结论。
 *
 * 撤回只写申诉表的处理说明，不去改已物化的训练样本——那批样本已经进了导出批次，
 * 静默改写等于让导出记录与实际内容对不上。要真正修正训练数据要走新的核实提交。
 */
export async function resolveVerificationAppeal(appealId: string, _previousState: ActionState, formData: FormData): Promise<ActionState> {
  void _previousState;
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const state = String(formData.get('state') ?? '');
  if (state !== 'upheld' && state !== 'withdrawn') {
    return { ok: false, message: '处理结论只能是「维持原结论」或「撤回结论」。' };
  }
  const resolutionNote = String(formData.get('resolution_note') ?? '').trim();
  if (!resolutionNote) {
    return { ok: false, message: '请填写处理说明，学生会看到这句话。', errors: { resolution_note: '请填写处理说明，学生会看到这句话。' } };
  }

  const supabase = await createClient();
  const { data: updatedRows, error } = await supabase
    .from('verification_appeals')
    .update({ state, resolution_note: resolutionNote, resolved_by: role.data.id, resolved_at: new Date().toISOString() })
    .eq('id', appealId)
    .eq('state', 'open')
    .select('id');
  if (error) return { ok: false, message: `申诉处理失败：${error.message}` };
  // 0 行有两种可能：已被别人处理过，或 RLS 拦下。都必须在界面上说清，
  // 报「已处理」会让教师以为学生看到了结论。
  if (!updatedRows || updatedRows.length === 0) {
    return { ok: false, message: '这条申诉已被处理或不在你的范围内，本次操作未生效。请刷新后查看最新状态。' };
  }

  revalidatePath('/teacher/audit');
  revalidatePath('/teacher');
  return { ok: true, message: state === 'upheld' ? '已记录：维持原核实结论。' : '已记录：撤回原核实结论。' };
}
