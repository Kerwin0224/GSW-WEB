import { classifyToolEffect, TOOL_EFFECT_LABEL, type ToolEffect } from '@/lib/tool-effect';

/** 只读与写操作要一眼能分开：核实页里「查了什么」和「改了什么」不是一回事。 */
const TOOL_EFFECT_TONE: Record<ToolEffect, string> = {
  read: 'text-muted-foreground',
  write: 'border-destructive/30 text-destructive',
  unknown: '',
};
import { Bot, Pencil, User, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BloomStatusBadge, type BloomStatus } from '@/components/workbench/bloom-status-badge';
import { MarkdownContent } from '@/components/workbench/markdown-content';
import { ToolCallPart } from '@/components/workbench/tool-call-part';

interface MessageLike {
  id: string;
  role: string;
  parts?: unknown[];
}

export type MessageEditState = { messageId: string; value: string };

function partText(part: unknown): string | null {
  if (!part || typeof part === 'string') {
    return typeof part === 'string' ? part : null;
  }
  const record = part as Record<string, unknown>;
  if (record.type === 'text' && typeof record.text === 'string') return record.text;
  return null;
}

function messageText(message: MessageLike): string {
  return (message.parts ?? []).map(partText).filter((text): text is string => text !== null).join('\n');
}

function partType(part: unknown): string {
  if (!part || typeof part !== 'object') return 'unknown';
  const value = (part as Record<string, unknown>).type;
  return typeof value === 'string' ? value : 'unknown';
}

export function AIMessagePart({ part, markdown = false }: { part: unknown; markdown?: boolean }) {
  const text = partText(part);
  if (text !== null) {
    return markdown ? <MarkdownContent content={text} aria-live="polite" /> : <div className="whitespace-pre-wrap leading-7" aria-live="polite">{text}</div>;
  }

  const type = partType(part);
  // 工具调用：MCP 工具是运行时定义的，走 dynamic-tool；编译期已知的走 tool-<name>。
  // 两者都由 describeToolPart 解析，认不出来时它返回 null，这里再落到下面的兜底。
  if (type === 'dynamic-tool' || type.startsWith('tool-')) {
    const toolCall = <ToolCallPart part={part} />;
    if (toolCall) {
      // 标出这次调用是「查了一下」还是「改了什么」：核实页与日志里，
      // 用户分不清这两种工具，看下去就分不清 AI 做了什么。
      const record = part && typeof part === 'object' ? part as Record<string, unknown> : null;
      const invocation = record?.toolInvocation as { toolName?: unknown } | undefined;
      const name = typeof record?.toolName === 'string'
        ? record.toolName
        : typeof invocation?.toolName === 'string'
          ? invocation.toolName
          : type.replace(/^tool-/, '');
      const effect = classifyToolEffect(name);
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {toolCall}
          <Badge variant="outline" className={TOOL_EFFECT_TONE[effect]}>{TOOL_EFFECT_LABEL[effect]}</Badge>
        </span>
      );
    }
  }
  if (type.includes('citation') || type.includes('retrieval')) {
    return <Badge variant="outline">参考来源</Badge>;
  }
  if (type === 'data-teacher-revision') {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/6 px-2 py-1 text-xs text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden="true"><path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" /></svg>
        <span className="font-medium">该回答已由教师修订</span>
      </div>
    );
  }
  if (type.includes('classification')) {
    return <Badge variant="outline">认知层级已更新</Badge>;
  }
  // 已知但画不出来的类型：给一句明说，不留空白。
  // AI SDK 的图片也是 type=file，靠 mediaType 区分，别一律叫"附件"。
  if (type === 'image' || type === 'file') {
    const record = part && typeof part === 'object' ? part as Record<string, unknown> : null;
    const mediaType = typeof record?.mediaType === 'string' ? record.mediaType : '';
    const name = typeof record?.filename === 'string' ? record.filename : '';
    const isImage = type === 'image' || mediaType.startsWith('image/');
    return <Badge variant="outline">{isImage ? '图片' : '附件'}{name ? `：${name}` : ''}</Badge>;
  }
  // 兜底：此前这里直接 return null，模型多返回一个 step-start 或 reasoning 就让整段回答变空白，
  // 而且界面毫无提示。折叠起来先摆着，至少还能看出这里有过内容。
  let summary: string;
  try {
    summary = JSON.stringify(part)?.slice(0, 400) ?? '';
  } catch {
    summary = String(part).slice(0, 400);
  }
  return (
    <details className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer">其他内容（{type}）</summary>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">{summary}</pre>
    </details>
  );
}

