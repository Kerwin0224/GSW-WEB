'use client';

import { useActionState, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, GitBranch, Save, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/workbench/state-surfaces';
import type { AuditQueueRecord, TeacherPreReviewIssue } from '@/lib/data/teacher';
import { confirmLearningRecord, reviseLearningRecord, type AuditSubmissionState } from '@/lib/data/teacher-actions';
import { cn } from '@/lib/utils';

const initialState: AuditSubmissionState = { ok: false, message: '' };

type AuditGroup = {
  classLabel: string;
  students: Array<{
    studentName: string;
    projects: Array<{
      projectTitle: string;
      sessions: Array<{
        conversationId: string;
        sessionLabel: string;
        createdAt: string;
        records: AuditQueueRecord[];
      }>;
    }>;
  }>;
};

function FormStatus({ state }: { state: AuditSubmissionState }) {
  if (!state.message) return null;
  return (
    <p
      className={state.ok ? 'rounded-lg border border-primary/20 bg-primary/5 p-2 text-sm text-primary' : 'rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive'}
      role={state.ok ? 'status' : 'alert'}
    >
      {state.message}
    </p>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

function HighlightedText({ text, issues }: { text: string; issues: TeacherPreReviewIssue[] }) {
  const issue = issues.find((item) => item.quote && text.includes(item.quote));
  if (!issue) return <p className="whitespace-pre-wrap leading-7">{text}</p>;
  const [before, afterStart] = text.split(issue.quote, 2);
  return (
    <p className="whitespace-pre-wrap leading-7">
      {before}
      <mark className="rounded bg-destructive/15 px-1 text-foreground underline decoration-destructive decoration-2" title={issue.label}>
        {issue.quote}
      </mark>
      {afterStart}
    </p>
  );
}

function reviewStateBadge(record: AuditQueueRecord) {
  if (record.reviewState === 'revised') return <Badge className="mt-2" variant="secondary">已修订，可继续调整</Badge>;
  if (record.reviewState === 'confirmed') return <Badge className="mt-2" variant="outline">已确认，可继续修订</Badge>;
  if (record.preReviewIssues.length > 0) return <Badge className="mt-2" variant="destructive">疑似问题 {record.preReviewIssues.length}</Badge>;
  return <Badge className="mt-2" variant="outline">待教师核实</Badge>;
}

function ReviewEditor({ record }: { record: AuditQueueRecord }) {
  const [corrected, setCorrected] = useState(record.answer);
  const [rationale, setRationale] = useState('');
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmLearningRecord.bind(null, record.sourceMessageId), initialState);
  const [reviseState, reviseAction, revisePending] = useActionState(reviseLearningRecord.bind(null, record.sourceMessageId), initialState);

  return (
    <Card className="border-primary/15 bg-card/92 shadow-ink backdrop-blur-xl lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle className="font-heading">确认无误或修订回答</CardTitle>
        <p className="text-sm text-muted-foreground">学生侧不会看到“确认无误”状态；只有教师保存修订后，学生看到的 AI 回答才会被替换。</p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={confirmAction} className="space-y-3 rounded-lg border border-primary/20 bg-primary/6 p-4 shadow-soft">
          <h2 className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4 text-primary" />确认无误</h2>
          <p className="text-sm text-muted-foreground">确认后，这条学习记录会以当前版本进入教学数据导出；学生侧不会额外看到“已确认”。</p>
          <FormStatus state={confirmState} />
          <Button disabled={confirmPending} className="w-full"><CheckCircle2 className="mr-2 size-4" />确认无误</Button>
        </form>

        <form action={reviseAction} className="space-y-3 rounded-lg border border-accent/25 bg-accent/8 p-4 shadow-soft">
          <div className="space-y-2">
            <Label htmlFor="corrected_answer">修订版回答</Label>
            <Textarea id="corrected_answer" name="corrected_answer" value={corrected} onChange={(event) => setCorrected(event.target.value)} className="min-h-40" />
            <FieldError message={reviseState.errors?.corrected_answer} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rationale">修订原因</Label>
            <Textarea id="rationale" name="rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} className="min-h-20" />
            <FieldError message={reviseState.errors?.rationale} />
          </div>
          <FormStatus state={reviseState} />
          <Button disabled={revisePending || !corrected.trim() || !rationale.trim()} className="w-full"><Save className="mr-2 size-4" />保存修订</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function TeacherAuditClient({ records }: { records: AuditQueueRecord[] }) {
  const [selectedId, setSelectedId] = useState('');
  const selected = records.find((record) => record.id === selectedId);
  const { issueCount, pendingCount, revisedCount, confirmedCount, classCount, studentCount, projectCount, sessionCount, groupedRecords } = useMemo(() => {
    const groups = new Map<string, Map<string, Map<string, Map<string, AuditQueueRecord[]>>>>();
    for (const record of records) {
      const studentGroups = groups.get(record.classLabel) ?? new Map<string, Map<string, Map<string, AuditQueueRecord[]>>>();
      if (!groups.has(record.classLabel)) groups.set(record.classLabel, studentGroups);
      const projectGroups = studentGroups.get(record.studentName) ?? new Map<string, Map<string, AuditQueueRecord[]>>();
      if (!studentGroups.has(record.studentName)) studentGroups.set(record.studentName, projectGroups);
      const sessionGroups = projectGroups.get(record.projectTitle) ?? new Map<string, AuditQueueRecord[]>();
      if (!projectGroups.has(record.projectTitle)) projectGroups.set(record.projectTitle, sessionGroups);
      const sessionRecords = sessionGroups.get(record.conversationId) ?? [];
      if (!sessionGroups.has(record.conversationId)) sessionGroups.set(record.conversationId, sessionRecords);
      sessionRecords.push(record);
    }

    const groupedRecords: AuditGroup[] = Array.from(groups.entries()).map(([classLabel, students]) => ({
      classLabel,
      students: Array.from(students.entries()).map(([studentName, projects]) => ({
        studentName,
        projects: Array.from(projects.entries()).map(([projectTitle, sessions]) => ({
          projectTitle,
          sessions: Array.from(sessions.entries()).map(([conversationId, sessionRecords]) => ({
            conversationId,
            sessionLabel: sessionRecords[0]?.sessionLabel ?? `会话 ${conversationId.slice(0, 8)}`,
            createdAt: sessionRecords[0]?.createdAt ?? '',
            records: sessionRecords,
          })),
        })),
      })),
    }));

    return {
      issueCount: records.reduce((sum, record) => sum + record.preReviewIssues.length, 0),
      pendingCount: records.filter((record) => record.reviewState === 'pending').length,
      revisedCount: records.filter((record) => record.reviewState === 'revised').length,
      confirmedCount: records.filter((record) => record.reviewState === 'confirmed').length,
      classCount: new Set(records.map((record) => record.classId ?? record.classLabel)).size,
      studentCount: new Set(records.map((record) => record.studentName)).size,
      projectCount: new Set(records.map((record) => record.projectTitle)).size,
      sessionCount: new Set(records.map((record) => record.conversationId)).size,
      groupedRecords,
    };
  }, [records]);

  const selectRecord = (record: AuditQueueRecord) => {
    setSelectedId(record.id);
  };

  return (
    <div className="grid min-h-[calc(100vh-4rem)] gap-0 bg-background/35 xl:grid-cols-[22rem_minmax(0,1fr)_25rem]">
      <aside className="max-h-none overflow-y-visible border-b border-border/60 bg-card/86 p-4 shadow-soft backdrop-blur xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto xl:border-b-0 xl:border-r" aria-label="班级、学生、项目与会话导航">
        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-heading text-xl">学习记录核实</h1>
            <Badge variant="outline">{records.length} 条回答</Badge>
          </div>
          <p className="text-sm text-muted-foreground">先看班级总览，再按班级 → 学生 → 项目 → 会话 → 单条 AI 回答逐层进入完整记录；教师只需要确认无误或修订回答。</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="rounded-md border border-border/65 bg-background/70 px-3 py-2 shadow-sm">班级 {classCount}</div>
            <div className="rounded-md border border-border/65 bg-background/70 px-3 py-2 shadow-sm">学生 {studentCount}</div>
            <div className="rounded-md border border-border/65 bg-background/70 px-3 py-2 shadow-sm">项目 {projectCount}</div>
            <div className="rounded-md border border-border/65 bg-background/70 px-3 py-2 shadow-sm">会话 {sessionCount}</div>
          </div>
          {issueCount > 0 ? <Badge variant="destructive">AI 预审提示 {issueCount} 处需核实</Badge> : null}
        </div>
        <div className="space-y-4">
          {records.length === 0 ? (
            <EmptyState title="暂无待核实学习记录" description="真实学生 AI 学习记录产生后，会进入这里等待教师核实。不会显示演示记录。" />
          ) : (
            groupedRecords.map((group) => (
              <section key={group.classLabel} className="rounded-lg border border-border/65 bg-background/72 p-3 shadow-soft">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-heading text-base">{group.classLabel}</p>
                  <Badge variant="outline">{group.students.length} 名学生</Badge>
                </div>
                <div className="mt-3 space-y-3">
                  {group.students.map((student) => (
                    <div key={`${group.classLabel}-${student.studentName}`} className="rounded-md border border-border/65 bg-background/76 p-3 shadow-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <UserRound className="size-4 text-primary" />
                        <span>{student.studentName}</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {student.projects.map((project) => (
                          <div key={`${student.studentName}-${project.projectTitle}`} className="rounded-md border border-border/65 bg-card/76 p-2 shadow-sm">
                            <p className="font-heading text-sm">《{project.projectTitle}》</p>
                            <div className="mt-2 space-y-2">
                              {project.sessions.map((session) => (
                                <div key={session.conversationId} className="rounded-lg border bg-background/70 p-2">
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="font-medium">{session.sessionLabel}</span>
                                    <span className="text-muted-foreground">{session.records.length} 条待核实回答</span>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleString('zh-CN')}</p>
                                  <div className="mt-2 space-y-1">
                                    {session.records.map((record, index) => (
                                      <button
                                        key={record.id}
                                        onClick={() => selectRecord(record)}
                                        className={cn('w-full cursor-pointer rounded-md border border-border/65 bg-card/90 p-2 text-left text-xs shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selectedId === record.id && 'border-primary/60 bg-primary/6 shadow-soft')}
                                      >
                                        <span className="block font-medium">AI 回答 {index + 1}</span>
                                        <span className="mt-1 block text-muted-foreground">{new Date(record.createdAt).toLocaleString('zh-CN')}</span>
                                        {reviewStateBadge(record)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </aside>

      <main className="min-w-0 overflow-y-auto p-4" aria-label="完整会话记录">
        {selected ? (
          <div className="mx-auto max-w-4xl space-y-4">
            <Card className="border-primary/15">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="font-heading">{selected.classLabel} · {selected.studentName}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">《{selected.projectTitle}》 · {selected.sessionLabel}；完整会话记录里只高亮当前待核实 AI 回答。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.preReviewBlocked ? <Badge variant="outline">预审能力未就绪</Badge> : <Badge variant={selected.preReviewIssues.length ? 'destructive' : 'outline'}>{selected.preReviewIssues.length ? 'AI 预审发现疑点' : 'AI 预审未发现明显疑点'}</Badge>}
                    <Badge variant={selected.reviewState === 'pending' ? 'outline' : selected.reviewState === 'confirmed' ? 'secondary' : 'default'}>
                      {selected.reviewState === 'pending' ? '待核实' : selected.reviewState === 'confirmed' ? '已确认，可修订' : '已修订，可继续调整'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {selected.preReviewBlocked ? <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{selected.preReviewBlocked} 因此本条记录只显示待教师核实状态，不伪造标红结果。</p> : null}
                {selected.preReviewIssues.map((issue, index) => (
                  <div key={`${issue.quote}-${index}`} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <AlertTriangle className="mr-2 inline size-4 text-destructive" aria-hidden="true" />
                    <span className="font-medium">{issue.label}</span>
                    <span className="ml-2 text-muted-foreground">{issue.quote}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <section className="space-y-4" aria-label="完整会话">
              {selected.transcript.map((transcriptItem) => {
                const isAssistant = transcriptItem.role === 'assistant';
                const isSource = transcriptItem.isSource;
                return (
                  <article key={transcriptItem.id} className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}>
                    <div className={cn('max-w-[86%] rounded-lg border px-4 py-3 shadow-soft backdrop-blur', isAssistant ? 'bg-card/92' : 'bg-primary text-primary-foreground', isSource && 'border-destructive/45 ring-2 ring-destructive/15')}>
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs opacity-80">
                        <Badge variant={isAssistant ? 'outline' : 'secondary'}>{isAssistant ? 'AI 回答' : '学生提问'}</Badge>
                        {isSource ? <Badge variant="destructive">当前核实回答</Badge> : null}
                        <span>{new Date(transcriptItem.createdAt).toLocaleString('zh-CN')}</span>
                      </div>
                      {isSource ? <HighlightedText text={transcriptItem.content} issues={selected.preReviewIssues} /> : <p className="whitespace-pre-wrap leading-7">{transcriptItem.content}</p>}
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading">班级总览</CardTitle>
                <p className="text-sm text-muted-foreground">从左侧先选班级，再逐层进入学生、项目、会话和单条 AI 回答。右侧只在你选中具体学习记录后显示完整会话与内联修订操作。</p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border bg-background/70 p-4">
                  <p className="text-sm text-muted-foreground">待核实</p>
                  <p className="mt-2 text-2xl font-semibold">{pendingCount}</p>
                </div>
                <div className="rounded-lg border bg-background/70 p-4">
                  <p className="text-sm text-muted-foreground">已确认</p>
                  <p className="mt-2 text-2xl font-semibold">{confirmedCount}</p>
                </div>
                <div className="rounded-lg border bg-background/70 p-4">
                  <p className="text-sm text-muted-foreground">已修订</p>
                  <p className="mt-2 text-2xl font-semibold">{revisedCount}</p>
                </div>
                <div className="rounded-lg border bg-background/70 p-4">
                  <p className="text-sm text-muted-foreground">班级</p>
                  <p className="mt-2 text-2xl font-semibold">{classCount}</p>
                </div>
                <div className="rounded-lg border bg-background/70 p-4">
                  <p className="text-sm text-muted-foreground">学生</p>
                  <p className="mt-2 text-2xl font-semibold">{studentCount}</p>
                </div>
                <div className="rounded-lg border bg-background/70 p-4">
                  <p className="text-sm text-muted-foreground">项目</p>
                  <p className="mt-2 text-2xl font-semibold">{projectCount}</p>
                </div>
                <div className="rounded-lg border bg-background/70 p-4">
                  <p className="text-sm text-muted-foreground">会话</p>
                  <p className="mt-2 text-2xl font-semibold">{sessionCount}</p>
                </div>
              </CardContent>
            </Card>
            <EmptyState title="请选择一条学习记录" description="左侧按班级 → 学生 → 项目 → 会话 → 单条 AI 回答组织；选择后可查看完整会话并确认无误或直接修订回答。" action={<FileSearch className="size-5 text-primary" />} />
          </div>
        )}
      </main>

      <aside className="border-t border-border/60 bg-card/82 p-4 shadow-soft backdrop-blur xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto xl:border-l xl:border-t-0" aria-label="核实操作面板">
        {selected ? (
          <div className="space-y-4">
            <Card className="border-destructive/20 bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-heading">
                  <GitBranch className="size-5 text-destructive" aria-hidden="true" />
                  当前核实对象
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-md border border-border/65 bg-background/76 p-3">
                  <p className="text-xs text-muted-foreground">层级</p>
                  <p className="mt-1 leading-6">{selected.classLabel} → {selected.studentName} → 《{selected.projectTitle}》 → {selected.sessionLabel}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-border/65 bg-background/76 p-3">
                    <p className="text-muted-foreground">AI 预审</p>
                    <p className="mt-1 font-semibold">{selected.preReviewIssues.length} 处提示</p>
                  </div>
                  <div className="rounded-md border border-border/65 bg-background/76 p-3">
                    <p className="text-muted-foreground">状态</p>
                    <p className="mt-1 font-semibold">{selected.reviewState === 'pending' ? '待核实' : selected.reviewState === 'confirmed' ? '确认无误' : '已修订'}</p>
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">操作粒度落在当前单条 AI 回答；教师仍需基于中间栏完整会话判断。</p>
              </CardContent>
            </Card>
            <ReviewEditor key={selected.sourceMessageId} record={selected} />
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading">核实操作面板</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>先从左侧选择一条 AI 回答。中间栏会展示完整会话和标红片段，右侧才开放确认无误或修订回答。</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md border bg-background/70 p-3"><p className="font-semibold text-foreground">{pendingCount}</p><p>待核实</p></div>
                  <div className="rounded-md border bg-background/70 p-3"><p className="font-semibold text-foreground">{confirmedCount}</p><p>确认无误</p></div>
                  <div className="rounded-md border bg-background/70 p-3"><p className="font-semibold text-foreground">{revisedCount}</p><p>已修订</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </aside>
    </div>
  );
}
