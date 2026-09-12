'use client';

import { useState, useTransition } from 'react';
import { Loader2, UserPlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSchoolAdmin, renameSchool, type OrgSchoolClass, type OrgSchoolUser } from '@/lib/data/org';

type SchoolInfo = { id: string; name: string; status: 'active' | 'disabled'; createdAt: string };

export function SchoolDetailClient({ school, users, classes }: {
  school: SchoolInfo;
  users: OrgSchoolUser[];
  classes: OrgSchoolClass[];
}) {
  const [feedback, setFeedback] = useState('');
  const [pending, startTransition] = useTransition();

  const submitAction = (action: (formData: FormData) => Promise<{ ok: boolean; message: string }>) => {
    return (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(async () => {
        const result = await action(formData);
        setFeedback(result.message);
      });
    };
  };

  const submitRename = submitAction((formData) => renameSchool(formData));

  const submitCreateAdmin = submitAction((formData) => createSchoolAdmin(formData));

  return (
    <div className="space-y-6">
      {feedback ? <p className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm" role="status" aria-live="polite">{feedback}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-lg">学校信息</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitRename} className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="school-name" className="text-sm font-medium">学校名称</Label>
                <Input id="school-name" name="name" defaultValue={school.name} maxLength={60} required />
              </div>
              <input type="hidden" name="schoolId" value={school.id} />
              <Button type="submit" variant="outline" disabled={pending} className="min-h-10">保存更名</Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">状态：{school.status === 'active' ? '运行中（启用/停用在总览页操作）' : '已停用'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-lg">新任学校管理员</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitCreateAdmin} className="space-y-3">
              <input type="hidden" name="schoolId" value={school.id} />
              <div className="space-y-1.5">
                <Label htmlFor="admin-login" className="text-sm font-medium">工号（8 位数字，初始密码）</Label>
                <Input id="admin-login" name="loginId" inputMode="numeric" pattern="\d{8}" placeholder="如 20180002" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-name" className="text-sm font-medium">姓名</Label>
                <Input id="admin-name" name="displayName" placeholder="如：顾清晏" maxLength={40} required />
              </div>
              <Button type="submit" disabled={pending} className="min-h-10">
                {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <UserPlus className="mr-1 size-4" />}
                创建校管理员
              </Button>
              <p className="text-xs text-muted-foreground">创建后请把工号告知对方；其首次登录需用工号作密码登录并设置新密码。</p>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-lg">成员账号（{users.length}）</CardTitle>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无成员。请校管理员导入名册，或先在上面创建校管理员。</p>
            ) : (
              <ul className="divide-y divide-border/60 text-sm">
                {users.map((user) => (
                  <li key={user.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{user.displayName}</span>
                      <span className="text-xs text-muted-foreground">{user.loginId ?? '—'}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge variant="outline" className="text-xs">{user.role === 'admin' ? '校管理员' : user.role === 'teacher' ? '教师' : '学生'}</Badge>
                      {user.mustChangePassword ? <Badge variant="secondary" className="text-xs">待改密</Badge> : null}
                      {user.status === 'disabled' ? <Badge variant="destructive" className="text-xs">停用</Badge> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-lg">班级（{classes.length}）</CardTitle>
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无班级。班级与师生绑定由校管理员在班级管理里维护。</p>
            ) : (
              <ul className="divide-y divide-border/60 text-sm">
                {classes.map((klass) => (
                  <li key={klass.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate font-medium">{klass.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {klass.grade ? <span>{klass.grade}</span> : null}
                      <Badge variant="outline" className="text-xs">{klass.status === 'active' ? '在读' : '已归档'}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
