'use client';

import { useMemo, useState, useTransition } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { resetInitialPasswords, type AdminUserListItem } from '@/lib/data/admin';
import type { AppRole } from '@/lib/supabase/database.types';

function roleLabel(role: AppRole) {
  return { org_admin: '公司管理员', admin: '管理员', teacher: '教师', student: '学生' }[role];
}

function statusLabel(status: AdminUserListItem['status']) {
  return status === 'active' ? '启用' : '停用';
}

/**
 * 只有教师和学生能批量重置：管理员账号批量重置有把自己锁在门外的风险，
 * 且不属于本页"帮学生/教师恢复初始密码"的诉求。
 */
function isResettable(user: AdminUserListItem) {
  return (user.role === 'teacher' || user.role === 'student') && user.loginId !== null;
}

export function AdminUsersTable({ users }: { users: AdminUserListItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const resettableUsers = useMemo(() => users.filter(isResettable), [users]);
  const selectedUsers = useMemo(() => users.filter((user) => selected.has(user.id)), [users, selected]);
  const allSelected = resettableUsers.length > 0 && resettableUsers.every((user) => selected.has(user.id));

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(resettableUsers.map((user) => user.id)));
  };

  const confirmReset = () => {
    const ids = selectedUsers.map((user) => user.id);
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await resetInitialPasswords(ids);
      if (result.ok) {
        toast.success(result.message);
        setSelected(new Set());
        setDialogOpen(false);
        return;
      }
      toast.error(result.message);
    });
  };

  return (
    <>
      {selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/8 px-4 py-3">
          <p className="text-sm text-primary">已选择 {selected.size} 个账号</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setSelected(new Set())}>取消选择</Button>
            <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
              <KeyRound className="mr-1.5 size-4" aria-hidden="true" />
              批量恢复初始密码
            </Button>
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                disabled={resettableUsers.length === 0}
                aria-label="全选可重置账号（教师与学生）"
              />
            </TableHead>
            <TableHead>姓名</TableHead>
            <TableHead>账号</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>班级归属</TableHead>
            <TableHead>最近管理活动</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const resettable = isResettable(user);
            return (
              <TableRow key={user.id} data-state={selected.has(user.id) ? 'selected' : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(user.id)}
                    onCheckedChange={() => toggleOne(user.id)}
                    disabled={!resettable}
                    aria-label={resettable ? `选择 ${user.displayName}` : `${user.displayName} 不支持批量重置`}
                  />
                </TableCell>
                <TableCell className="font-medium">{user.displayName}</TableCell>
                <TableCell className="font-mono text-xs">{user.loginId ?? '未设置账号'}</TableCell>
                <TableCell><Badge variant="outline">{roleLabel(user.role)}</Badge></TableCell>
                <TableCell><Badge variant={user.status === 'active' ? 'secondary' : 'destructive'}>{statusLabel(user.status)}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{user.assignmentSummary}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{user.recentActivityLabel}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AdminDialogShell
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="批量恢复初始密码"
        description="恢复后，这些账号的密码会变回各自的学号/工号，并在下次登录时被强制改密。请确认名单无误。"
        icon={<KeyRound className="size-5" />}
        footer={(
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>取消</Button>
            <Button type="button" onClick={confirmReset} disabled={pending}>
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              确认恢复 {selectedUsers.length} 个账号
            </Button>
          </div>
        )}
      >
        <ul className="divide-y rounded-lg border">
          {selectedUsers.map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-medium">{user.displayName}</span>
              <span className="font-mono text-xs text-muted-foreground">{user.loginId}</span>
            </li>
          ))}
        </ul>
      </AdminDialogShell>
    </>
  );
}
