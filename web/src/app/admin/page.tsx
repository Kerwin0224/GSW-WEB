import { Activity, Database, Download, FileText, Puzzle, School, ShieldCheck, Upload, UserPlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { SetupChecklist } from '@/components/workbench/setup-checklist';
import { PrincipleCard, SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { getAdminDashboard } from '@/lib/data/admin';
import { getLogFileStatus, readRecentAppEvents } from '@/lib/observability/server-log-store';

export default async function AdminDashboard() {
  const [result, logStatus, logEvents] = await Promise.all([
    getAdminDashboard(),
    getLogFileStatus(),
    readRecentAppEvents(6),
  ]);

  if (!result.ok) {
    return (
      <div className="p-6">
        <ErrorState title="系统就绪状态加载失败" description={result.message} />
      </div>
    );
  }

  const { users, classes, readyCaps, presets, mcp, exports } = result.data;
  const coreProviderReady = readyCaps.has('student_chat') && readyCaps.has('teacher_chat');
  const setupItems = [
    { label: '学校账号', ready: users.length > 0, description: '学号 / 工号、角色与状态。', href: '/admin' },
    { label: '模型能力', ready: coreProviderReady, description: '学生学习、教师备课、分类与练习都依赖真实 Provider。', href: '/admin/providers' },
    { label: '教学预设', ready: presets.length > 0, description: '教师端必须先有发布版 Prompt。', href: '/admin/presets' },
    { label: '班级关系', ready: classes.length > 0, description: '决定教师能看哪些学生与审计范围。', href: '/admin/classes' },
    { label: 'MCP 能力', ready: mcp.length > 0, description: '外部工具只作为可治理能力开放。', href: '/admin/mcp' },
    { label: '导出记录', ready: exports.length > 0, description: '只导出教师审计通过的样本。', href: '/admin/exports' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="管理主线"
        title="让学校账号、模型能力、教学样本都可控。"
        description="管理端不是堆配置项。它只回答一个问题：学生能不能学，教师能不能教，系统出了问题能不能追。"
        primaryAction={{ label: '查看模型能力', href: '/admin/providers' }}
        secondaryAction={{ label: '查看运行日志', href: '/admin/logs' }}
        metrics={[
          { label: '账号', value: users.length, hint: '真实 profile 与角色' },
          { label: '班级', value: classes.length, hint: '教学范围边界' },
          { label: '日志', value: logEvents.length, hint: `${logStatus.appLogBytes} bytes 本地事件` },
        ]}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <PrincipleCard index="人" title="账号必须真实" description="学生学号、教师工号、管理员角色都来自数据库，不用 email，不猜身份。" />
        <PrincipleCard index="能" title="能力必须可追" description="Provider、Prompt、MCP 只登记能力与引用，真实密钥留在服务端环境。" accent="gold" />
        <PrincipleCard index="证" title="日志必须能定位" description="登录、API、渲染错误写入结构化日志，后台崩溃不再靠猜。" accent="cinnabar" />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="readiness"
          title="上线前就绪检查"
          description="缺哪一项，相关能力就明确阻塞；不使用模拟 Provider、演示账号或假审计记录掩盖问题。"
        />
        <SetupChecklist items={setupItems} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                学校账号
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" disabled>
                  <UserPlus className="mr-2 size-4" />
                  添加账号
                </Button>
                <Button disabled>
                  <Upload className="mr-2 size-4" />
                  CSV 导入
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <EmptyState title="暂无用户" description="创建真实学校账号与 profile 后，角色工作台才会开放。" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>账号</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.display_name}</TableCell>
                      <TableCell className="font-mono">{user.login_id}</TableCell>
                      <TableCell><Badge variant="outline">{user.role}</Badge></TableCell>
                      <TableCell>{user.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-5 text-primary" />
                最近日志
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {logEvents.length === 0 ? <p className="text-sm text-muted-foreground">暂无结构化日志。触发登录或错误后会写入。</p> : null}
              {logEvents.slice(0, 4).map((event, index) => (
                <a key={`${event.timestamp}-${index}`} href="/admin/logs" className="block rounded-xl border bg-background/70 p-3 hover:border-primary/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{event.event}</span>
                    <Badge variant={event.level === 'error' ? 'destructive' : 'outline'}>{event.level}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{event.timestamp}</p>
                </a>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-5 text-primary" />
                数据治理入口
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <a className="rounded-lg border p-3 hover:bg-muted" href="/admin/classes"><School className="mr-2 inline size-4" />班级关系</a>
              <a className="rounded-lg border p-3 hover:bg-muted" href="/admin/presets"><FileText className="mr-2 inline size-4" />Prompt 预设</a>
              <a className="rounded-lg border p-3 hover:bg-muted" href="/admin/mcp"><Puzzle className="mr-2 inline size-4" />MCP 能力</a>
              <a className="rounded-lg border p-3 hover:bg-muted" href="/admin/exports"><Download className="mr-2 inline size-4" />数据集导出</a>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
