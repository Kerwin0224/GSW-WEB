'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, LockKeyhole, Pencil, Save, Sparkles, UserRound, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownContent } from '@/components/workbench/markdown-content';
import { EmptyState } from '@/components/workbench/state-surfaces';
import type { AuditQueueRecord, TeacherAuditMessage } from '@/lib/data/teacher';
import { finalizeLearningConversation, reviseLearningRecord, runConversationPreReview, type AuditSubmissionState } from '@/lib/data/teacher-actions';
import { cn } from '@/lib/utils';

const initialState: AuditSubmissionState = { ok: false, message: '' };

type AuditGroup = {
  classLabel: string;
  students: Array<{
    studentName: string;
    projects: Array<{
      projectTitle: string;
      sessions: AuditQueueRecord[];
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

function reviewStateLabel(state: AuditQueueRecord['reviewState']) {
  if (state === 'confirmed') return '已提交';
  if (state === 'revised') return '已提交含修订';
  return '待最终提交';
}

function assistantStateLabel(message: TeacherAuditMessage) {
  if (message.reviewState === 'revised') return '已修订';
  if (message.reviewState === 'confirmed') return '已确认';
  return '待随会话提交';
}

function preReviewLabel(record: AuditQueueRecord) {
  if (record.preReviewState === 'ready') return record.preReviewIssues.length ? `AI 预审 ${record.preReviewIssues.length} 处疑点 · 覆盖 ${record.preReviewCoveredMessageCount}/${record.assistantCount}` : `AI 预审已覆盖 ${record.preReviewCoveredMessageCount}/${record.assistantCount} · 无明显疑点`;
  if (record.preReviewState === 'partial') return `AI 预审待补审 ${record.preReviewCoveredMessageCount}/${record.assistantCount}`;
  if (record.preReviewState === 'blocked') return 'AI 预审能力未就绪';
  if (record.preReviewState === 'failed') return 'AI 预审失败';
  return '尚未 AI 预审';
}

function PreReviewStatusPanel({ record }: { record: AuditQueueRecord }) {
  if (record.preReviewState === 'not_run') return null;

  const hasIssues = record.preReviewIssues.length > 0;
  const isProblemState = record.preReviewState === 'partial' || record.preReviewState === 'failed' || record.preReviewState === 'blocked' || hasIssues;
  const Icon = isProblemState ? AlertTriangle : CheckCircle2;
  const message = (() => {
    if (record.preReviewState === 'ready') {
      return hasIssues
        ? `AI 辅助审计已完成，覆盖 ${record.preReviewCoveredMessageCount}/${record.assistantCount} 条 AI 回答，发现 ${record.preReviewIssues.length} 处需教师核实的疑点。`
        : `AI 辅助审计已完成，覆盖 ${record.preReviewCoveredMessageCount}/${record.assistantCount} 条 AI 回答，未发现明显教学正确性疑点。`;
    }
    if (record.preReviewState === 'partial') return `AI 辅助审计已保存，但只覆盖 ${record.preReviewCoveredMessageCount}/${record.assistantCount} 条 AI 回答，请继续补审。`;
    if (record.preReviewState === 'failed') return record.preReviewBlocked ?? 'AI 辅助审计失败，请重新发起。';
    return record.preReviewBlocked ?? 'AI 辅助审计能力未就绪。';
  })();

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border p-3 text-sm',
        isProblemState ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-primary/25 bg-primary/6 text-primary',
      )}
      role={record.preReviewState === 'failed' ? 'alert' : 'status'}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="leading-6">{message}</p>
    </div>
  );
}

function ConversationPreReviewButton({ record }: { record: AuditQueueRecord }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(runConversationPreReview.bind(null, record.conversationId), initialState);
  const disabled = pending || record.conversationFinalized || Boolean(record.preReviewBlocked);
  const statusId = `pre_review_status_${record.conversationId}`;

  useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [router, state]);

  return (
    <form action={action} aria-busy={pending} aria-describedby={statusId} className="min-w-0 space-y-2">
      <Button type="submit" disabled={disabled} variant="outline" className="min-h-10 cursor-pointer rounded-lg">
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
        {pending ? 'AI 预审中...' : record.preReviewState === 'ready' ? '重新发起 AI 辅助审计' : record.preReviewState === 'partial' ? '补审 AI 辅助审计' : 'AI 辅助审计'}
      </Button>
      {pending ? <p id={statusId} className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-sm text-primary" role="status" aria-live="polite">AI 辅助审计正在处理完整会话，完成后会自动更新疑点和标红片段。</p> : null}
      <FormStatus state={state} />
    </form>
  );
}

