import type { ReactNode } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
        <dl className="grid grid-cols-1 gap-4 rounded-lg border border-border/70 bg-card p-4 sm:grid-cols-3 sm:gap-6 sm:p-5">
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
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{eyebrow}</p> : null}
        <h2 className="font-sans text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
        {description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PrincipleCard({
  index,
  title,
  description,
  accent = 'primary',
}: {
  index: string;
  title: string;
  description: string;
  accent?: 'primary' | 'gold' | 'cinnabar';
}) {
  const accentClass = {
    primary: 'bg-primary/10 text-primary ring-primary/20',
    gold: 'bg-accent/15 text-foreground ring-accent/30',
    cinnabar: 'bg-destructive/10 text-destructive ring-destructive/20',
  }[accent];

  return (
    <Card className="border-border/70 bg-card/86 shadow-sm transition-colors hover:border-primary/25 hover:bg-card">
      <CardContent className="flex gap-4 p-5">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ring-1 shadow-sm', accentClass)}>{index}</span>
        <div className="space-y-1">
          <h3 className="font-heading text-lg">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
