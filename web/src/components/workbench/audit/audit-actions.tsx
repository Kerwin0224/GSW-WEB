'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, LockKeyhole, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { finalizeLearningConversation, runConversationPreReview, type AuditSubmissionState } from '@/lib/data/teacher-actions';
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
 * 确认提交整个会话。会话级动作是核实的唯一终态：
 * 未修订的回答进 SFT，修订回答进 SFT 并生成 DPO；提交后学生不能在该会话继续追问。
 */
export function FinalizeAction({ conversationId, finalized, assistantCount, nextSessionHref }: {
  conversationId: string;
  finalized: boolean;
  assistantCount: number;
  /** 队列里的下一条待核实；已是最后一条时为 undefined。 */
  nextSessionHref?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(finalizeLearningConversation.bind(null, conversationId), initialState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formId = `finalize_conversation_${conversationId}`;

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
      <form id={formId} action={action} className="space-y-2">
        <Button type="button" onClick={() => setConfirmOpen(true)} disabled={pending || finalized || assistantCount === 0} className="min-h-10 cursor-pointer rounded-lg shadow-ink">
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : finalized ? <LockKeyhole className="mr-2 size-4" /> : <CheckCircle2 className="mr-2 size-4" />}
          {pending ? '提交中...' : finalized ? '已提交核实' : '确认提交整个会话'}
        </Button>
        <FormStatus state={state} />
      </form>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认最终提交？</DialogTitle>
            <DialogDescription>提交后这条会话完成核实，学生不能继续追问。请先确认所有修订已经保存。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>取消</Button>
            <Button type="submit" form={formId} disabled={pending}>{pending ? '提交中...' : '确认提交'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
