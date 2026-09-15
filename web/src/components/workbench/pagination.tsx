import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export { parsePageParam } from '@/lib/pagination';

/**
 * 服务端分页条。页码放在 URL（searchParam）里，天然可分享、可前进后退，
 * 不需要客户端状态；翻页是一次 RSC 导航，数据在服务端按页取。
 *
 * 只管渲染：total / pageSize 由调用方给出，href 由调用方构造（带上各自的筛选参数），
 * 所以学生端带 q/status 的列表和管理端带 role/status 的列表能复用同一个组件。
 */
export function Pagination({
  page,
  pageSize,
  total,
  buildHref,
  className,
  itemLabel = '条',
}: {
  page: number;
  pageSize: number;
  total: number;
  /** 生成第 n 页的链接；调用方负责带上自己的筛选参数。 */
  buildHref: (page: number) => string;
  className?: string;
  itemLabel?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const current = Math.min(Math.max(page, 1), pageCount);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const linkClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer gap-1');

  return (
    <nav className={cn('flex flex-wrap items-center justify-between gap-3', className)} aria-label="分页">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        第 {from}–{to} {itemLabel}，共 {total} {itemLabel} · 第 {current}/{pageCount} 页
      </p>
      <div className="flex items-center gap-2">
        {current > 1 ? (
          <Link href={buildHref(current - 1)} rel="prev" className={linkClass}>
            <ChevronLeft className="size-4" aria-hidden="true" />上一页
          </Link>
        ) : (
          <span className={cn(linkClass, 'pointer-events-none opacity-50')} aria-disabled="true">
            <ChevronLeft className="size-4" aria-hidden="true" />上一页
          </span>
        )}
        {current < pageCount ? (
          <Link href={buildHref(current + 1)} rel="next" className={linkClass}>
            下一页<ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className={cn(linkClass, 'pointer-events-none opacity-50')} aria-disabled="true">
            下一页<ChevronRight className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
