import type { UIMessage } from 'ai';
import type { Database } from '@/lib/supabase/database.types';

/**
 * 会话列表行与消息行的最小结构。教师会话列表和学生会话归档拉的是同一批列，
 * 各写一份类型只会让「教师版少一个 project_id」这种差异悄悄漂移。
 */
export type ConversationSummaryRow = {
  id: string;
  title: string | null;
  updated_at: string;
  project_id?: string | null;
  conversation_messages?: Array<{ id: string }> | null;
};
export type ConversationMessageRow = Pick<Database['public']['Tables']['conversation_messages']['Row'], 'id' | 'role' | 'content' | 'parts'>;

/** 会话行 → 列表视图模型。projectId 只有学生视角消费，教师视角取到 undefined。 */
export function toSessionSummary(conversation: ConversationSummaryRow) {
  return {
    id: conversation.id,
    title: conversation.title ?? '未命名会话',
    messageCount: Array.isArray(conversation.conversation_messages) ? conversation.conversation_messages.length : 0,
    updatedLabel: new Date(conversation.updated_at).toLocaleString('zh-CN'),
    projectId: conversation.project_id ?? undefined,
  };
}

export function toInitialMessage(message: ConversationMessageRow): UIMessage {
  return {
    id: message.id,
    role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
    parts: canonicalizeUiMessageParts(message.content, message.parts),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isTextPart(part: unknown) {
  return isRecord(part) && part.type === 'text';
}

export function canonicalizeUiMessageParts(content: string, parts: unknown): UIMessage['parts'] {
  const nonTextParts = Array.isArray(parts) ? parts.filter((part) => !isTextPart(part)) : [];
  return [{ type: 'text', text: content }, ...nonTextParts] as UIMessage['parts'];
}

/**
 * 助手消息落库前裁剪 parts。
 *
 * 落库的 parts 决定两件事：刷新后学生还能看到什么、教师核实时能看到什么依据。
 * 所以保留**渲染得到的东西**，其余一律丢弃：
 *   - text：正文
 *   - 工具调用：只留 name / state / input / errorText —— 界面就展示这几项，
 *     工具的真实返回值（一次联网搜索可能几十 KB）不渲染也不存，存了只是把表撑大
 *   - data-* 流内事件（布鲁姆状态、归属回执）是瞬时的，进历史反而会让旧状态重放
 *
 * 纯函数，可直接单测。
 */
export function toPersistedAssistantParts(parts: unknown): unknown[] {
  if (!Array.isArray(parts)) return [];

  // 显式标注返回类型：否则 TS 按第一个分支（text）推断联合，工具 part 分支报缺 text。
  return parts.flatMap<unknown>((part) => {
    if (!isRecord(part)) return [];
    const type = typeof part.type === 'string' ? part.type : '';

    if (type === 'text') {
      const text = typeof part.text === 'string' ? part.text : '';
      return text ? [{ type: 'text', text }] : [];
    }

    const isDynamicTool = type === 'dynamic-tool';
    const isStaticTool = type.startsWith('tool-');
    if (!isDynamicTool && !isStaticTool) return [];

    const toolName = isDynamicTool
      ? (typeof part.toolName === 'string' ? part.toolName : '')
      : type.slice('tool-'.length);
    if (!toolName) return [];

    return [{
      type: isDynamicTool ? 'dynamic-tool' : type,
      ...(isDynamicTool ? { toolName } : {}),
      ...(typeof part.toolCallId === 'string' ? { toolCallId: part.toolCallId } : {}),
      state: typeof part.state === 'string' ? part.state : 'input-available',
      ...(part.input === undefined ? {} : { input: part.input }),
      ...(typeof part.errorText === 'string' ? { errorText: part.errorText } : {}),
    }];
  });
}
