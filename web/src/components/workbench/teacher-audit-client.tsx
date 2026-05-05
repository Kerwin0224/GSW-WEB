'use client';

import { useActionState, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, Save, UserRound } from 'lucide-react';

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

export function TeacherAuditClient({ records }: { records: AuditQueueRecord[] }) {
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? '');
  const selected = records.find((record) => record.id === selectedId);
  const [corrected, setCorrected] = useState(selected?.answer ?? '');
  const [rationale, setRationale] = useState('');
  const [confirmState, confirmAction, confirmPending] = useActionState(selected ? confirmLearningRecord.bind(null, selected.sourceMessageId) : async (): Promise<AuditSubmissionState> => ({ ok: false, message: '请选择一条学习记录。' }), initialState);
  const [reviseState, reviseAction, revisePending] = useActionState(selected ? reviseLearningRecord.bind(null, selected.sourceMessageId) : async (): Promise<AuditSubmissionState> => ({ ok: false, message: '请选择一条学习记录。' }), initialState);
  const issueCount = useMemo(() => records.reduce((sum, record) => sum + record.preReviewIssues.length, 0), [records]);

  const selectRecord = (record: AuditQueueRecord) => {
    setSelectedId(record.id);
    setCorrected(record.answer);
    setRationale('');
  };

  return (
    <div className="grid min-h-[calc(100vh-3rem)] gap-0 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="border-b bg-card/80 p-4 lg:border-b-0 lg:border-r" aria-label="学生项目会话树">
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-heading text-xl">学习记录核实</h1>
            <Badge variant="outline">{records.length} 条</Badge>
          </div>
          <p className="text-sm text-muted-foreground">按学生、篇目、会话查看完整记录；教师只需要确认或修订。</p>
          {issueCount > 0 ? <Badge variant="destructive">AI 预审提示 {issueCount} 处需核实</Badge> : null}
        </div>
        <div className="space-y-3">
          {records.length === 0 ? (
            <EmptyState title="暂无待核实学习记录" description="真实学生 AI 学习记录产生后，会进入这里等待教师核实。不会显示演示记录。" />
          ) : (
            records.map((record) => (
              <button
                key={record.id}
                onClick={() => selectRecord(record)}
                className={cn('w-full rounded-xl border bg-background/70 p-3 text-left text-sm hover:bg-muted', selectedId === record.id && 'border-primary/60 bg-primary/5')}
              >
                <span className="flex items-center gap-2 font-medium"><UserRound className="size-4 text-primary" />{record.studentName}</span>
                <span className="mt-1 block font-heading">《{record.projectTitle}》</span>
                <span className="mt-1 block text-xs text-muted-foreground">会话 {record.conversationId.slice(0, 8)} · {new Date(record.createdAt).toLocaleString('zh-CN')}</span>
                {record.preReviewIssues.length > 0 ? <Badge className="mt-2" variant="destructive">疑似问题 {record.preReviewIssues.length}</Badge> : <Badge className="mt-2" variant="outline">待教师核实</Badge>}
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="min-w-0 overflow-y-auto p-4" aria-label="完整聊天记录与内联操作">
        {selected ? (
          <div className="mx-auto max-w-5xl space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="font-heading">{selected.studentName} · 《{selected.projectTitle}》</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">完整会话记录，源回答已在气泡中高亮。</p>
                  </div>
                  {selected.preReviewBlocked ? <Badge variant="outline">预审能力未就绪</Badge> : <Badge variant={selected.preReviewIssues.length ? 'destructive' : 'outline'}>{selected.preReviewIssues.length ? 'AI 预审发现疑点' : 'AI 预审未发现明显疑点'}</Badge>}
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

            <section className="space-y-4">
              {selected.transcript.map((transcriptItem) => {
                const isAssistant = transcriptItem.role === 'assistant';
                const isSource = transcriptItem.isSource;
                return (
                  <article key={transcriptItem.id} className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}>
                    <div className={cn('max-w-[86%] rounded-2xl border px-4 py-3 shadow-sm', isAssistant ? 'bg-card' : 'bg-primary text-primary-foreground', isSource && 'border-destructive/40 ring-2 ring-destructive/15')}>
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

            <Card>
              <CardHeader><CardTitle className="font-heading">直接修订 AI 回答气泡</CardTitle></CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <form action={confirmAction} className="space-y-3 rounded-xl border p-4">
                  <input type="hidden" name="prompt" value={selected.prompt} />
                  <input type="hidden" name="original_answer" value={selected.answer} />
                  <h2 className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4 text-primary" />确认无误</h2>
                  <p className="text-sm text-muted-foreground">确认后，这条真实学习记录会进入后台可导出集合。</p>
                  <FormStatus state={confirmState} />
                  <Button disabled={confirmPending} className="w-full"><CheckCircle2 className="mr-2 size-4" />确认无误</Button>
                </form>

                <form action={reviseAction} className="space-y-3 rounded-xl border p-4">
                  <input type="hidden" name="prompt" value={selected.prompt} />
                  <input type="hidden" name="original_answer" value={selected.answer} />
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
          </div>
        ) : (
          <EmptyState title="请选择一条学习记录" description="左侧按学生、篇目、会话组织；选择后可查看完整聊天并内联修订。" action={<FileSearch className="size-5 text-primary" />} />
        )}
      </main>
    </div>
  );
}
