'use client';

import { Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BlockedState, EmptyState, ErrorState, LoadingSurface, PermissionState, SuccessState } from '@/components/workbench/state-surfaces';

export default function AdminClassesPage() {
  const classes: Array<{ id: string }> = [];
  const loading = false;
  const error: string | null = null;
  const permissionDenied = false;
  const validationBlocked = false;
  const importCommitted = false;
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="font-heading text-3xl">班级关系</h1><p className="text-sm text-muted-foreground">管理班级、教师指派、学生成员与导入校验预览。</p></div><div className="flex gap-2"><Button variant="outline"><Upload className="mr-2 size-4" />导入预览</Button><Button><Plus className="mr-2 size-4" />创建班级</Button></div></div>{loading ? <LoadingSurface label="正在加载班级关系" /> : null}{permissionDenied ? <PermissionState title="无权管理班级关系" description="当前账号缺少管理员角色。" /> : null}{validationBlocked ? <BlockedState title="导入校验未通过" description="CSV 预览存在行级错误时不会写入班级、教师或学生关系。" /> : null}{importCommitted ? <SuccessState title="班级关系已保存" description="服务端确认写入后，教师与学生范围才会生效。" /> : null}{error ? <ErrorState title="班级关系加载失败" description={error} /> : null}<Card><CardHeader><CardTitle>新建 / 导入校验</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label>班级名称</Label><Input placeholder="高一(3)班" /></div><div className="space-y-2"><Label>教师工号</Label><Input placeholder="T-0001" /></div><div className="space-y-2"><Label>学生名单 CSV</Label><Input type="file" accept=".csv" /></div></CardContent></Card>{classes.length === 0 ? <EmptyState title="暂无班级" description="创建真实班级并分配教师、学生后，教师权限才会按班级生效。" /> : null}</div>;
}
