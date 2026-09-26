'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { Loader2, Scale } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { appealStateLabel, resolveVerificationAppeal, type ActionState, type TeacherAppeal } from '@/lib/data/appeals';

const initialState: ActionState = { ok: false, message: '' };

/**
 * 申诉处理面板。
 *
 * 两条处理路径只有「维持原结论」与「撤回结论」，都要填处理说明——
 * 学生提了申诉却收不到任何回音，下次就不会再提了，处理路径也就白开。
 * 撤回只改申诉表的处理说明，不回改已物化的训练样本：那批样本可能已进导出批次，
 * 静默改写会让导出记录与实际内容对不上。
 */
export function AppealResolver({ appeals }: { appeals: TeacherAppeal[] }) {
  if (appeals.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">当前没有待处理的学生申诉。学生对已核实的会话提出异议时会出现在这里。</p>
    );
  }
  return (
    <ul className="space-y-2">
      {appeals.map((appeal) => <AppealRow key={appeal.id} appeal={appeal} />)}
    </ul>
  );
}

function AppealRow({ appeal }: { appeal: TeacherAppeal }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(resolveVerificationAppeal.bind(null, appeal.id), initialState);
  const [note, setNote] = useState(appeal.resolutionNote ?? '');

  // React 19 不允许在 effect 里 setState：存住上一次 state，render 阶段比较。
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.ok && state.message) setNote('');
  }

  useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [router, state]);

  return (
    <li className="space-y-2 rounded-lg border border-primary/25 bg-primary/6 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Scale className="size-3.5 text-primary" aria-hidden="true" />
        <span className="font-medium">{appeal.studentName}</span>
        <span className="text-muted-foreground">{appeal.className} · 《{appeal.projectName}》</span>
        <Badge variant={appeal.state === 'open' ? 'destructive' : 'secondary'}>{appealStateLabel(appeal.state)}</Badge>
        <span className="text-muted-foreground">{new Date(appeal.createdAt).toLocaleString('zh-CN')}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm">{appeal.body}</p>
      {appeal.teacherComment ? <p className="text-xs text-muted-foreground">我给的评语：{appeal.teacherComment}</p> : null}

      {appeal.state === 'open' ? (
        <form action={action} className="space-y-2">
          <label htmlFor={`resolution_note_${appeal.id}`} className="text-xs font-medium">处理说明（学生可见）</label>
          <textarea
            id={`resolution_note_${appeal.id}`}
            name="resolution_note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="说明你为什么维持或撤回；学生会看到这句话。"
            className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
          />
          {state.errors?.resolution_note ? <p className="text-xs text-destructive">{state.errors.resolution_note}</p> : null}
          {state.message ? <p className={state.ok ? 'text-xs text-primary' : 'text-xs text-destructive'} role={state.ok ? 'status' : 'alert'}>{state.message}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="submit" name="state" value="upheld" disabled={pending} variant="outline" size="sm" className="cursor-pointer rounded-lg">
              {pending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              维持原结论
            </Button>
            <Button type="submit" name="state" value="withdrawn" disabled={pending} size="sm" className="cursor-pointer rounded-lg">
              {pending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              撤回结论
            </Button>
          </div>
        </form>
      ) : appeal.resolutionNote ? (
        <p className="text-xs text-muted-foreground">处理说明：{appeal.resolutionNote}</p>
      ) : null}
    </li>
  );
}
