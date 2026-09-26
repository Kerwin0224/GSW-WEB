'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Building2, CheckCircle2, Loader2, Plus, XCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { createSchool, setSchoolStatus, type OrgSchoolSummary } from '@/lib/data/org';

export function OrgSchoolsClient({ schools, organizationName, operatorName }: {
  schools: OrgSchoolSummary[];
  organizationName: string;
  operatorName: string;
}) {
  const [newName, setNewName] = useState('');
  /** 成功/失败分级：停用学校会拦住全校师生登录，只有一行灰字时管理员分不清到底成没成。 */
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [statusTarget, setStatusTarget] = useState<OrgSchoolSummary | null>(null);

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createSchool(formData);
      setFeedback({ ok: result.ok, message: result.message });
      if (result.ok) {
        setNewName('');
        event.currentTarget.reset();
      }
    });
  };

  const confirmStatusChange = () => {
    const target = statusTarget;
    if (!target) return;
    const formData = new FormData();
    formData.set('schoolId', target.id);
    formData.set('status', target.status === 'active' ? 'disabled' : 'active');
    startTransition(async () => {
      const result = await setSchoolStatus(formData);
      setFeedback({ ok: result.ok, message: result.message });
      if (result.ok) setStatusTarget(null);
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submitCreate} className="flex flex-wrap items-end gap-2 rounded-xl border border-border/65 bg-card/86 p-4 shadow-soft">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor="new-school-name" className="text-sm font-medium">新建学校</label>
          <Input
            id="new-school-name"
            name="name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="学校名称，如：文韵实验中学"
            maxLength={60}
            required
          />
        </div>
        <Button type="submit" disabled={pending || !newName.trim()} className="min-h-10">
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}
          创建学校
        </Button>
      </form>
      {feedback ? (
        <Alert variant={feedback.ok ? 'default' : 'destructive'} role={feedback.ok ? 'status' : 'alert'}>
          {feedback.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          <AlertTitle>{feedback.ok ? '操作完成' : '操作失败'}</AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}

      {schools.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">还没有学校。先创建第一所学校，再为它配置管理员和名册。</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {schools.map((school) => (
            <Card key={school.id} className="border-border/70 bg-card/86 shadow-soft transition-colors hover:border-primary/25">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground">
                      <Building2 className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-heading text-lg">{school.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">创建于 {new Date(school.createdAt).toLocaleDateString('zh-CN')}</p>
                    </div>
                  </div>
                  <Badge variant={school.status === 'active' ? 'outline' : 'secondary'} className={school.status === 'active' ? 'border-primary/25 bg-primary/8 text-primary' : ''}>
                    {school.status === 'active' ? '运行中' : '已停用'}
                  </Badge>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-border/60 bg-background/60 px-2 py-2">
                    <dt className="text-xs text-muted-foreground">班级</dt>
                    <dd className="text-lg font-semibold tabular-nums">{school.classCount}</dd>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/60 px-2 py-2">
                    <dt className="text-xs text-muted-foreground">教师</dt>
                    <dd className="text-lg font-semibold tabular-nums">{school.teacherCount}</dd>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/60 px-2 py-2">
                    <dt className="text-xs text-muted-foreground">学生</dt>
                    <dd className="text-lg font-semibold tabular-nums">{school.studentCount}</dd>
                  </div>
                </dl>
                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setStatusTarget(school)}>
                    {school.status === 'active' ? '停用学校' : '启用学校'}
                  </Button>
                  <Link href={`/org/schools/${school.id}`} className="text-sm font-medium text-primary hover:underline">
                    查看这所学校
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        当前公司：{organizationName} · 公司管理员：{operatorName}
      </p>

      <AdminDialogShell
        open={statusTarget !== null}
        onOpenChange={(open) => { if (!open && !pending) setStatusTarget(null); }}
        title={statusTarget?.status === 'active' ? `停用学校「${statusTarget?.name}」` : `启用学校「${statusTarget?.name ?? ''}」`}
        description={statusTarget?.status === 'active'
          ? '停用会立刻影响全校师生，先看清影响面再确认。'
          : '启用后该校师生可重新登录使用。'}
        icon={statusTarget?.status === 'active' ? <XCircle className="size-5" /> : <CheckCircle2 className="size-5" />}
        className="max-w-lg"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => setStatusTarget(null)} disabled={pending}>取消</Button>
            <Button type="button" variant={statusTarget?.status === 'active' ? 'destructive' : 'default'} onClick={confirmStatusChange} disabled={pending}>
              {pending ? <><Loader2 className="mr-2 size-4 animate-spin" />处理中…</> : statusTarget?.status === 'active' ? '确认停用' : '确认启用'}
            </Button>
          </>
        )}
      >
        {statusTarget?.status === 'active' ? (
          <Alert variant="destructive">
            <XCircle className="size-4" />
            <AlertTitle>停用后会发生什么</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                <li>{statusTarget.teacherCount} 名教师与 {statusTarget.studentCount} 名学生（连同校管理员）将无法登录。</li>
                <li>{statusTarget.classCount} 个班级与其中的项目、学习记录都会保留，重新启用后原样恢复。</li>
                <li>该校的模型与 MCP 配置不受影响；停用可随时在本页改回。</li>
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertDescription>启用后 {statusTarget?.teacherCount ?? 0} 名教师与 {statusTarget?.studentCount ?? 0} 名学生可重新登录，原有班级与记录不变。</AlertDescription>
          </Alert>
        )}
      </AdminDialogShell>
    </div>
  );
}
