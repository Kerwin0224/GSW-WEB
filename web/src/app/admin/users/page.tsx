import Link from 'next/link';
import { Filter, Search, ShieldCheck, UsersRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { UserImportDialog } from '@/components/workbench/user-import-dialog';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getAdminUsers, type AdminProfileStatus } from '@/lib/data/admin';
import type { AppRole } from '@/lib/supabase/database.types';

type AdminUsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseRole(value: string | undefined): AppRole | 'all' {
  return value === 'admin' || value === 'teacher' || value === 'student' ? value : 'all';
}

function parseStatus(value: string | undefined): AdminProfileStatus | 'all' {
  return value === 'active' || value === 'disabled' ? value : 'all';
}

function roleLabel(role: AppRole) {
  return { admin: '管理员', teacher: '教师', student: '学生' }[role];
}

function statusLabel(status: AdminProfileStatus) {
  return status === 'active' ? '启用' : '停用';
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = await searchParams;
  const filters = {
    query: firstParam(params.q) ?? '',
    role: parseRole(firstParam(params.role)),
    status: parseStatus(firstParam(params.status)),
  };
  const result = await getAdminUsers(filters);

  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="用户管理加载失败" description={result.message} />
      </div>
    );
  }

  const users = result.data;
  const activeCount = users.filter((user) => user.status === 'active').length;
  const teacherCount = users.filter((user) => user.role === 'teacher').length;
  const studentCount = users.filter((user) => user.role === 'student').length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="用户管理"
        title="学校账号、角色、状态与班级归属一页看清。"
        description="用户管理页基于真实 profiles 与 class_memberships 展示；CSV 导入必须先预览校验，再提交有效账号。"
        primaryAction={{ label: '查看班级关系', href: '/admin/classes' }}
        metrics={[
          { label: '筛选结果', value: users.length, hint: '匹配当前条件' },
          { label: '启用账号', value: activeCount, hint: 'active profiles' },
          { label: '教师/学生', value: `${teacherCount}/${studentCount}`, hint: '角色分布' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="账号筛选与导入"
          description="支持按姓名或学校账号搜索，按角色与状态筛选；导入入口复用同一套 CSV 预览与提交流程。"
          action={(
            <UserImportDialog />
          )}
        />
        <Card>
          <CardContent className="p-4">
            <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]" action="/admin/users">
              <div className="space-y-2">
                <Label htmlFor="q">姓名 / 账号搜索</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="q" name="q" defaultValue={filters.query} placeholder="输入姓名、学校账号或班级摘要" className="pl-8" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">角色</Label>
                <Select name="role" defaultValue={filters.role}>
                  <SelectTrigger id="role" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部角色</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                    <SelectItem value="teacher">教师</SelectItem>
                    <SelectItem value="student">学生</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">状态</Label>
                <Select name="status" defaultValue={filters.status}>
                  <SelectTrigger id="status" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="active">启用</SelectItem>
                    <SelectItem value="disabled">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" className="flex-1 lg:flex-none"><Filter className="mr-2 size-4" />应用筛选</Button>
                <Button nativeButton={false} render={<Link href="/admin/users">重置</Link>} variant="outline" />
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersRound className="size-5 text-primary" />
            学校账号列表
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <EmptyState title="没有匹配账号" description="调整筛选条件，或通过 CSV 导入真实学校账号。" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>账号</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>班级归属</TableHead>
                  <TableHead>最近管理活动</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.displayName}</TableCell>
                    <TableCell className="font-mono text-xs">{user.loginId ?? '未设置账号'}</TableCell>
                    <TableCell><Badge variant="outline">{roleLabel(user.role)}</Badge></TableCell>
                    <TableCell><Badge variant={user.status === 'active' ? 'secondary' : 'destructive'}>{statusLabel(user.status)}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.assignmentSummary}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{user.recentActivityLabel}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" />管理边界</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">本页只做账号可视化、CSV 导入、角色/状态/活动信息展示与班级归属入口，不提供在线改角色或停用账号。</CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>班级归属规则</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">教师可负责多个班级；学生只允许属于一个班级。需要调整学生班级时，请在班级关系页使用成员分配完成自动迁班。</CardContent>
        </Card>
      </section>
    </div>
  );
}