function keyedParts(parts: unknown[]) {
  const occurrences = new Map<string, number>();
  return parts.map((part) => {
    // 工具 part 优先用 toolCallId 做键：同一个工具可能被调用多次，
    // 用「类型 + 序号」当键时，流式追加会让 React 复用错节点，把上一条的结果渲染到新调用上。
    const record = part && typeof part === 'object' ? part as Record<string, unknown> : null;
    const toolCallId = typeof record?.toolCallId === 'string' ? record.toolCallId : '';
    const type = partType(part);
    const seed = toolCallId || type;
    const occurrence = occurrences.get(seed) ?? 0;
    occurrences.set(seed, occurrence + 1);
    return { key: toolCallId ? `${seed}` : `${type}-${occurrence}`, part };
  });
}

export function AIMessageList({
  messages,
  userBloomStatus,
  assistantCardClassName,
  edit,
  canEditUserMessage = false,
  onEditStart,
  onEditChange,
  onEditSubmit,
  onEditCancel,
}: {
  messages: MessageLike[];
  userBloomStatus?: Record<string, BloomStatus>;
  assistantCardClassName?: string;
  /** 当前处于内联编辑态的用户消息与草稿。 */
  edit?: MessageEditState | null;
  canEditUserMessage?: boolean;
  onEditStart?: (messageId: string, currentText: string) => void;
  onEditChange?: (value: string) => void;
  onEditSubmit?: () => void;
  onEditCancel?: () => void;
}) {
  return (
    <div className="space-y-5" aria-live="polite">
      {messages.map((message) => {
        const isUser = message.role === 'user';
        const status = isUser ? userBloomStatus?.[message.id] : undefined;
        const isEditing = isUser && edit?.messageId === message.id;
        return (
          <article key={message.id} className={cn('group/message flex gap-3', isUser && 'flex-row-reverse')}>
            <div className={cn('mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1', isUser ? 'bg-primary text-primary-foreground ring-primary/25' : 'bg-accent/18 text-foreground ring-accent/25')}>
              {isUser ? <User className="size-4" aria-hidden="true" /> : <Bot className="size-4" aria-hidden="true" />}
            </div>
            <div className={cn('max-w-[84%] space-y-2', isUser && 'items-end text-right')}>
              {status ? <BloomStatusBadge status={status} /> : null}
              {isEditing ? (
                <div className="w-[min(100%,34rem)] space-y-2 rounded-xl border border-primary/30 bg-card/95 p-3 text-left shadow-soft">
                  <textarea
                    autoFocus
                    value={edit.value}
                    onChange={(event) => onEditChange?.(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        onEditSubmit?.();
                      }
                      if (event.key === 'Escape') onEditCancel?.();
                    }}
                    rows={3}
                    className="w-full resize-y rounded-lg border border-border/70 bg-background/85 px-3 py-2 text-sm leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="编辑这条提问"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">发送后会替换这条提问，并删除它之后的回答。</p>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={onEditCancel}>
                        <X className="mr-1 size-3.5" aria-hidden="true" />
                        取消
                      </Button>
                      <Button type="button" size="sm" disabled={!edit.value.trim()} onClick={onEditSubmit}>
                        发送
                      </Button>
                    </div>
                  </div>
                </div>
              ) : isUser ? (
                /* 提问是学生自己的话：黛蓝实块，和回答在底色上就分得开。 */
                <Card className="border-0 bg-primary px-4 py-3 text-left text-primary-foreground">
                  <div className="space-y-2 text-sm">
                    {keyedParts(message.parts ?? []).map(({ key, part }) => <AIMessagePart key={`${message.id}-${key}`} part={part} />)}
                  </div>
                </Card>
              ) : (
                /* 回答是纸上的一段话，不装进卡片：卡片会把里面引用的原文压成又一层底。
                   引文靠楷体与朱丝栏自己站住（见 MarkdownContent 的 blockquote）。 */
                <div className={cn('px-0.5 py-0.5 text-left', assistantCardClassName)}>
                  <div className="space-y-2 text-sm">
                    {keyedParts(message.parts ?? []).map(({ key, part }) => <AIMessagePart key={`${message.id}-${key}`} part={part} markdown />)}
                  </div>
                </div>
              )}
              {isUser && canEditUserMessage && !isEditing && onEditStart ? (
                <button
                  type="button"
                  onClick={() => onEditStart(message.id, messageText(message))}
                  className="flex min-h-8 cursor-pointer items-center gap-1 self-end rounded-md px-1.5 text-xs text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover/message:opacity-100 sm:group-focus-within/message:opacity-100"
                  aria-label={`编辑这条提问：${messageText(message).slice(0, 20)}`}
                >
                  <Pencil className="size-3" aria-hidden="true" />
                  编辑并重问
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
