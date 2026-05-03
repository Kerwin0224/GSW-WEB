import { Plus, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { createClass, getAdminClasses } from '@/lib/data/admin';

export default async function AdminClassesPage() {
  const result = await getAdminClasses();
  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="班级关系加载失败" description={result.message} />
      </div>
    );
  }

  const classes = result.data as Array<{ id: string; name: string; grade: string | null; class_memberships?: unknown[] }>;
  const memberCount = classes.reduce((sum, klass) => sum + (klass.class_memberships?.length ?? 0), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="班级关系"
        title="把教师能看谁、学生归属谁说清楚。"
        description="班级关系是权限边界，不是表格装饰。教师工作台、审计队列和学情线索都从这里收敛范围。"
        metrics={[
          { label: '班级', value: classes.length, hint: '真实 classes' },
          { label: '成员关系', value: memberCount, hint: 'teacher / student membership' },
          { label: '导入', value: 'blocked', hint: 'CSV 校验服务接入后启用' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="创建班级"
          description="先建立真实班级，再分配教师和学生；导入前必须做行级校验预览。"
          action={<Button variant="outline" disabled><Upload className="mr-2 size-4" />导入预览需 CSV 解析服务</Button>}
        />
        <Card>
          <CardHeader><CardTitle>新建班级</CardTitle></CardHeader>
          <CardContent>
            <form action={createClass} className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="name">班级名称</Label>
                <Input id="name" name="name" placeholder="高一(3)班" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grade">年级</Label>
                <Input id="grade" name="grade" placeholder="高一" />
              </div>
              <Button type="submit" className="self-end"><Plus className="mr-2 size-4" />创建班级</Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {classes.length === 0 ? (
        <EmptyState title="暂无班级" description="创建真实班级并分配教师、学生后，教师权限才会按班级生效。" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((klass) => (
            <Card key={klass.id}>
              <CardContent className="p-4">
                <p className="font-medium">{klass.name}</p>
                <p className="text-sm text-muted-foreground">{klass.grade ?? '未设置年级'} · 成员 {klass.class_memberships?.length ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
