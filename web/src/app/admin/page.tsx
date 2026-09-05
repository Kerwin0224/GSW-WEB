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
    student_chat: '学生提问回答',
    bloom_classification: '问题层级判断',
    project_classification: '篇目归档',
    teacher_chat: '教师问答',
    practice_generation: '挑战生成',
    practice_evaluation: '挑战评估',
  } as const;
  const studentRequired = ['student_chat', 'bloom_classification', 'project_classification'] as const;
  const teacherRequired = ['teacher_chat', 'practice_generation', 'practice_evaluation'] as const;
  const studentMissing = studentRequired.filter((capability) => !readyCaps.has(capability));
  const teacherMissing = teacherRequired.filter((capability) => !readyCaps.has(capability));
  const incidentReady = logStatus.appLogBytes > 0 || logEvents.length > 0 || exports.length > 0;
  const teacherCount = users.filter((user) => user.role === 'teacher').length;
  const studentCount = users.filter((user) => user.role === 'student').length;
  const schoolManagementItems = [
    { label: '用户账号', value: users.length, hint: '全校注册账号' },
    { label: '班级', value: classes.length, hint: '正在进行教学的班级' },
    { label: '启用账号', value: users.filter((user) => user.status === 'active').length, hint: '当前可以登录' },
    { label: '账号构成', value: `师 ${teacherCount} · 生 ${studentCount}`, hint: '按角色统计' },
  ];
  const aiOpsItems = [
    { label: '模型能力', value: readyCaps.size, hint: '已就绪的能力绑定' },
    { label: '外部工具', value: mcp.length, hint: '已启用的 MCP 服务' },
    { label: '技术错误', value: logEvents.filter((event) => event.level === 'error').length, hint: '近期错误事件' },
    { label: '教学样本', value: exports.reduce((sum, batch) => sum + batch.record_count, 0), hint: '可导出的确认/修订样本' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="管理看板"
        title="账号、班级、AI 服务，一处总览。"
        description="这里检查三件事：账号和班级是否就绪、学生和老师的 AI 能力是否可用、出了问题能否从日志追查。"
        primaryAction={{ label: '查看用户管理', href: '/admin/users' }}
        secondaryAction={{ label: '查看模型接入', href: '/admin/providers' }}
        metrics={[
          { label: '账号', value: users.length, hint: '教师、学生与管理员' },
          { label: '班级', value: classes.length, hint: '教学范围' },
          { label: '日志事件', value: logEvents.length, hint: '最近写入的技术事件' },
        ]}
      />

      <section className="grid gap-4 lg:grid-cols-3" aria-label="AI 服务状态">
        <Card className={studentMissing.length ? 'border-destructive/35 bg-destructive/6' : 'border-primary/25 bg-primary/6'}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {studentMissing.length ? <AlertTriangle className="size-5 text-destructive" aria-hidden="true" /> : <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />}
                学生 AI 能力
              </span>
              <Badge variant={studentMissing.length ? 'destructive' : 'secondary'}>{studentMissing.length ? '有缺口' : '就绪'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="leading-6 text-muted-foreground">
              {studentMissing.length
                ? `学生提问暂时用不了：还缺 ${studentMissing.map((capability) => capabilityLabels[capability]).join('、')}。`
                : '学生提问、层级判断和篇目归档能力都已就绪。'}
            </p>
            <Button nativeButton={false} render={<a href="/admin/providers">检查 Provider 能力</a>} variant="outline" className="rounded-lg" />
          </CardContent>
        </Card>

        <Card className={teacherMissing.length ? 'border-destructive/35 bg-destructive/6' : 'border-primary/25 bg-primary/6'}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {teacherMissing.length ? <AlertTriangle className="size-5 text-destructive" aria-hidden="true" /> : <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />}
                教师 AI 能力
              </span>
              <Badge variant={teacherMissing.length ? 'destructive' : 'secondary'}>{teacherMissing.length ? '有缺口' : '就绪'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="leading-6 text-muted-foreground">
              {teacherMissing.length
                ? `教师问答和挑战暂时用不了：还缺 ${teacherMissing.map((capability) => capabilityLabels[capability]).join('、')}。`
                : '教师问答、挑战生成和挑战评估能力都已就绪。'}
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
              <Badge variant={incidentReady ? 'secondary' : 'outline'}>{incidentReady ? '可定位' : '暂无记录'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="leading-6 text-muted-foreground">
              {incidentReady
                ? `已有 ${logEvents.length} 条近期事件和 ${exports.length} 个导出批次，出问题可以回查。`
                : '暂无日志和导出记录。系统开始使用后，这里会出现可追溯的事件。'}
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
              AI 服务摘要
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
          <CardHeader><CardTitle className="flex items-center gap-2"><Download className="size-5 text-primary" />教师确认的回答</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">老师确认无误的 AI 回答，可导出为高质量训练样本。</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Download className="size-5 text-primary" />老师修订过的回答</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">老师修改前后的回答自动配对，形成偏好对比数据。</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-5 text-primary" />数据边界</CardTitle></CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">导出内容仅限教师确认或修订过的样本，不包含学生的原始对话。</CardContent>
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
          </CardHeader>          <CardContent>
            {users.length === 0 ? (
              <EmptyState title="暂无用户" description="通过“导入用户”创建账号后，各角色工作台才会开放。" />
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
                最近技术日志
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {logEvents.length === 0 ? <p className="text-sm text-muted-foreground">暂无日志。使用登录、模型调用或导出功能后会自动记录。</p> : null}
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
                快捷入口
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
