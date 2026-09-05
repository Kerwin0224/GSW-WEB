import type { ReactNode } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type WorkspaceHeroMetric = {
  label: string;
  value: string | number;
  hint: string;
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
  eyebrow: string;
  title: string;
  description: string;
  primaryAction?: WorkspaceHeroAction;
  secondaryAction?: WorkspaceHeroAction;
  metrics?: WorkspaceHeroMetric[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('relative overflow-hidden rounded-lg border border-primary/15 bg-card/94 shadow-soft', className)}>
      {/* 单一主色浸染，不再叠重复网格，避免和 body 网格竞争。 */}
      <div className="pointer-events-none absolute -top-24 -left-16 size-80 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 size-96 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" aria-hidden="true" />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:p-10 xl:p-12">
        <div className="space-y-6">
          <Badge variant="outline" className="w-fit border-primary/25 bg-background/85 px-3 py-1 text-primary shadow-sm">{eyebrow}</Badge>
          <div className="space-y-4">
            <h1 className="max-w-3xl font-heading text-4xl leading-tight tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem]">{title}</h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">{description}</p>
          </div>
          {(primaryAction || secondaryAction) ? (
            <div className="flex flex-wrap gap-3">
              {primaryAction ? <Button nativeButton={false} render={<Link href={primaryAction.href}>{primaryAction.label}</Link>} size="lg" variant={primaryAction.variant ?? 'default'} className="min-h-11 cursor-pointer rounded-lg px-6 shadow-ink" /> : null}
              {secondaryAction ? <Button nativeButton={false} render={<Link href={secondaryAction.href}>{secondaryAction.label}</Link>} size="lg" variant={secondaryAction.variant ?? 'outline'} className="min-h-11 cursor-pointer rounded-lg bg-background/80 px-6" /> : null}
            </div>
          ) : null}
        </div>
        <div className="grid gap-3 self-end sm:grid-cols-3 lg:grid-cols-1">
          {metrics.map((metric) => (
            <Card key={metric.label} className="border-border/60 bg-background/85 shadow-soft transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-background hover:shadow-ink">
              <CardContent className="space-y-1.5 p-4">
                <p className="text-xs font-medium tracking-wide text-muted-foreground">{metric.label}</p>
                <p className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">{metric.value}</p>
                <p className="text-xs leading-5 text-muted-foreground">{metric.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {children ? <div className="lg:col-span-2">{children}</div> : null}
      </div>
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
        <h2 className="font-heading text-2xl tracking-tight sm:text-3xl">{title}</h2>
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
