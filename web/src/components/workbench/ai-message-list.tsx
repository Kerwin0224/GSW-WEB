import { Bot, Pencil, User, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BloomStatusBadge, type BloomStatus } from '@/components/workbench/bloom-status-badge';
import { MarkdownContent } from '@/components/workbench/markdown-content';

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
  if (type.startsWith('tool-')) {
    return <div className="rounded-lg border border-border/60 bg-muted/70 px-3 py-2 text-xs text-muted-foreground">工具调用状态：{type.replace('tool-', '')}</div>;
  }
  if (type.includes('citation') || type.includes('retrieval')) {
    return <Badge variant="outline">检索 / 引用状态</Badge>;
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
    return <Badge variant="outline">提问类型已更新</Badge>;
  }
  return null;
}

function keyedParts(parts: unknown[]) {
  const occurrences = new Map<string, number>();
  return parts.map((part) => {
    const type = partType(part);
    const occurrence = occurrences.get(type) ?? 0;
    occurrences.set(type, occurrence + 1);
    return { key: `${type}-${occurrence}`, part };
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
            <div className={cn('mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1', isUser ? 'bg-primary text-primary-foreground ring-primary/25' : 'bg-accent/18 text-foreground ring-accent/25')}>
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
                    <p className="text-xs text-muted-foreground">发送后会回滚到这条提问并重写之后的对话。</p>
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
              ) : (
                <Card className={cn('px-4 py-3 text-left shadow-soft', isUser ? 'border-primary/20 bg-primary text-primary-foreground ring-primary/20' : 'border-border/60 bg-card/92', !isUser && assistantCardClassName)}>
                  <div className="space-y-2 text-sm">
                    {keyedParts(message.parts ?? []).map(({ key, part }) => <AIMessagePart key={`${message.id}-${key}`} part={part} markdown={!isUser} />)}
                  </div>
                </Card>
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
