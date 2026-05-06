import type { ReactNode } from 'react';
import { AlertCircle, Ban, Inbox, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SurfaceProps {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: SurfaceProps) {
  return (
    <Card className={cn('overflow-hidden border-dashed border-primary/25 bg-card/86 shadow-soft backdrop-blur', className)}>
      <CardContent className="relative flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />
        <span className="flex size-16 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 shadow-sm">
          <Inbox className="size-7" aria-hidden="true" />
        </span>
        <div className="space-y-1.5">
          <h2 className="font-heading text-xl">{title}</h2>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="pt-2">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function BlockedState({ title, description, action, className }: SurfaceProps) {
  return (
    <Alert className={cn('border-destructive/30 bg-destructive/8 shadow-soft backdrop-blur', className)} role="alert">
      <Ban className="size-4" aria-hidden="true" />
      <AlertTitle className="font-heading">{title}</AlertTitle>
      <AlertDescription className="mt-1 flex flex-col gap-3 text-sm">
        <span>{description}</span>
        {action ? <span>{action}</span> : null}
      </AlertDescription>
    </Alert>
  );
}

export function ErrorState({ title, description, action, className }: SurfaceProps) {
  return (
    <Alert variant="destructive" className={className} role="alert">
      <AlertCircle className="size-4" aria-hidden="true" />
      <AlertTitle className="font-heading">{title}</AlertTitle>
      <AlertDescription className="mt-1 flex flex-col gap-3 text-sm">
        <span>{description}</span>
        {action ? <span>{action}</span> : null}
      </AlertDescription>
    </Alert>
  );
}

export function LoadingSurface({ label = '正在加载工作台', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('space-y-4 rounded-lg border bg-card/86 p-6 shadow-soft backdrop-blur', className)} aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-40 rounded-lg" />
    </div>
  );
}

export function PermissionState({ title, description, action, className }: SurfaceProps) {
  return (
    <Alert className={cn('border-primary/30 bg-primary/8 shadow-soft backdrop-blur', className)} role="alert">
      <Ban className="size-4" aria-hidden="true" />
      <AlertTitle className="font-heading">{title}</AlertTitle>
      <AlertDescription className="mt-1 flex flex-col gap-3 text-sm">
        <span>{description}</span>
        {action ? <span>{action}</span> : null}
      </AlertDescription>
    </Alert>
  );
}

export function SuccessState({ title, description, action, className }: SurfaceProps) {
  return (
    <Alert className={cn('border-primary/30 bg-primary/8 shadow-soft backdrop-blur', className)} role="status">
      <Inbox className="size-4" aria-hidden="true" />
      <AlertTitle className="font-heading">{title}</AlertTitle>
      <AlertDescription className="mt-1 flex flex-col gap-3 text-sm">
        <span>{description}</span>
        {action ? <span>{action}</span> : null}
      </AlertDescription>
    </Alert>
  );
}

export function InlineActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button nativeButton={false} render={<Link href={href}>{children}</Link>} size="sm" variant="outline" className="cursor-pointer rounded-lg" />
  );
}
