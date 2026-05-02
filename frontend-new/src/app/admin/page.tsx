'use client';

import { useState } from 'react';
import { Upload, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BlockedState, EmptyState, ErrorState, LoadingSurface, PermissionState, SuccessState } from '@/components/workbench/state-surfaces';
import { SetupChecklist } from '@/components/workbench/setup-checklist';

export default function AdminDashboard() {
  const [showCreateUser, setShowCreateUser] = useState(false);
  const users: Array<{ id: string; display_name: string; role: string; email: string; status: string }> = [];
  const loading = false;
  const error: string | null = null;
  const permissionDenied = false;
  const userImportBlocked = false;
  const userCreateCommitted = false;
  const setupItems = [
    { label: 'Users', ready: users.length > 0, description: '教师、学生、管理员账号与角色路由。', href: '/admin' },
    { label: 'Provider', ready: false, description: '阻塞 student_chat、teacher_chat、分类、练习与嵌入。', href: '/admin/providers' },
    { label: 'Presets', ready: false, description: '阻塞教师 preset-first 教学对话。', href: '/admin/presets' },
    { label: 'Classes', ready: false, description: '阻塞教师班级范围与学生归属。', href: '/admin/classes' },
    { label: 'MCP', ready: false, description: '外部工具能力默认不可用。', href: '/admin/mcp' },
    { label: 'Exports', ready: false, description: '等待教师批准真实 SFT/DPO 记录。', href: '/admin/exports' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div><h1 className="font-heading text-3xl">系统就绪 / 用户</h1><p className="mt-1 text-sm text-muted-foreground">配置缺口会阻塞依赖能力；不提供 mock Provider 或演示数据。</p></div>
      <SetupChecklist items={setupItems} />
      {loading ? <LoadingSurface label="正在加载系统就绪状态" /> : null}
      {permissionDenied ? <PermissionState title="无权访问管理控制台" description="当前账号缺少管理员角色，不能查看用户或配置。" /> : null}
      {userImportBlocked ? <BlockedState title="用户导入暂不可用" description="缺少经过校验的 CSV 或服务端导入接口；不会把本地示例用户当作真实账号。" /> : null}
      {userCreateCommitted ? <SuccessState title="用户变更已提交" description="服务端确认创建或导入后，用户表会刷新真实记录。" /> : null}
      {error ? <ErrorState title="系统就绪状态加载失败" description={error} /> : null}
      <Card>
        <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>用户列表</CardTitle><div className="flex gap-2"><Dialog open={showCreateUser} onOpenChange={setShowCreateUser}><DialogTrigger render={<Button variant="outline"><UserPlus className="mr-2 size-4" />添加用户</Button>} /><DialogContent><DialogHeader><DialogTitle>创建用户</DialogTitle><DialogDescription>创建教师或学生账户；提交前会进行服务端校验。</DialogDescription></DialogHeader><div className="space-y-4 py-4"><div className="space-y-2"><Label htmlFor="email">邮箱</Label><Input id="email" type="email" placeholder="user@school.edu.cn" /></div><div className="space-y-2"><Label htmlFor="display">显示名称</Label><Input id="display" placeholder="姓名" /></div><div className="space-y-2"><Label>角色</Label><Select><SelectTrigger><SelectValue placeholder="选择角色" /></SelectTrigger><SelectContent><SelectItem value="teacher">教师</SelectItem><SelectItem value="student">学生</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="password">初始密码</Label><Input id="password" type="password" placeholder="••••••••" /></div></div><DialogFooter><Button variant="outline" onClick={() => setShowCreateUser(false)}>取消</Button><Button>创建</Button></DialogFooter></DialogContent></Dialog><Button><Upload className="mr-2 size-4" />CSV 批量导入</Button></div></div></CardHeader>
        <CardContent>{users.length === 0 ? <EmptyState title="暂无用户" description="通过 CSV 批量导入或手动添加真实用户后，角色工作台才可使用。" /> : <Table><TableHeader><TableRow><TableHead>姓名</TableHead><TableHead>邮箱</TableHead><TableHead>角色</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.id}><TableCell>{user.display_name}</TableCell><TableCell>{user.email}</TableCell><TableCell>{user.role}</TableCell><TableCell>{user.status}</TableCell></TableRow>)}</TableBody></Table>}</CardContent>
      </Card>
    </div>
  );
}
