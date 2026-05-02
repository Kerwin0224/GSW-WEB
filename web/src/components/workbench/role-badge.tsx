'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type Role = 'admin' | 'teacher' | 'student';

const roleConfig: Record<Role, { label: string; className: string }> = {
  admin: { label: '管理员', className: 'bg-[hsl(var(--destructive))] text-white hover:bg-[hsl(var(--destructive))]' },
  teacher: { label: '教师', className: 'bg-[hsl(var(--bloom-2))] text-white hover:bg-[hsl(var(--bloom-2))]' },
  student: { label: '学生', className: 'bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary))]' },
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const cfg = roleConfig[role];
  return (
    <Badge className={cn('font-heading text-xs', cfg.className, className)}>
      {cfg.label}
    </Badge>
  );
}
