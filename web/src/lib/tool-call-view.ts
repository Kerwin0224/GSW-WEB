/**
 * tool-call-view.ts
 *
 * 把 AI SDK 的工具调用 part 翻成学生/教师看得懂的一句话。
 *
 * 为什么单独成文件：MCP 工具的**名字是运行时才知道的**（后台配什么 Server 就有什么工具），
 * 所以不可能给每个工具写一个专属组件。这里只做一件事——按名字猜它属于哪一类动作，
 * 再按 part 的 state 说清「正在做 / 做完了 / 失败了」，剩下的交给一个通用组件渲染。
 *
 * 纯函数，无依赖，可直接单测。
 */

export type ToolCallState = 'running' | 'done' | 'error';

export type ToolCallView = {
  /** 工具原名。给教师核实用，保留原始标识。 */
  toolName: string;
  state: ToolCallState;
  /** 面向使用者的一句话，如「正在联网搜索」。 */
  actionLabel: string;
  /** 可读入参摘要（查询词、网址…）；取不到就是 undefined。 */
  detail?: string;
  /** 失败原因。 */
  errorText?: string;
};

type ToolKind = {
  key: string;
  /** 按工具名判断类别。MCP 工具名通常是 snake_case 英文，偶尔中文。 */
  pattern: RegExp;
  labels: Record<ToolCallState, string>;
};

/**
 * 类别表。顺序即优先级——「web_search」要落在联网搜索上，而不是被更宽的模式先吃掉。
 * 只收常见形态，认不出来的一律走通用文案：宁可说「调用工具」，也不要猜错动作。
 */
const TOOL_KINDS: ToolKind[] = [
  {
    key: 'search',
    pattern: /(search|web_?search|internet|browse|google|bing|brave|tavily|exa|serp|搜索|检索|联网)/i,
    labels: { running: '正在联网搜索', done: '已联网搜索', error: '联网搜索失败' },
  },
  {
    key: 'fetch',
    pattern: /(fetch|scrape|crawl|read_?(url|page|web)|open_?url|extract|抓取|网页|读取网)/i,
    labels: { running: '正在读取网页', done: '已读取网页', error: '读取网页失败' },
  },
];

const GENERIC_LABELS: Record<ToolCallState, string> = {
  running: '正在调用工具',
  done: '已调用工具',
  error: '工具调用失败',
};

/** 入参里最像「用户看得懂的那一句」的字段，按优先级取第一个非空字符串。 */
const DETAIL_KEYS = ['query', 'q', 'search_query', 'searchQuery', 'term', 'keyword', 'url', 'uri', 'prompt', 'text'];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

const MAX_DETAIL_CHARS = 120;

function clamp(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > MAX_DETAIL_CHARS ? `${trimmed.slice(0, MAX_DETAIL_CHARS)}…` : trimmed;
}

function detailFromInput(input: unknown): string | undefined {
  const record = asRecord(input);
  if (!record) return undefined;
  for (const key of DETAIL_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return clamp(value);
  }
  // 认不出字段名就把整个入参压缩成一行——空着不如让使用者看到模型想传什么。
  const keys = Object.keys(record);
  if (keys.length === 0) return undefined;
  try {
    return clamp(JSON.stringify(record));
  } catch {
    return undefined;
  }
}

function stateOf(raw: unknown): ToolCallState {
  if (raw === 'output-available') return 'done';
  if (raw === 'output-error' || raw === 'output-denied') return 'error';
  // input-streaming / input-available / approval-* 都还在进行中。
  return 'running';
}

/**
 * 解析一个工具 part。不是工具 part 就返回 null，调用方据此决定要不要渲染。
 *
 * 同时认 `dynamic-tool`（MCP 等运行时定义的工具有这个类型）与 `tool-<name>`
 * （编译期已知名字的工具）——两者字段布局一致，只是工具名一个在 part.toolName、一个在 type 里。
 */
export function describeToolPart(part: unknown): ToolCallView | null {
  const record = asRecord(part);
  if (!record) return null;
  const type = typeof record.type === 'string' ? record.type : '';

  const isDynamic = type === 'dynamic-tool';
  const isStatic = type.startsWith('tool-') && type !== 'tool-invocation';
  if (!isDynamic && !isStatic) return null;

  const toolName = isDynamic
    ? (typeof record.toolName === 'string' ? record.toolName : '')
    : type.slice('tool-'.length);
  if (!toolName) return null;

  const state = stateOf(record.state);
  const kind = TOOL_KINDS.find((candidate) => candidate.pattern.test(toolName));

  return {
    toolName,
    state,
    actionLabel: kind ? kind.labels[state] : GENERIC_LABELS[state],
    detail: detailFromInput(record.input),
    errorText: typeof record.errorText === 'string' && record.errorText.trim() ? clamp(record.errorText) : undefined,
  };
}
