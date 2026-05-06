'use client';

import type { ReactElement, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type AdminDialogShellProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactElement;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function AdminDialogShell({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  icon,
  children,
  footer,
  className = 'max-w-2xl',
}: AdminDialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal="trap-focus">
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

export function AdminDialogCancelButton({ onClick }: { onClick?: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick}>
      取消
    </Button>
  );
}
