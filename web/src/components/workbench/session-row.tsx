import Link from 'next/link';
import { MessageSquare, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';

type SessionSummary = { id: string; title: string; messageCount: number; updatedLabel: string };

/**
 * 会话行。项目内会话、其他会话、教师历史会话三处曾各抄一份同样的 JSX，
 * 只有会话链接的前缀和删除回调不同。收口到这里，改样式三处同时生效。
 */
export function SessionRow({ session, current, href, onDelete }: {
  session: SessionSummary;
  current: boolean;
  href: string;
  onDelete: () => void;
}) {
  return (
    <div className={cn('group/session flex min-h-11 items-start gap-1 rounded-lg text-xs text-muted-foreground transition-colors duration-200 hover:bg-muted focus-within:bg-muted', current && 'bg-primary/8 text-primary')}>
      <Link href={href} aria-current={current ? 'page' : undefined} className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-lg px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <MessageSquare className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">{session.title}</span>
          <span>{session.messageCount} 条消息 · {session.updatedLabel}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={onDelete}
        className="mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover/session:opacity-100 sm:group-focus-within/session:opacity-100"
        aria-label={`删除会话 ${session.title}`}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
