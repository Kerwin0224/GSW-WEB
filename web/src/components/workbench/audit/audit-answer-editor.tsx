'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { Loader2, Pencil, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { reviseLearningRecord, type AuditSubmissionState } from '@/lib/data/teacher-actions';

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

/**
 * 修订回答。修订在最终提交前是草稿：学生侧立刻可见，但不会马上生成 SFT/DPO 样本
 * （样本由会话级最终提交物化，见 CONTEXT.md）。
 */
export function AuditAnswerEditor({ messageId, currentAnswer, locked }: {
  messageId: string;
  currentAnswer: string;
  /** 会话已最终提交：只读，不再允许修订。 */
  locked: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [corrected, setCorrected] = useState(currentAnswer);
  const [rationale, setRationale] = useState('');
  const [state, action, pending] = useActionState(reviseLearningRecord.bind(null, messageId), initialState);
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

  if (locked) {
    return (
      <div className="mt-3 rounded-lg border border-border/60 bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
        该会话已完成最终核实提交，学生不能继续追问。
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/55 pt-3">
        <span className="text-xs text-muted-foreground">修订会立即同步给学生；整条会话仍需在底部最终提交。</span>
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
        <Label htmlFor={`corrected_answer_${messageId}`}>直接编辑学生侧可见回答</Label>
        <Textarea
          id={`corrected_answer_${messageId}`}
          name="corrected_answer"
          value={corrected}
          onChange={(event) => setCorrected(event.target.value)}
          className="min-h-40 bg-background/88 text-sm leading-7"
        />
        <FieldError message={state.errors?.corrected_answer} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`rationale_${messageId}`}>修订说明（可选）</Label>
        <Textarea
          id={`rationale_${messageId}`}
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
