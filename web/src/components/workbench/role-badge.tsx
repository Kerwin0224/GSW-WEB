'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type Role = 'admin' | 'teacher' | 'student';

const roleConfig: Record<Role, { label: string; className: string }> = {
  admin: { label: '管理员', className: 'bg-secondary text-secondary-foreground' },
  teacher: { label: '教师', className: 'bg-bloom-2/15 text-foreground' },
  student: { label: '学生', className: 'bg-primary/10 text-primary' },
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const cfg = roleConfig[role];
  return (
    <Badge className={cn('font-heading text-xs', cfg.className, className)}>
      {cfg.label}
    </Badge>
  );
}
