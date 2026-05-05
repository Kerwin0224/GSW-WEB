'use client';

import { Plus, Trash2, UsersRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { addClassMember, removeClassMember, type AdminClassListItem, type AdminUserListItem } from '@/lib/data/admin';

type AdminClassMembersDialogProps = {
  klass: AdminClassListItem;
  users: AdminUserListItem[];
};

function MemberList({ members, roleLabel }: { members: AdminClassListItem['teachers']; roleLabel: string }) {
  if (members.length === 0) {
    return <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">暂无{roleLabel}成员。</p>;
  }
  return (
    <div className="space-y-2">
      {members.map((member) => (
        <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background/70 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{member.profile?.displayName ?? '未命名账号'}</p>
            <p className="font-mono text-xs text-muted-foreground">{member.profile?.loginId ?? '未设置账号'} · {new Date(member.createdAt).toLocaleString('zh-CN')}</p>
          </div>
          <form action={removeClassMember}>
            <input type="hidden" name="membership_id" value={member.id} />
            <Button type="submit" variant="outline" size="sm">
              <Trash2 className="mr-1 size-3.5" />
              移除
            </Button>
          </form>
        </div>
      ))}
    </div>
  );
}

function AddMemberForm({ klass, users, role }: { klass: AdminClassListItem; users: AdminUserListItem[]; role: 'teacher' | 'student' }) {
  const roleLabel = role === 'teacher' ? '教师' : '学生';
  return (
    <form action={addClassMember} className="space-y-3 rounded-xl border bg-background/70 p-4">
      <input type="hidden" name="class_id" value={klass.id} />
      <input type="hidden" name="role" value={role} />
      <div className="space-y-2">
        <Label htmlFor={`${klass.id}-${role}-profile`}>添加{roleLabel}账号</Label>
        <Input id={`${klass.id}-${role}-profile`} name="profile_id" list={`${klass.id}-${role}-profiles`} placeholder="输入或选择 profile id" required />
        <datalist id={`${klass.id}-${role}-profiles`}>
          {users.filter((user) => user.role === role).map((user) => (
            <option key={user.id} value={user.id}>{user.displayName} · {user.loginId ?? '未设置账号'} · {user.assignmentSummary}</option>
          ))}
        </datalist>
      </div>
      {role === 'student' ? (
        <p className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs text-primary">
          学生将从原班级迁入当前班级；系统会自动移除该学生原有班级关系。
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">教师可以负责多个班级；重复加入同一班级会被忽略。</p>
      )}
      <Button type="submit" className="w-full">
        <Plus className="mr-2 size-4" />
        添加{roleLabel}
      </Button>
    </form>
  );
}

export function AdminClassMembersDialog({ klass, users }: AdminClassMembersDialogProps) {
  return (
    <AdminDialogShell
      trigger={(
        <Button type="button" variant="outline" className="w-full">
          <UsersRound className="mr-2 size-4" />
          成员分配
        </Button>
      )}
      title={`${klass.name} · 成员分配`}
      description="在班级上下文中查看当前成员、添加账号或移除已有成员。"
      icon={<UsersRound className="size-5" />}
      className="max-w-4xl"
    >
      <Tabs defaultValue="teachers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="teachers">教师 <Badge variant="outline">{klass.teachers.length}</Badge></TabsTrigger>
          <TabsTrigger value="students">学生 <Badge variant="outline">{klass.students.length}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value="teachers" className="space-y-4">
          {klass.teachers.length === 1 ? (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">移除后该班级暂无负责教师，教师看板和教学正确性核实范围会受影响。</p>
          ) : null}
          <AddMemberForm klass={klass} users={users} role="teacher" />
          <ScrollArea className="max-h-80 pr-3">
            <MemberList members={klass.teachers} roleLabel="教师" />
          </ScrollArea>
        </TabsContent>
        <TabsContent value="students" className="space-y-4">
          <AddMemberForm klass={klass} users={users} role="student" />
          <ScrollArea className="max-h-80 pr-3">
            <MemberList members={klass.students} roleLabel="学生" />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </AdminDialogShell>
  );
}
