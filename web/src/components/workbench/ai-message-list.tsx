import { Bot, User } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BloomStatusBadge, type BloomStatus } from '@/components/workbench/bloom-status-badge';

interface MessageLike {
  id: string;
  role: string;
  parts?: unknown[];
}

function partText(part: unknown): string | null {
  if (!part || typeof part !== 'object') return null;
  const record = part as Record<string, unknown>;
  if (record.type === 'text' && typeof record.text === 'string') return record.text;
  return null;
}

function partType(part: unknown): string {
  if (!part || typeof part !== 'object') return 'unknown';
  const value = (part as Record<string, unknown>).type;
  return typeof value === 'string' ? value : 'unknown';
}

export function AIMessagePart({ part }: { part: unknown }) {
  const text = partText(part);
  if (text !== null) {
    return <div className="whitespace-pre-wrap leading-7" aria-live="polite">{text}</div>;
  }

  const type = partType(part);
  if (type.startsWith('tool-')) {
    return <div className="rounded-lg border border-border/60 bg-muted/70 px-3 py-2 text-xs text-muted-foreground">工具调用状态：{type.replace('tool-', '')}</div>;
  }
  if (type.includes('citation') || type.includes('retrieval')) {
    return <Badge variant="outline">检索 / 引用状态</Badge>;
  }
  if (type === 'data-teacher-revision') {
    return <Badge variant="outline">教师修订提示</Badge>;
  }
  if (type.includes('classification')) {
    return <Badge variant="outline">分类状态更新</Badge>;
  }
  return null;
}

export function AIMessageList({ messages, userBloomStatus }: { messages: MessageLike[]; userBloomStatus?: Record<string, BloomStatus> }) {
  return (
    <div className="space-y-5" aria-live="polite">
      {messages.map((message) => {
        const isUser = message.role === 'user';
        const status = isUser ? userBloomStatus?.[message.id] : undefined;
        return (
          <article key={message.id} className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
            <div className={cn('mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1', isUser ? 'bg-primary text-primary-foreground ring-primary/25' : 'bg-accent/18 text-foreground ring-accent/25')}>
              {isUser ? <User className="size-4" aria-hidden="true" /> : <Bot className="size-4" aria-hidden="true" />}
            </div>
            <div className={cn('max-w-[84%] space-y-2', isUser && 'items-end text-right')}>
              {status ? <BloomStatusBadge status={status} /> : null}
              <Card className={cn('px-4 py-3 text-left shadow-soft', isUser ? 'border-primary/20 bg-primary text-primary-foreground ring-primary/20' : 'border-border/60 bg-card/92')}>
                <div className="space-y-2 text-sm">
                  {(message.parts ?? []).map((part, index) => <AIMessagePart key={`${message.id}-${index}`} part={part} />)}
                </div>
              </Card>
            </div>
          </article>
        );
      })}
    </div>
  );
}
