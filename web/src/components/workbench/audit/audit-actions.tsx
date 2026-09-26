'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, LockKeyhole, Sparkles, Unlock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { finalizeLearningConversation, runConversationPreReview, setConversationLock, type AuditSubmissionState } from '@/lib/data/teacher-actions';
import type { PreReviewState } from '@/lib/audit-queue';

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

/**
 * AI 预审：对完整会话中所有 AI 回答预先定位疑点，供教师核实。
 * 只定位、不判错——教师处理粒度仍是整条回答气泡与整个会话。
 */
export function PreReviewAction({ conversationId, preReviewState, blockedReason, finalized }: {
  conversationId: string;
  preReviewState: PreReviewState;
  blockedReason?: string;
  finalized: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(runConversationPreReview.bind(null, conversationId), initialState);
  const disabled = pending || finalized || preReviewState === 'blocked';
  const statusId = `pre_review_status_${conversationId}`;
  const label = preReviewState === 'ready' ? '重新运行 AI 预审' : preReviewState === 'partial' ? '补充 AI 预审' : '运行 AI 预审';

  useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [router, state]);

  return (
    <form action={action} aria-busy={pending} aria-describedby={statusId} className="min-w-0 space-y-2">
      <Button type="submit" disabled={disabled} variant="outline" className="min-h-10 cursor-pointer rounded-lg">
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
        {pending ? 'AI 预审中...' : label}
      </Button>
      {/* blocked 时理由来自能力探测（Provider/模型不可用），必须显式说明，否则按钮只是「点了没反应」。 */}
      {preReviewState === 'blocked' && blockedReason ? <p className="text-xs text-muted-foreground">{blockedReason}</p> : null}
      {pending ? <p id={statusId} className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-sm text-primary" role="status" aria-live="polite">AI 预审正在处理完整会话，完成后会更新疑点与标红片段。</p> : null}
      <FormStatus state={state} />
    </form>
  );
}

/**
 * 确认提交整个会话。
 *
 * 会话级动作是核实的终态，但**只物化教师显式处置过的回答**：确认或修订过的进训练数据，
 * 没处理过的跳过。弹窗必须把这个差值写出来——否则教师读完弹窗会以为整段会话都进了
 * 训练数据，而没处理过的那几条永远不会有第二次机会。
 *
 * 封口是这里的**可选**动作（默认不封）：核实完成与「学生能不能继续问」是两件事，
 * 探究型学习、异步答疑、复核后追问都要在已核实但未封口的会话里继续。
 */
export function FinalizeAction({ conversationId, finalized, assistantCount, unprocessedCount, nextSessionHref }: {
  conversationId: string;
  finalized: boolean;
  assistantCount: number;
  /** 既没有确认也没有修订的回答条数——它们不会进入训练数据。 */
  unprocessedCount: number;
  /** 队列里的下一条待核实；已是最后一条时为 undefined。 */
  nextSessionHref?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(finalizeLearningConversation.bind(null, conversationId), initialState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [teacherComment, setTeacherComment] = useState('');
  const [lockConversation, setLockConversation] = useState(false);
  const finalizeStatusId = `finalize_status_${conversationId}`;
  const willMaterialize = Math.max(assistantCount - unprocessedCount, 0);

  // 成功才关弹窗；失败保持打开，让教师在原地看到失败原因（render 阶段比较上一次 state，
  // 与 AuditAnswerEditor 同一套写法——React 19 不允许在 effect 里 setState）。
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.ok && state.message) setConfirmOpen(false);
  }

  useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [router, state]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {nextSessionHref ? (
        <Button nativeButton={false} render={<Link href={nextSessionHref}>下一条待核实<ChevronRight className="ml-1 size-4" /></Link>} variant="ghost" className="min-h-10 cursor-pointer rounded-lg" />
      ) : null}
      <Button type="button" onClick={() => setConfirmOpen(true)} disabled={pending || finalized || willMaterialize === 0} className="min-h-10 cursor-pointer rounded-lg shadow-ink">
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : finalized ? <LockKeyhole className="mr-2 size-4" /> : <CheckCircle2 className="mr-2 size-4" />}
        {pending ? '提交中...' : finalized ? '已提交核实' : '确认提交整个会话'}
      </Button>

      {/* 表单与状态都放进弹窗内：此前 FormStatus 渲染在弹窗「外面」，
          提交失败时弹窗仍然打开，教师看到的却是一个被遮住的提示——等于没报错。
          弹窗只在真正成功后才关，失败留在原地让他看到原因。 */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!pending) setConfirmOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认最终提交？</DialogTitle>
            <DialogDescription>提交后这段会话完成核实。请先确认所有修订已经保存。</DialogDescription>
          </DialogHeader>
          <form action={action} className="space-y-3" aria-busy={pending} aria-describedby={finalizeStatusId}>
            <div className="space-y-2 rounded-lg border border-border/65 bg-muted/40 p-3 text-sm text-muted-foreground">
              <p>本次将提交 {willMaterialize} 条 AI 回答进入教学数据，共 {assistantCount} 条。</p>
              {/* 差值必须显式说出来。提交后不能再改，届时这批未处理的回答就永久留在训练数据之外。 */}
              {unprocessedCount > 0 ? (
                <p className="font-medium text-destructive">本次未处理的 {unprocessedCount} 条回答不会进入训练数据。</p>
              ) : (
                <p className="font-medium text-primary">全部 AI 回答都已确认或修订。</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`teacher_comment_${conversationId}`} className="text-sm font-medium">给学生的评语（可选）</label>
              <textarea
                id={`teacher_comment_${conversationId}`}
                name="teacher_comment"
                value={teacherComment}
                onChange={(event) => setTeacherComment(event.target.value)}
                rows={3}
                placeholder="写一句你希望学生看到的话；留空则不展示评语。"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/65 bg-muted/40 p-3 text-sm">
              <input
                type="checkbox"
                name="lock_conversation"
                checked={lockConversation}
                onChange={(event) => setLockConversation(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                封口：学生不能在该会话继续追问
                <span className="mt-1 block text-xs text-muted-foreground">默认不封口。已核实但未封口的会话学生仍可继续追问，异步答疑与复核后追问都走这条路。</span>
              </span>
            </label>

            <div id={finalizeStatusId}>
              <FormStatus state={state} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>取消</Button>
              <Button type="submit" disabled={pending || finalized} className="cursor-pointer">
                {pending ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : null}
                {pending ? '提交中...' : '确认提交'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * 封口 / 解封。独立于「确认提交整个会话」：教师可以先提交再封口，
 * 也可以解封此前封口的会话——封口是交互开关，不是不可逆的终态。
 */
export function ConversationLockAction({ conversationId, locked }: {
  conversationId: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(setConversationLock.bind(null, conversationId), initialState);
  const lockStatusId = `lock_status_${conversationId}`;

  useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [router, state]);

  return (
    <form action={action} aria-busy={pending} aria-describedby={lockStatusId} className="min-w-0 space-y-2">
      <input type="hidden" name="lock" value={locked ? '' : 'on'} />
      <Button type="submit" disabled={pending} variant="outline" className="min-h-10 cursor-pointer rounded-lg">
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : locked ? <Unlock className="mr-2 size-4" /> : <LockKeyhole className="mr-2 size-4" />}
        {pending ? '处理中...' : locked ? '解封会话' : '封口会话'}
      </Button>
      <p className="text-xs text-muted-foreground">{locked ? '已封口：学生不能在该会话继续追问。' : '未封口：学生可以在该会话继续追问。'}</p>
      <div id={lockStatusId}>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
