'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Building2, Loader2, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createSchool, setSchoolStatus, type OrgSchoolSummary } from '@/lib/data/org';

export function OrgSchoolsClient({ schools, organizationName, operatorName }: {
  schools: OrgSchoolSummary[];
  organizationName: string;
  operatorName: string;
}) {
  const [newName, setNewName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pending, startTransition] = useTransition();

  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createSchool(formData);
      setFeedback(result.message);
      if (result.ok) {
        setNewName('');
        event.currentTarget.reset();
      }
    });
  };

  const toggleStatus = (schoolId: string, status: OrgSchoolSummary['status']) => {
    const formData = new FormData();
    formData.set('schoolId', schoolId);
    formData.set('status', status === 'active' ? 'disabled' : 'active');
    startTransition(async () => {
      const result = await setSchoolStatus(formData);
      setFeedback(result.message);
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
      {feedback ? <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{feedback}</p> : null}

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
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => toggleStatus(school.id, school.status)}>
                    {school.status === 'active' ? '停用学校' : '启用学校'}
                  </Button>
                  <Link href={`/org/schools/${school.id}`} className="text-sm font-medium text-primary hover:underline">
                    进入学校详情 →
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
    </div>
  );
}