function FinalizeConversationForm({ record }: { record: AuditQueueRecord }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(finalizeLearningConversation.bind(null, record.conversationId), initialState);

  useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [router, state]);

  return (
    <form action={action} className="space-y-2">
      <Button type="submit" disabled={pending || record.conversationFinalized || record.assistantCount === 0} className="min-h-10 cursor-pointer rounded-lg shadow-ink">
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : record.conversationFinalized ? <LockKeyhole className="mr-2 size-4" /> : <CheckCircle2 className="mr-2 size-4" />}
        {pending ? '提交中...' : record.conversationFinalized ? '已提交会话核实' : '确认提交整个会话'}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}

function InlineAssistantEditor({ record, message }: { record: AuditQueueRecord; message: TeacherAuditMessage }) {
  const router = useRouter();
  const currentAnswer = message.revisedContent ?? message.content;
  const [editing, setEditing] = useState(false);
  const [corrected, setCorrected] = useState(currentAnswer);
  const [rationale, setRationale] = useState('');
  const [state, action, pending] = useActionState(reviseLearningRecord.bind(null, message.id), initialState);
  const unchanged = corrected.trim() === currentAnswer.trim();

  // 派生状态：每次 action 返回新的 state 引用时，如果本次是成功响应，
  // 就同步收起编辑态、清空修订说明。React 19 的 react-hooks 规则禁止在
  // effect 里 setState、也禁止在 render 阶段读写 ref；官方推荐改用
  // "存储上次 render 的 state 值 + render 阶段比较"——见
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.ok && state.message) {
      setEditing(false);
      setRationale('');
    }
  }

  useEffect(() => {
    if (!state.ok || !state.message) return;
    router.refresh();
  }, [router, state]);

  if (record.conversationFinalized) {
    return (
      <div className="mt-3 rounded-lg border border-border/60 bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
        该会话已完成最终核实提交，学生不能继续追问。
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/55 pt-3">
        <span className="text-xs text-muted-foreground">可直接修订学生侧可见回答；最终提交在会话顶部完成。</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} className="cursor-pointer rounded-lg">
          <Pencil className="mr-1.5 size-3.5" />
          修订回答
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3 border-t border-border/55 pt-3">
      <div className="space-y-2">
        <Label htmlFor={`corrected_answer_${message.id}`}>直接编辑学生侧可见回答</Label>
        <Textarea
          id={`corrected_answer_${message.id}`}
          name="corrected_answer"
          value={corrected}
          onChange={(event) => setCorrected(event.target.value)}
          className="min-h-40 bg-background/88 text-sm leading-7"
        />
        <FieldError message={state.errors?.corrected_answer} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`rationale_${message.id}`}>修订说明（可选）</Label>
        <Textarea
          id={`rationale_${message.id}`}
          name="rationale"
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          placeholder="可补充为什么这样改；留空时系统会记录为教师直接修订。"
          className="min-h-20 bg-background/88 text-sm"
        />
        <FieldError message={state.errors?.rationale} />
      </div>
      <FormStatus state={state} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => { setEditing(false); setCorrected(currentAnswer); setRationale(''); }} className="cursor-pointer rounded-lg">
          <X className="mr-1.5 size-4" />
          取消
        </Button>
        <Button type="submit" disabled={pending || !corrected.trim() || unchanged} className="cursor-pointer rounded-lg shadow-ink">
          {pending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
          {pending ? '保存中...' : '保存修订'}
        </Button>
      </div>
    </form>
  );
}

