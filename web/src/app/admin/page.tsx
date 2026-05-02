import { Upload, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SetupChecklist } from '@/components/workbench/setup-checklist';
import { getAdminDashboard } from '@/lib/data/admin';

export default async function AdminDashboard() {
  const result = await getAdminDashboard();
  if (!result.ok) return <div className="p-6"><ErrorState title="系统就绪状态加载失败" description={result.message} /></div>;
  const { users, classes, readyCaps, presets, mcp, exports } = result.data as { users: Array<{ id: string; display_name: string; login_id: string | null; role: string; status: string }>; classes: unknown[]; readyCaps: Set<string>; presets: unknown[]; mcp: unknown[]; exports: unknown[] };
  const setupItems = [{ label: 'Users', ready: users.length > 0, description: '教师、学生、管理员账号与角色路由。', href: '/admin' }, { label: 'Provider', ready: readyCaps.has('student_chat') && readyCaps.has('teacher_chat'), description: '阻塞 student_chat、teacher_chat、分类、练习与嵌入。', href: '/admin/providers' }, { label: 'Presets', ready: presets.length > 0, description: '阻塞教师 preset-first 教学对话。', href: '/admin/presets' }, { label: 'Classes', ready: classes.length > 0, description: '阻塞教师班级范围与学生归属。', href: '/admin/classes' }, { label: 'MCP', ready: mcp.length > 0, description: '外部工具能力默认不可用。', href: '/admin/mcp' }, { label: 'Exports', ready: exports.length > 0, description: '等待教师批准真实 SFT/DPO 记录。', href: '/admin/exports' }];
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><div><h1 className="font-heading text-3xl">系统就绪 / 用户</h1><p className="mt-1 text-sm text-muted-foreground">配置缺口会阻塞依赖能力；不提供模拟 Provider 或演示数据。</p></div><SetupChecklist items={setupItems} /><Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>用户列表</CardTitle><div className="flex gap-2"><Button variant="outline" disabled><UserPlus className="mr-2 size-4" />添加用户需服务端 Auth Admin</Button><Button disabled><Upload className="mr-2 size-4" />CSV 批量导入</Button></div></div></CardHeader><CardContent>{users.length === 0 ? <EmptyState title="暂无用户" description="通过学校账号创建真实用户与 profile 后，角色工作台才可使用。" /> : <Table><TableHeader><TableRow><TableHead>姓名</TableHead><TableHead>账号</TableHead><TableHead>角色</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.id}><TableCell>{user.display_name}</TableCell><TableCell>{user.login_id}</TableCell><TableCell>{user.role}</TableCell><TableCell>{user.status}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></div>;
}
