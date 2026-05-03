import type { ReactNode } from 'react';

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
    <section className={cn('relative overflow-hidden rounded-[2rem] border bg-card shadow-sm', className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(74,111,165,0.18),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(183,165,122,0.18),transparent_34%)]" />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.25fr_0.75fr] lg:p-10">
        <div className="space-y-6">
          <Badge variant="outline" className="bg-background/70 text-foreground">{eyebrow}</Badge>
          <div className="space-y-3">
            <h1 className="max-w-3xl font-heading text-4xl leading-tight tracking-tight sm:text-5xl">{title}</h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">{description}</p>
          </div>
          {(primaryAction || secondaryAction) ? (
            <div className="flex flex-wrap gap-3">
              {primaryAction ? <Button render={<a href={primaryAction.href}>{primaryAction.label}</a>} size="lg" variant={primaryAction.variant ?? 'default'} /> : null}
              {secondaryAction ? <Button render={<a href={secondaryAction.href}>{secondaryAction.label}</a>} size="lg" variant={secondaryAction.variant ?? 'outline'} /> : null}
            </div>
          ) : null}
        </div>
        <div className="grid gap-3 self-end sm:grid-cols-3 lg:grid-cols-1">
          {metrics.map((metric) => (
            <Card key={metric.label} className="bg-background/75 backdrop-blur">
              <CardContent className="space-y-1 p-4">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="text-3xl font-semibold tracking-tight">{metric.value}</p>
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
      <div className="space-y-1">
        {eyebrow ? <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary">{eyebrow}</p> : null}
        <h2 className="font-heading text-2xl tracking-tight">{title}</h2>
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
    <Card className="bg-card/85">
      <CardContent className="flex gap-4 p-5">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1', accentClass)}>{index}</span>
        <div className="space-y-1">
          <h3 className="font-heading text-lg">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
