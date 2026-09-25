'use client';

import type { CSSProperties } from 'react';

import { SPACE_COLOR_VALUES } from '@/lib/space-colors';
import type { SpaceColorKey } from '@/lib/supabase/database.types';
import { cn } from '@/lib/utils';

export type SpaceTabItem = {
  id: string;
  name: string;
  subject?: string | null;
  colorKey: SpaceColorKey;
  count?: number;
  hint?: string;
};

/**
 * 空间是学生端和教师端共同的一级作用域。
 * 用连续的“书脊”而不是一排同质 pill，让当前范围在页面上先被看见，再被操作。
 */
export function SpaceTabs({
  items,
  activeId,
  onSelect,
  ariaLabel = '学习空间',
  emptyLabel = '还没有可用空间',
}: {
  items: SpaceTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="border-y border-dashed border-border/70 bg-card/35 px-4 py-5 text-sm text-muted-foreground" role="status">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className="grid grid-cols-1 border-y border-border/70 bg-card/35 sm:grid-cols-2 lg:flex">
      {items.map((item) => {
        const active = item.id === activeId;
        const color = SPACE_COLOR_VALUES[item.colorKey];
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={item.hint ?? `${item.subject || '未设置科目'} · ${item.name}`}
            onClick={() => onSelect(item.id)}
            style={{ '--space-color': color, borderLeftColor: color } as CSSProperties}
            className={cn(
              'group relative min-h-16 cursor-pointer border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:border-r lg:min-w-14rem lg:flex-1 lg:border-b-0',
              active ? 'bg-primary/8 text-foreground' : 'text-muted-foreground hover:bg-muted/45 hover:text-foreground',
            )}
          >
            <span className="flex items-center justify-between gap-3 text-[0.68rem] font-medium tracking-wide text-muted-foreground">
              <span className="truncate">{item.subject || '未设置科目'}</span>
              {typeof item.count === 'number' ? <span className="font-mono text-[0.65rem]">{item.count}</span> : null}
            </span>
            <span className="mt-1 block truncate font-heading text-base font-semibold leading-tight">{item.name}</span>
            <span className={cn('absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[var(--space-color)] transition-transform', active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100')} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
