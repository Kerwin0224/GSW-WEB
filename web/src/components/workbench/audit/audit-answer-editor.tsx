'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Pencil, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { confirmLearningMessage, reviseLearningRecord, type AuditSubmissionState } from '@/lib/data/teacher-actions';

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

/** 评价维度选择。读不到维度时整块不渲染——教师照常能确认/修订，只是没有维度可选。 */
function DimensionSelect({ messageId, dimensions, defaultValue }: {
  messageId: string;
  dimensions: Array<{ labelKey: string; displayName: string }>;
  defaultValue?: string;
}) {
  if (dimensions.length === 0) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor={`dimension_key_${messageId}`}>评价维度（可选）</Label>
      <select
        id={`dimension_key_${messageId}`}
        name="dimension_key"
        defaultValue={defaultValue ?? ''}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">不指定维度</option>
        {dimensions.map((dimension) => <option key={dimension.labelKey} value={dimension.labelKey}>{dimension.displayName}</option>)}
      </select>
    </div>
  );
}

/**
 * 单条「确认无误」。
 *
 * 它是「哪些回答进入训练数据」的唯一凭据：既没确认也没修订的回答，
 * 在「确认提交整个会话」时会被跳过。不把这个动作摆出来，教师就无从知道
 * 哪几条会被跳过——而提交后不能反悔。
 */
function ConfirmMessageForm({ messageId, dimensions, defaultComment }: {
  messageId: string;
  dimensions: Array<{ labelKey: string; displayName: string }>;
  defaultComment?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(confirmLearningMessage.bind(null, messageId), initialState);
  const [comment, setComment] = useState(defaultComment ?? '');

  // React 19 不允许在 effect 里 setState：用「存住上一次 state + render 阶段比较」判定成功。
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.ok && state.message) setComment('');
  }

  useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [router, state]);

  return (
    <form action={action} className="mt-3 space-y-3 border-t border-border/55 pt-3">
      <DimensionSelect messageId={messageId} dimensions={dimensions} />
      <div className="space-y-2">
        <Label htmlFor={`confirm_comment_${messageId}`}>评语（可选）</Label>
        <Textarea
          id={`confirm_comment_${messageId}`}
          name="teacher_comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="写一句为什么认可这条回答；学生能看到。"
          className="min-h-16 bg-background/88 text-sm"
        />
      </div>
      <FormStatus state={state} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} variant="outline" size="sm" className="cursor-pointer rounded-lg">
          {pending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 size-3.5" />}
          {pending ? '保存中...' : '确认无误'}
        </Button>
      </div>
    </form>
  );
}

/**
 * 单条 AI 回答的处置：确认无误 或 修订回答。
 *
 * 两种处置都是「确认提交整个会话」时才物化训练样本的前置凭据，
 * 本身都不改会话终态。修订在最终提交前是草稿：学生侧立刻可见。
 */
export function AuditAnswerEditor({ messageId, currentAnswer, locked, confirmed, dimensions, dimensionKey, teacherComment }: {
  messageId: string;
  currentAnswer: string;
  /** 会话已核实提交：只读，训练样本已固定。 */
  locked: boolean;
  /** 教师是否已确认过这条——已确认时不再重复显示确认入口。 */
  confirmed: boolean;
  dimensions: Array<{ labelKey: string; displayName: string }>;
  dimensionKey?: string;
  teacherComment?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
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
        这个会话已完成核实提交，训练样本已固定。
      </div>
    );
  }

  if (!editing && !confirming) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/55 pt-3">
        <span className="text-xs text-muted-foreground">
          {confirmed ? '已确认，提交整个会话时进入教学数据。' : '确认无误或修订后，这条回答才会进入教学数据。'}
        </span>
        <span className="flex gap-2">
          {confirmed ? null : (
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)} className="cursor-pointer rounded-lg">
              <CheckCircle2 className="mr-1.5 size-3.5" />
              确认无误
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} className="cursor-pointer rounded-lg">
            <Pencil className="mr-1.5 size-3.5" />
            修订回答
          </Button>
        </span>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="mt-3">
        <div className="mb-2 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} className="cursor-pointer rounded-lg">
            <X className="mr-1.5 size-4" />
            取消
          </Button>
        </div>
        <ConfirmMessageForm messageId={messageId} dimensions={dimensions} defaultComment={teacherComment} />
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
      <DimensionSelect messageId={messageId} dimensions={dimensions} defaultValue={dimensionKey} />
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
      <div className="space-y-2">
        <Label htmlFor={`revise_comment_${messageId}`}>给学生的评语（可选）</Label>
        <Textarea
          id={`revise_comment_${messageId}`}
          name="teacher_comment"
          defaultValue={teacherComment}
          placeholder="写一句你希望学生注意的地方；学生能看到。"
          className="min-h-16 bg-background/88 text-sm"
        />
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