export function TeacherAuditClient({ records }: { records: AuditQueueRecord[] }) {
  const [selectedId, setSelectedId] = useState('');
  const selected = records.find((record) => record.id === selectedId);
  const { issueCount, pendingCount, finalizedCount, revisedCount, classCount, studentCount, projectCount, sessionCount, assistantCount, groupedRecords } = useMemo(() => {
    const groups = new Map<string, Map<string, Map<string, AuditQueueRecord[]>>>();
    for (const record of records) {
      const studentGroups = groups.get(record.classLabel) ?? new Map<string, Map<string, AuditQueueRecord[]>>();
      if (!groups.has(record.classLabel)) groups.set(record.classLabel, studentGroups);
      const projectGroups = studentGroups.get(record.studentName) ?? new Map<string, AuditQueueRecord[]>();
      if (!studentGroups.has(record.studentName)) studentGroups.set(record.studentName, projectGroups);
      const sessions = projectGroups.get(record.projectTitle) ?? [];
      if (!projectGroups.has(record.projectTitle)) projectGroups.set(record.projectTitle, sessions);
      sessions.push(record);
    }

    const groupedRecords: AuditGroup[] = Array.from(groups.entries()).map(([classLabel, students]) => ({
      classLabel,
      students: Array.from(students.entries()).map(([studentName, projects]) => ({
        studentName,
        projects: Array.from(projects.entries()).map(([projectTitle, sessions]) => ({
          projectTitle,
          sessions: sessions.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        })),
      })),
    }));

    return {
      issueCount: records.reduce((sum, record) => sum + record.preReviewIssues.length, 0),
      pendingCount: records.filter((record) => !record.conversationFinalized).length,
      finalizedCount: records.filter((record) => record.conversationFinalized).length,
      revisedCount: records.filter((record) => record.revisedAssistantCount > 0).length,
      classCount: new Set(records.map((record) => record.classId ?? record.classLabel)).size,
      studentCount: new Set(records.map((record) => record.studentName)).size,
      projectCount: new Set(records.map((record) => record.projectTitle)).size,
      sessionCount: records.length,
      assistantCount: records.reduce((sum, record) => sum + record.assistantCount, 0),
      groupedRecords,
    };
  }, [records]);

  return (
    <div className="grid min-h-[calc(100vh-4rem)] gap-0 bg-[radial-gradient(circle_at_18%_0%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_24rem),color-mix(in_oklch,var(--background)_86%,transparent)] xl:h-[calc(100svh-4rem)] xl:min-h-0 xl:max-h-[calc(100svh-4rem)] xl:grid-cols-[23rem_minmax(0,1fr)] xl:overflow-hidden">
      <aside className="max-h-none overflow-y-visible border-b border-border/60 bg-card/90 p-4 shadow-ink backdrop-blur-xl xl:h-full xl:min-h-0 xl:overflow-y-auto xl:border-b-0 xl:border-r" aria-label="班级、学生、项目与会话导航">
        <div className="mb-4 space-y-4 rounded-xl border border-primary/20 bg-primary/6 p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">学习记录核实</p>
              <h1 className="mt-2 font-heading text-2xl">班级总览</h1>
            </div>
            <Badge variant="outline" className="bg-card/80">{records.length} 个会话</Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">按班级 → 学生 → 项目 → 会话逐层进入完整记录；AI 辅助审计覆盖整个会话，教师最终提交也以整个会话为单位。</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="rounded-lg border border-border/65 bg-background/78 px-3 py-2 shadow-sm"><span className="text-foreground">{classCount}</span> 个班级</div>
            <div className="rounded-lg border border-border/65 bg-background/78 px-3 py-2 shadow-sm"><span className="text-foreground">{studentCount}</span> 名学生</div>
            <div className="rounded-lg border border-border/65 bg-background/78 px-3 py-2 shadow-sm"><span className="text-foreground">{projectCount}</span> 个项目</div>
            <div className="rounded-lg border border-border/65 bg-background/78 px-3 py-2 shadow-sm"><span className="text-foreground">{assistantCount}</span> 条 AI 回答</div>
          </div>
          {issueCount > 0 ? <Badge variant="destructive" className="shadow-soft">AI 预审提示 {issueCount} 处需核实</Badge> : null}
        </div>
        <div className="space-y-4">
          {records.length === 0 ? (
            <EmptyState title="暂无待核实学习记录" description="真实学生 AI 学习记录产生后，会进入这里等待教师核实。不会显示演示记录。" />
          ) : (
            groupedRecords.map((group) => (
              <section key={group.classLabel} className="rounded-xl border border-border/65 bg-background/78 p-3 shadow-soft backdrop-blur">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/82 px-3 py-2">
                  <p className="font-heading text-base">{group.classLabel}</p>
                  <Badge variant="outline" className="bg-background/80">{group.students.length} 名学生</Badge>
                </div>
                <div className="mt-3 space-y-3">
                  {group.students.map((student) => (
                    <div key={`${group.classLabel}-${student.studentName}`} className="rounded-lg border border-border/65 bg-card/82 p-3 shadow-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <UserRound className="size-4 text-primary" aria-hidden="true" />
                        <span>{student.studentName}</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {student.projects.map((project) => (
                          <div key={`${student.studentName}-${project.projectTitle}`} className="rounded-lg border border-border/65 bg-background/74 p-2 shadow-sm">
                            <p className="font-heading text-sm">《{project.projectTitle}》</p>
                            <div className="mt-2 space-y-2">
                              {project.sessions.map((session) => (
                                <button
                                  key={session.conversationId}
                                  type="button"
                                  onClick={() => setSelectedId(session.id)}
                                  className={cn('w-full cursor-pointer rounded-lg border border-border/65 bg-card/95 p-3 text-left text-xs shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-primary/6 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selectedId === session.id && 'border-primary/60 bg-primary/10 shadow-ink ring-1 ring-primary/15')}
                                >
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="truncate font-medium">{session.sessionLabel}</span>
                                    <Badge variant={session.conversationFinalized ? 'secondary' : 'outline'}>{reviewStateLabel(session.reviewState)}</Badge>
                                  </span>
                                  <span className="mt-2 block text-muted-foreground">
                                    {session.assistantCount} 条 AI 回答 · 待提交 {session.pendingAssistantCount} 条 · 风险 {session.riskAssistantCount} 条
                                  </span>
                                  <span className="mt-1 block text-muted-foreground">{preReviewLabel(session)}</span>
                                  <span className="mt-1 block text-muted-foreground">{new Date(session.createdAt).toLocaleString('zh-CN')}</span>
                                </button>
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

      <main className="min-w-0 overflow-y-auto p-4 xl:h-full xl:min-h-0 xl:p-6" aria-label="完整会话记录">
        {selected ? (
          <div className="mx-auto max-w-4xl space-y-4">
            <Card className="gap-0 overflow-hidden py-0 border-primary/20 bg-card/95 shadow-ink backdrop-blur-xl">
              <CardHeader className="border-b border-border/60 bg-primary/6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="font-heading">{selected.classLabel} · {selected.studentName}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">《{selected.projectTitle}》 · {selected.sessionLabel}；右侧是完整对话，提交前每条 AI 回答都可以修订。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={selected.conversationFinalized ? 'secondary' : 'outline'}>{reviewStateLabel(selected.reviewState)}</Badge>
                    <Badge variant={selected.preReviewIssues.length ? 'destructive' : 'outline'}>{preReviewLabel(selected)}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="grid gap-3 text-sm md:grid-cols-4">
                  <div className="rounded-lg border border-border/65 bg-background/78 p-3"><span className="text-muted-foreground">AI 回答</span><p className="mt-1 text-2xl font-semibold">{selected.assistantCount}</p></div>
                  <div className="rounded-lg border border-primary/20 bg-primary/6 p-3"><span className="text-muted-foreground">待最终提交</span><p className="mt-1 text-2xl font-semibold text-primary">{selected.pendingAssistantCount}</p></div>
                  <div className="rounded-lg border border-border/65 bg-background/78 p-3"><span className="text-muted-foreground">已修订</span><p className="mt-1 text-2xl font-semibold">{selected.revisedAssistantCount}</p></div>
                  <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3"><span className="text-muted-foreground">风险回答</span><p className="mt-1 text-2xl font-semibold text-destructive">{selected.riskAssistantCount}</p></div>
                </div>
                <PreReviewStatusPanel record={selected} />
                {selected.preReviewIssues.length > 0 ? (
                  <div className="space-y-2">
                    {selected.preReviewIssues.map((issue, index) => (
                      <div key={`${issue.messageId}-${issue.quote}-${index}`} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                        <AlertTriangle className="mr-2 inline size-4 text-destructive" aria-hidden="true" />
                        <span className="font-medium">{issue.label}</span>
                        <span className="ml-2 text-muted-foreground">{issue.quote}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-col gap-3 border-t border-border/60 pt-4 md:flex-row md:items-start md:justify-between">
                  <ConversationPreReviewButton record={selected} />
                  <FinalizeConversationForm record={selected} />
                </div>
              </CardContent>
            </Card>

            <section className="space-y-4" aria-label="完整会话">
              {selected.transcript.map((transcriptItem) => {
                const isAssistant = transcriptItem.role === 'assistant';
                const hasRevision = Boolean(isAssistant && transcriptItem.revisedContent && transcriptItem.originalContent);
                const assistantContent = hasRevision ? transcriptItem.originalContent! : transcriptItem.content;
                return (
                  <article key={transcriptItem.id} className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}>
                    <div className={cn('max-w-[88%]', isAssistant && 'space-y-2')}>
                      <div className={cn('rounded-xl border px-4 py-3 shadow-soft backdrop-blur', isAssistant ? 'bg-card/95' : 'bg-primary text-primary-foreground shadow-ink', isAssistant && transcriptItem.preReviewIssues.length > 0 && 'border-destructive/55 ring-2 ring-destructive/18')}>
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs opacity-85">
                          <Badge variant={isAssistant ? 'outline' : 'secondary'}>{hasRevision ? 'AI 原回答' : isAssistant ? 'AI 回答' : '学生提问'}</Badge>
                          {isAssistant ? <Badge variant={transcriptItem.reviewState === 'revised' ? 'default' : 'outline'}>{assistantStateLabel(transcriptItem)}</Badge> : null}
                          {isAssistant && transcriptItem.preReviewIssues.length > 0 ? <Badge variant="destructive">{transcriptItem.preReviewIssues.length} 处疑点</Badge> : null}
                          {isAssistant && transcriptItem.preReviewChecked && transcriptItem.preReviewIssues.length === 0 ? <Badge variant="outline">AI 已预审 · 无明显疑点</Badge> : null}
                          {isAssistant && selected.preReviewState === 'partial' && !transcriptItem.preReviewChecked ? <Badge variant="outline">待补审</Badge> : null}
                          <span>{new Date(transcriptItem.createdAt).toLocaleString('zh-CN')}</span>
                        </div>
                        {isAssistant ? (
                          <>
                            <MarkdownContent content={assistantContent} highlights={transcriptItem.preReviewIssues} />
                            {hasRevision ? (
                              <div className="mt-3 rounded-lg border border-primary/25 bg-primary/6 p-3">
                                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-primary">
                                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                                  <span className="font-medium">教师修订版</span>
                                  <Badge variant="outline">已同步学生侧</Badge>
                                </div>
                                <MarkdownContent content={transcriptItem.revisedContent!} highlights={transcriptItem.preReviewIssues} className="text-foreground" />
                              </div>
                            ) : null}
                            <InlineAssistantEditor key={`${transcriptItem.id}-${transcriptItem.content}`} record={selected} message={transcriptItem} />
                          </>
                        ) : (
                          <p className="whitespace-pre-wrap leading-7">{transcriptItem.content}</p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            <Card className="gap-0 overflow-hidden py-0 border-primary/20 bg-card/95 shadow-ink backdrop-blur-xl">
              <CardHeader className="border-b border-border/60 bg-primary/6">
                <CardTitle className="font-heading">班级总览</CardTitle>
                <p className="text-sm text-muted-foreground">从左侧选班级，再进入学生和会话。选中会话后，右侧会显示完整对话和核实操作。</p>
              </CardHeader>
              <CardContent className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-primary/20 bg-primary/6 p-4 shadow-soft">
                  <p className="text-sm text-muted-foreground">待提交会话</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">{pendingCount}</p>
                </div>
                <div className="rounded-xl border border-border/65 bg-background/78 p-4 shadow-soft">
                  <p className="text-sm text-muted-foreground">已提交会话</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{finalizedCount}</p>
                </div>
                <div className="rounded-xl border border-border/65 bg-background/78 p-4 shadow-soft">
                  <p className="text-sm text-muted-foreground">含修订会话</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{revisedCount}</p>
                </div>
                <div className="rounded-xl border border-border/65 bg-background/78 p-4 shadow-soft">
                  <p className="text-sm text-muted-foreground">AI 回答</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{assistantCount}</p>
                </div>
                <div className="rounded-xl border border-border/65 bg-background/78 p-4 shadow-soft">
                  <p className="text-sm text-muted-foreground">班级</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{classCount}</p>
                </div>
                <div className="rounded-xl border border-border/65 bg-background/78 p-4 shadow-soft">
                  <p className="text-sm text-muted-foreground">学生</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{studentCount}</p>
                </div>
                <div className="rounded-xl border border-border/65 bg-background/78 p-4 shadow-soft">
                  <p className="text-sm text-muted-foreground">项目</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{projectCount}</p>
                </div>
                <div className="rounded-xl border border-border/65 bg-background/78 p-4 shadow-soft">
                  <p className="text-sm text-muted-foreground">会话</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{sessionCount}</p>
                </div>
              </CardContent>
            </Card>
            <EmptyState title="请选择一条会话" description="左侧按班级 → 学生 → 项目 → 会话组织；选择后可审计整个会话，并在每个 AI 回答气泡内直接修订。" action={<FileSearch className="size-5 text-primary" />} />
          </div>
        )}
      </main>
    </div>
  );
}
