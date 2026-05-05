import { Activity, Cpu, Database, Download, FileText, Puzzle, School, ShieldCheck, Upload, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { UserImportDialog } from '@/components/workbench/user-import-dialog';
import { WorkspaceHero } from '@/components/workbench/workspace-hero';
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

  const { users, classes, readyCaps, mcp, exports } = result.data;
  const schoolManagementItems = [
    { label: '用户', value: users.length, hint: 'profiles' },
    { label: '班级', value: classes.length, hint: 'classes' },
    { label: '权限', value: users.filter((user) => user.status === 'active').length, hint: 'active accounts' },
    { label: '活跃情况', value: '真实采集中', hint: '不使用创建时间伪造登录' },
  ];
  const aiOpsItems = [
    { label: 'Provider', value: readyCaps.size, hint: 'enabled capability bindings' },
    { label: 'MCP', value: mcp.length, hint: 'enabled servers' },
    { label: '日志', value: logEvents.filter((event) => event.level === 'error').length, hint: 'recent error events' },
    { label: '待导出', value: exports.reduce((sum, batch) => sum + batch.record_count, 0), hint: 'export_batches history' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="管理主线"
        title="让学校账号、模型能力、教学样本都可控。"
        description="管理端不是堆配置项。它只回答一个问题：学生能不能学，教师能不能教，系统出了问题能不能追。"
        primaryAction={{ label: '查看用户权限', href: '/admin/users' }}
        secondaryAction={{ label: '查看模型能力', href: '/admin/providers' }}
        metrics={[
          { label: '账号', value: users.length, hint: '真实 profile 与角色' },
          { label: '班级', value: classes.length, hint: '教学范围边界' },
          { label: '日志', value: logEvents.length, hint: `${logStatus.appLogBytes} bytes 本地事件` },
        ]}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <School className="size-5 text-primary" />
              学校管理摘要
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {schoolManagementItems.map((item) => (
              <div key={item.label} className="rounded-xl border bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="size-5 text-primary" />
              AI 运维摘要
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {aiOpsItems.map((item) => (
              <div key={item.label} className="rounded-xl border bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Download className="size-5 text-primary" />SFT JSONL</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">教师确认无误或修订后的 supervised 样本，从真实 audit_records 生成。</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Download className="size-5 text-primary" />DPO JSONL</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">教师修订场景自然形成 chosen/rejected 偏好对。</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-5 text-primary" />审阅元数据</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">导出审阅人、来源、状态、质量与 metadata，便于数据质量治理。</CardContent>
        </Card>
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
                <Button nativeButton={false} render={<a href="/admin/users"><Users className="mr-2 size-4" />用户权限</a>} variant="outline" />
                <UserImportDialog
                  trigger={(
                    <Button>
                      <Upload className="mr-2 size-4" />
                      CSV 导入
                    </Button>
                  )}
                />
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
              <a className="rounded-lg border p-3 hover:bg-muted" href="/admin/users"><Users className="mr-2 inline size-4" />用户权限</a>
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
