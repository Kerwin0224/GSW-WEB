'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { SPACE_COLOR_VALUES } from '@/lib/space-colors';
import type { SpaceColorKey } from '@/lib/supabase/database.types';
import { cn } from '@/lib/utils';

export type SpaceDirectoryItem = {
  id: string;
  name: string;
  subject?: string | null;
  colorKey: SpaceColorKey;
  kind?: 'term' | 'topic';
  count?: number;
  hint?: string;
};

function groupBySubject(items: SpaceDirectoryItem[]) {
  const groups = new Map<string, SpaceDirectoryItem[]>();
  for (const item of items) {
    const subject = item.subject?.trim() || '未设置科目';
    const group = groups.get(subject) ?? [];
    group.push(item);
    groups.set(subject, group);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN'));
}

/** 空间数量增长后仍可扫描的目录：先按科目分组，再按书脊色定位。 */
export function SpaceDirectory({
  items,
  activeId,
  onSelect,
  ariaLabel = '学习空间目录',
  emptyLabel = '还没有可用空间',
}: {
  items: SpaceDirectoryItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const filteredItems = useMemo(
    () => normalizedQuery
      ? items.filter((item) => `${item.subject ?? ''} ${item.name} ${item.hint ?? ''}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
      : items,
    [items, normalizedQuery],
  );
  const groups = groupBySubject(filteredItems);

  return (
    <section className="border-y border-border/70 bg-card/35" aria-label={ariaLabel}>
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <label htmlFor={`${ariaLabel}-search`} className="sr-only">搜索空间</label>
        <input
          id={`${ariaLabel}-search`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索科目或空间"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
        <span className="font-mono text-[0.65rem] text-muted-foreground">{items.length}</span>
      </div>
      {groups.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground" role="status">{items.length === 0 ? emptyLabel : '没有匹配的空间'}</p>
      ) : (
        <div role="tablist" aria-label={ariaLabel} className="max-h-72 overflow-y-auto">
          {groups.map(([subject, subjectItems]) => (
            <section key={subject} aria-label={subject} className="border-b border-border/50 last:border-b-0">
              <h3 className="sticky top-0 z-10 bg-card/92 px-4 py-2 text-[0.68rem] font-medium tracking-wide text-muted-foreground backdrop-blur">{subject}</h3>
              <div className="pb-1">
                {subjectItems.map((item) => {
                  const active = item.id === activeId;
                  const color = SPACE_COLOR_VALUES[item.colorKey];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      title={item.hint ?? `${subject} · ${item.name}`}
                      onClick={() => onSelect(item.id)}
                      style={{ borderLeftColor: color }}
                      className={cn(
                        'group flex min-h-12 w-full cursor-pointer items-center gap-3 border-l-[3px] border-t border-transparent px-4 py-2 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                        active ? 'bg-primary/8 text-foreground' : 'text-muted-foreground hover:bg-muted/45 hover:text-foreground',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.name}</span>
                        {item.hint ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.hint}</span> : null}
                      </span>
                      {typeof item.count === 'number' ? <span className="font-mono text-xs text-muted-foreground">{item.count}</span> : null}
                      {item.kind ? <span className="shrink-0 border border-border/60 px-1.5 py-0.5 text-[0.62rem] text-muted-foreground">{item.kind === 'topic' ? '专题' : '学期'}</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
