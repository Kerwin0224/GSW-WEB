import { Activity, AlertTriangle, CheckCircle2, Cpu, Database, Download, FileText, Puzzle, School, ShieldCheck, Users } from 'lucide-react';

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
        <ErrorState title="管理看板加载失败" description={result.message} />
      </div>
    );
  }

  const { users, classes, readyCaps, mcp, exports } = result.data;
  const capabilityLabels = {
    student_chat: '学生会话回答',
    bloom_classification: '布鲁姆分类',
    project_classification: '篇目项目归属',
    teacher_chat: '教师问答',
    practice_generation: '挑战生成',
    practice_evaluation: '挑战确认评估',
  } as const;
  const studentRequired = ['student_chat', 'bloom_classification', 'project_classification'] as const;
  const teacherRequired = ['teacher_chat', 'practice_generation', 'practice_evaluation'] as const;
  const studentMissing = studentRequired.filter((capability) => !readyCaps.has(capability));
  const teacherMissing = teacherRequired.filter((capability) => !readyCaps.has(capability));
  const incidentReady = logStatus.appLogBytes > 0 || logEvents.length > 0 || exports.length > 0;
  const schoolManagementItems = [
    { label: '用户账号', value: users.length, hint: 'profiles' },
    { label: '班级', value: classes.length, hint: 'classes' },
    { label: '启用账号', value: users.filter((user) => user.status === 'active').length, hint: 'active accounts' },
    { label: '活跃情况', value: '真实采集中', hint: '不使用创建时间伪造登录' },
  ];
  const aiOpsItems = [
    { label: 'Provider', value: readyCaps.size, hint: 'enabled capability bindings' },
    { label: 'MCP', value: mcp.length, hint: 'enabled servers' },
    { label: '错误日志', value: logEvents.filter((event) => event.level === 'error').length, hint: 'recent error events' },
    { label: '教学导出记录', value: exports.reduce((sum, batch) => sum + batch.record_count, 0), hint: 'export_batches history' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="管理看板"
        title="学生能不能学，教师能不能教，事故能不能追。"
        description="AI Native 后台第一屏只回答真实链路状态：学校管理负责账号、班级与成员归属；AI 运维负责 Provider、MCP、日志与教学数据导出。"
        primaryAction={{ label: '查看用户管理', href: '/admin/users' }}
        secondaryAction={{ label: '查看模型 Provider', href: '/admin/providers' }}
        metrics={[
          { label: '账号', value: users.length, hint: '真实 profile 与角色' },
          { label: '班级', value: classes.length, hint: '教学范围边界' },
          { label: '日志', value: logEvents.length, hint: `${logStatus.appLogBytes} bytes 本地事件` },
        ]}
      />

      <section className="grid gap-4 lg:grid-cols-3" aria-label="AI Native 后台链路诊断">
        <Card className={studentMissing.length ? 'border-destructive/35 bg-destructive/6' : 'border-primary/25 bg-primary/6'}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {studentMissing.length ? <AlertTriangle className="size-5 text-destructive" aria-hidden="true" /> : <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />}
                学生 AI 链路
              </span>
              <Badge variant={studentMissing.length ? 'destructive' : 'secondary'}>{studentMissing.length ? 'blocked' : 'ready'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="leading-6 text-muted-foreground">
              {studentMissing.length
                ? `学习提问、布鲁姆路径或篇目归属会被阻塞：缺少 ${studentMissing.map((capability) => capabilityLabels[capability]).join('、')}。`
                : '学习提问、布鲁姆分类和篇目项目归属均有可用能力绑定。'}
            </p>
            <Button nativeButton={false} render={<a href="/admin/providers">检查 Provider 能力</a>} variant="outline" className="rounded-lg" />
          </CardContent>
        </Card>

        <Card className={teacherMissing.length ? 'border-destructive/35 bg-destructive/6' : 'border-primary/25 bg-primary/6'}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {teacherMissing.length ? <AlertTriangle className="size-5 text-destructive" aria-hidden="true" /> : <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />}
                教师 AI 链路
              </span>
              <Badge variant={teacherMissing.length ? 'destructive' : 'secondary'}>{teacherMissing.length ? 'blocked' : 'ready'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="leading-6 text-muted-foreground">
              {teacherMissing.length
                ? `教师问答或挑战确认闭环会被阻塞：缺少 ${teacherMissing.map((capability) => capabilityLabels[capability]).join('、')}。`
                : '教师问答、挑战生成和挑战确认评估均有可用能力绑定。'}
            </p>
            <Button nativeButton={false} render={<a href="/admin/providers">补齐模型能力</a>} variant="outline" className="rounded-lg" />
          </CardContent>
        </Card>

        <Card className={incidentReady ? 'border-primary/25 bg-primary/6' : 'border-accent/35 bg-accent/8'}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {incidentReady ? <CheckCircle2 className="size-5 text-primary" aria-hidden="true" /> : <AlertTriangle className="size-5 text-primary" aria-hidden="true" />}
                事故定位
              </span>
              <Badge variant={incidentReady ? 'secondary' : 'outline'}>{incidentReady ? 'observable' : 'empty'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="leading-6 text-muted-foreground">
              {incidentReady
                ? `已有 ${logEvents.length} 条近期事件、${exports.length} 个导出批次可用于定位运行状态。`
                : '暂无结构化日志或导出批次；这里保持空状态，不用假数据伪装可观测。'}
            </p>
            <Button nativeButton={false} render={<a href="/admin/logs">查看运行日志</a>} variant="outline" className="rounded-lg" />
          </CardContent>
        </Card>
      </section>

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
              <div key={item.label} className="rounded-lg border border-border/65 bg-background/78 p-4 shadow-soft backdrop-blur transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/30 hover:bg-background/92 hover:shadow-ink">
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
              <div key={item.label} className="rounded-lg border border-border/65 bg-background/78 p-4 shadow-soft backdrop-blur transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/30 hover:bg-background/92 hover:shadow-ink">
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
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-5 text-primary" />教学数据治理</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">导出审阅过的学习记录与导出历史，便于数据质量治理。</CardContent>
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
                <Button nativeButton={false} render={<a href="/admin/users"><Users className="mr-2 size-4" />用户管理</a>} variant="outline" />
                <UserImportDialog />
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
                <a key={`${event.timestamp}-${index}`} href="/admin/logs" className="group block rounded-lg border border-border/65 bg-background/78 p-4 shadow-soft backdrop-blur transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-primary/6 hover:shadow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
              <a className="group rounded-md border border-border/65 bg-background/78 p-3 transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-primary/6 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/admin/users"><Users className="mr-2 inline size-4" />用户管理</a>
              <a className="group rounded-md border border-border/65 bg-background/78 p-3 transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-primary/6 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/admin/classes"><School className="mr-2 inline size-4" />班级成员管理</a>
              <a className="group rounded-md border border-border/65 bg-background/78 p-3 transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-primary/6 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/admin/presets"><FileText className="mr-2 inline size-4" />Prompt 预设</a>
              <a className="group rounded-md border border-border/65 bg-background/78 p-3 transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-primary/6 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/admin/mcp"><Puzzle className="mr-2 inline size-4" />MCP 能力</a>
              <a className="group rounded-md border border-border/65 bg-background/78 p-3 transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-primary/6 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/admin/exports"><Download className="mr-2 inline size-4" />教学数据导出</a>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
