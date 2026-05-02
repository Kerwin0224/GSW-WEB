import { Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { createClass, getAdminClasses } from '@/lib/data/admin';

export default async function AdminClassesPage() {
  const result = await getAdminClasses();
  if (!result.ok) return <div className="p-6"><ErrorState title="班级关系加载失败" description={result.message} /></div>;
  const classes = result.data as Array<{ id: string; name: string; grade: string | null; class_memberships?: unknown[] }>;
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="font-heading text-3xl">班级关系</h1><p className="text-sm text-muted-foreground">管理班级、教师指派、学生成员与导入校验预览。</p></div><Button variant="outline" disabled><Upload className="mr-2 size-4" />导入预览需 CSV 解析服务</Button></div><Card><CardHeader><CardTitle>新建班级</CardTitle></CardHeader><CardContent><form action={createClass} className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"><div className="space-y-2"><Label htmlFor="name">班级名称</Label><Input id="name" name="name" placeholder="高一(3)班" /></div><div className="space-y-2"><Label htmlFor="grade">年级</Label><Input id="grade" name="grade" placeholder="高一" /></div><Button type="submit" className="self-end"><Plus className="mr-2 size-4" />创建班级</Button></form></CardContent></Card>{classes.length === 0 ? <EmptyState title="暂无班级" description="创建真实班级并分配教师、学生后，教师权限才会按班级生效。" /> : <div className="grid gap-3">{classes.map((klass) => <Card key={klass.id}><CardContent className="p-4"><p className="font-medium">{klass.name}</p><p className="text-sm text-muted-foreground">{klass.grade ?? '未设置年级'} · 成员 {klass.class_memberships?.length ?? 0}</p></CardContent></Card>)}</div>}</div>;
}
