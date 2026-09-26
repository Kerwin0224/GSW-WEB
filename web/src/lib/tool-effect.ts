/**
 * tool-effect.ts
 *
 * 工具调用的「只读」与「写操作」之分。
 *
 * 为什么需要：MCP 工具的名字是运行时才知道的，此前渲染层只有联网搜索/读取网页
 * 两类识别，其余一律落到「正在调用工具」。于是在核实与日志里，「查了一下」和
 * 「改了什么」长得一模一样——教师无法判断一条工具记录会不会动到自己的数据。
 *
 * 认不出来就归 unknown 并说「未识别」：把可能写数据的工具说成只读，比说
 * 「不知道」危险得多。
 *
 * 纯函数、无依赖。渲染层接线点见 lib/tool-call-view.ts 的 describeToolPart
 * 与 components/workbench/tool-call-part.tsx。
 */

export type ToolEffect = 'read' | 'write' | 'unknown';

/**
 * 顺序即优先级：写操作模式必须先判。
 * 「save_search_result」「post_read」这类名字先命中写，比反过来更安全。
 */
const WRITE_PATTERN = /(create|update|delete|remove|insert|write|save|submit|post|put|patch|commit|publish|assign|rename|upload|install|execute|send|modify|set_)/i;
const READ_PATTERN = /(search|fetch|get|read|list|query|find|lookup|retrieve|scan|describe|view|check|extract|scrape|crawl|browse|count|stat)/i;

export function classifyToolEffect(toolName: string): ToolEffect {
  if (WRITE_PATTERN.test(toolName)) return 'write';
  if (READ_PATTERN.test(toolName)) return 'read';
  return 'unknown';
}

/** 面向使用者的说明，不含技术词：读就是读，写就是会动数据。 */
export const TOOL_EFFECT_COPY: Record<ToolEffect, string> = {
  read: '只读：只取回信息，不改动任何数据',
  write: '写操作：会新增或改动系统中的数据',
  unknown: '未识别：无法判断这次调用是否改动数据',
};

/** 气泡上的短标签，三到四个字，别抢工具名本身的位置。 */
export const TOOL_EFFECT_LABEL: Record<ToolEffect, string> = {
  read: '只读',
  write: '会改动数据',
  unknown: '未识别',
};
