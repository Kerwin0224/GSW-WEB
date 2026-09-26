'use client';

import { useState } from 'react';
import { Loader2, MessageSquareQuote, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * teacher-feedback-card.tsx —— 学生侧的只读「教师反馈」卡。
 *
 * 为什么必须有这张卡：核实此前对学生完全不可见。学生看到的是「我的会话突然不能问了」，
 * 既不知道结论是什么，也没有渠道说「AI 那句是对的」。核实结论一旦写进训练数据，
 * 学生就没有第二次机会——所以「有回执」和「能申诉」是核实闭环的一部分，不是附属功能。
 *
 * 接线位置（父 Agent）：`src/components/workbench/student-chat-client.tsx` 里，
 * 会话头部或消息列表顶部，教师评语非空 / 已核实 / 已有申诉三者任一成立时渲染。
 * 数据来源：`GET /api/appeals`（我提过的申诉）+ 会话行上的
 * `teacher_comment` / `finalized_at` / `locked_at`（`getStudentConversation` 已在读）。
 * 该客户端文件不在本线文件清单内，故未直接接入。
 */
export type StudentAppealSummary = {
  id: string;
  conversationId: string;
  state: 'open' | 'upheld' | 'withdrawn';
  body: string;
  resolutionNote: string | null;
  createdAt: string;
};

const STATE_COPY: Record<StudentAppealSummary['state'], { label: string; tone: string }> = {
  open: { label: '申诉待处理', tone: 'text-primary' },
  upheld: { label: '教师维持原结论', tone: 'text-muted-foreground' },
  withdrawn: { label: '教师撤回了原结论', tone: 'text-primary' },
};

export function TeacherFeedbackCard({ conversationId, teacherComment, finalizedAt, locked, appeals, onAppealResolved }: {
  conversationId: string;
  /** 教师在确认提交整个会话时写的会话级评语。 */
  teacherComment: string | null;
  finalizedAt: string | null;
  locked: boolean;
  /** 我对这段会话提过的申诉，按时间倒序。 */
  appeals: StudentAppealSummary[];
  /** 申诉提交成功后回调，父组件据此刷新会话。 */
  onAppealResolved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // 已核实才有申诉可提；已封口不影响申诉——封口只关追问，不关反馈。
  const canAppeal = Boolean(finalizedAt);
  const openAppeal = appeals.find((appeal) => appeal.state === 'open');

  async function submit() {
    if (!body.trim()) {
      setError('请写清楚你不同意的结论。');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/appeals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId, body }),
      });
      const payload = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.message ?? payload.error ?? '申诉提交失败，请稍后重试。');
        return;
      }
      setBody('');
      setOpen(false);
      setDone(payload.message ?? '申诉已提交，教师会在核实队列里看到。');
      onAppealResolved?.();
    } catch {
      setError('网络异常，申诉没有提交。请稍后重试。');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-primary/25 bg-primary/6 p-4" aria-label="教师反馈">
      <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
        <MessageSquareQuote className="size-4" aria-hidden="true" />
        教师反馈
      </p>

      {finalizedAt ? (
        <p className="text-xs text-muted-foreground">
          教师已于 {new Date(finalizedAt).toLocaleString('zh-CN')} 完成这段会话的核实
          {locked ? '，并已封口（不能继续追问）' : '（你仍可继续追问）'}。
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">这段会话还没有完成教师核实。</p>
      )}

      {teacherComment ? (
        <p className="whitespace-pre-wrap rounded-lg border border-primary/20 bg-background/70 p-3 text-sm leading-6">{teacherComment}</p>
      ) : (
        <p className="text-xs text-muted-foreground">教师没有留下评语。</p>
      )}

      {appeals.length > 0 ? (
        <ul className="space-y-2">
          {appeals.map((appeal) => (
            <li key={appeal.id} className="rounded-lg border border-border/60 bg-background/70 p-3 text-xs">
              <p className={cn('font-medium', STATE_COPY[appeal.state].tone)}>{STATE_COPY[appeal.state].label}</p>
              <p className="mt-1 text-muted-foreground">我提交于 {new Date(appeal.createdAt).toLocaleString('zh-CN')}：{appeal.body}</p>
              {appeal.resolutionNote ? <p className="mt-1 text-foreground">教师回复：{appeal.resolutionNote}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {done ? <p className="text-xs text-primary" role="status">{done}</p> : null}

      {/* 已有未处理申诉时不重复给入口：一个会话只留一条待处理，否则教师队列被刷长。 */}
      {canAppeal && !openAppeal ? (
        open ? (
          <div className="space-y-2">
            <label htmlFor={`appeal_body_${conversationId}`} className="text-xs font-medium">你不同意哪一条结论？</label>
            <textarea
              id={`appeal_body_${conversationId}`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              placeholder="指出你认为是错的那条回答，以及你判断的依据。"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { setOpen(false); setError(null); }} disabled={pending} className="cursor-pointer rounded-lg">
                取消
              </Button>
              <Button type="button" size="sm" onClick={submit} disabled={pending} className="cursor-pointer rounded-lg">
                {pending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Send className="mr-1.5 size-3.5" />}
                {pending ? '提交中...' : '提交申诉'}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="cursor-pointer rounded-lg">
            对核实结论提出申诉
          </Button>
        )
      ) : null}
      {openAppeal ? <p className="text-xs text-muted-foreground">申诉已提交，教师处理后可在此看到回复。</p> : null}
    </section>
  );
}
