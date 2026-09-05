import { Upload } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { AdminClassCreateForm } from '@/components/workbench/admin-class-create-form';
import { AdminClassMembersDialog } from '@/components/workbench/admin-class-members-dialog';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getAdminClasses, getAdminUsers } from '@/lib/data/admin';

export default async function AdminClassesPage() {
  const [classResult, userResult] = await Promise.all([getAdminClasses(), getAdminUsers()]);
  if (!classResult.ok) {
    return (
      <div className="p-6">
        <ErrorState title="班级成员管理加载失败" description={classResult.message} />
      </div>
    );
  }
  if (!userResult.ok) {
    return (
      <div className="p-6">
        <ErrorState title="成员账号加载失败" description={userResult.message} />
      </div>
    );
  }

  const { classes, duplicateGroups } = classResult.data;
  const users = userResult.data;
  const teacherCount = classes.reduce((sum, klass) => sum + klass.teachers.length, 0);
  const studentCount = classes.reduce((sum, klass) => sum + klass.students.length, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="班级成员管理"
        title="把教师能看谁、学生属于哪个班级说清楚。"
        description="班级成员管理是教师权限边界。教师看板、学习记录核实和班级分析都从这里收敛到真实班级范围。"
        metrics={[
          { label: '班级', value: classes.length, hint: '真实 classes' },
          { label: '教师成员分配', value: teacherCount, hint: '教师可负责多个班级' },
          { label: '学生成员分配', value: studentCount, hint: '学生自动迁班保持单班级' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="创建班级"
          description="先建立真实班级，再通过成员分配弹窗添加教师和学生；学生加入新班级时自动迁班。"
          action={<Button variant="outline" disabled><Upload className="mr-2 size-4" />批量班级导入暂未开放</Button>}
        />
        <Card>
          <CardHeader><CardTitle>新建班级</CardTitle></CardHeader>
          <CardContent>
            <AdminClassCreateForm />
          </CardContent>
        </Card>
      </section>

      {duplicateGroups.length > 0 ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader><CardTitle>发现重复班级名称</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>以下班级来自现有数据，请先确认后再继续分配成员；新建班级已阻止同名创建。</p>
            <div className="flex flex-wrap gap-2">
              {duplicateGroups.map((group) => (
                <Badge key={group.name} variant="destructive">{group.name} × {group.count}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {classes.length === 0 ? (
        <EmptyState title="暂无班级" description="创建真实班级并分配教师、学生后，教师权限才会按班级生效。" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((klass) => (
            <Card key={klass.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="font-heading">{klass.name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{klass.grade ?? '未设置年级'} · 成员 {klass.memberCount}</p>
                  </div>
                  <Badge variant={klass.status === 'active' ? 'secondary' : 'outline'}>{klass.status === 'active' ? '启用' : '归档'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border bg-background/70 p-3">
                    <p className="text-muted-foreground">负责教师</p>
                    <p className="mt-1 text-2xl font-semibold">{klass.teachers.length}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{klass.teachers[0]?.profile?.displayName ?? '暂无负责教师'}</p>
                  </div>
                  <div className="rounded-lg border bg-background/70 p-3">
                    <p className="text-muted-foreground">学生</p>
                    <p className="mt-1 text-2xl font-semibold">{klass.students.length}</p>
                    <p className="mt-1 text-xs text-muted-foreground">单班级归属</p>
                  </div>
                </div>
                {klass.teachers.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">该班级暂无负责教师，教师看板和学习记录核实范围会受影响。</p>
                ) : null}
                <AdminClassMembersDialog
                  klass={klass}
                  users={users}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
