import type { ReactNode } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type WorkspaceHeroMetric = {
  label: string;
  value: string | number;
  hint?: string;
};

export type WorkspaceHeroAction = {
  label: string;
  href: string;
  variant?: 'default' | 'outline' | 'secondary';
};

export function WorkspaceHero({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  metrics = [],
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  primaryAction?: WorkspaceHeroAction;
  secondaryAction?: WorkspaceHeroAction;
  metrics?: WorkspaceHeroMetric[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-5 border-b border-border/70 pb-6', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow && eyebrow !== title ? <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p> : null}
          <div className="space-y-2">
            <h1 className="max-w-3xl text-balance font-sans text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">{title}</h1>
            {description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {(primaryAction || secondaryAction) ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {primaryAction ? <Button nativeButton={false} render={<Link href={primaryAction.href}>{primaryAction.label}</Link>} variant={primaryAction.variant ?? 'default'} className="min-h-11 cursor-pointer px-4" /> : null}
            {secondaryAction ? <Button nativeButton={false} render={<Link href={secondaryAction.href}>{secondaryAction.label}</Link>} variant={secondaryAction.variant ?? 'outline'} className="min-h-11 cursor-pointer px-4" /> : null}
          </div>
        ) : null}
      </div>
      {metrics.length > 0 ? (
        /* 指标是"并排读数"，不是四张卡片：界格竖线分栏，桌面四栏以内自动换行。
           视觉结构承担分组，于是整块不需要边框、底色和阴影。 */
        <dl className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-0 sm:[&>*:not(:first-child)]:border-l sm:[&>*:not(:first-child)]:border-border/60 sm:[&>*:not(:first-child)]:pl-6 lg:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 space-y-1">
              <dt className="text-sm text-muted-foreground">{metric.label}</dt>
              <dd className="break-words text-2xl font-semibold tracking-tight text-foreground tabular-nums">{metric.value}</dd>
              {metric.hint ? <dd className="text-xs leading-5 text-muted-foreground">{metric.hint}</dd> : null}
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {eyebrow ? <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p> : null}
        <h2 className="font-sans text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
        {description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
