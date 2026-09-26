'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createAssignment, ASSIGNMENT_KINDS, type ActionState, type AssignmentKind } from '@/lib/data/assignments';

const initialState: ActionState = { ok: false, message: '' };

/**
 * 布置任务。
 *
 * 受众两种：按班级/空间（学生侧靠 RLS 看到），或点名若干学生。
 * 点名与「按班级」互斥不清会让教师以为自己两样都做了、实际只有一人生效，
 * 所以点名列只在选了班级或空间后才可展开。
 */
export function AssignmentCreateForm({ classOptions, spaceOptions, studentOptions }: {
  classOptions: Array<{ classId: string; className: string }>;
  spaceOptions: Array<{ spaceId: string; spaceName: string }>;
  studentOptions: Array<{ studentId: string; studentName: string }>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createAssignment, initialState);
  const [kind, setKind] = useState<AssignmentKind>('practice');
  const [scopeChosen, setScopeChosen] = useState(false);

  // React 19 不允许在 effect 里 setState：存住上一次 state，render 阶段比较。
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.ok && state.message) setScopeChosen(false);
  }

  useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [router, state]);

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="assignment_title">任务标题</Label>
        <input id="assignment_title" name="title" maxLength={120} required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        {state.errors?.title ? <p className="text-xs text-destructive">{state.errors.title}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="assignment_instructions">任务说明（可选）</Label>
        <Textarea id="assignment_instructions" name="instructions" rows={3} maxLength={4000} placeholder="写清要做什么、做到什么程度；留空则学生只看得到标题。" className="bg-background/88 text-sm" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="assignment_kind">任务类型</Label>
          <select id="assignment_kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value as AssignmentKind)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            {ASSIGNMENT_KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assignment_target_level">目标层级（可选）</Label>
          <select id="assignment_target_level" name="target_level" defaultValue="" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="">不指定</option>
            {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>第 {level} 层</option>)}
          </select>
          {state.errors?.target_level ? <p className="text-xs text-destructive">{state.errors.target_level}</p> : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="assignment_class">按班级布置</Label>
          <select
            id="assignment_class"
            name="class_id"
            onChange={() => setScopeChosen(true)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">不按班级</option>
            {classOptions.map((option) => <option key={option.classId} value={option.classId}>{option.className}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assignment_space">按空间布置</Label>
          <select
            id="assignment_space"
            name="space_id"
            onChange={() => setScopeChosen(true)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">不按空间</option>
            {spaceOptions.map((option) => <option key={option.spaceId} value={option.spaceId}>{option.spaceName}</option>)}
          </select>
        </div>
      </div>
      {state.errors?.scope ? <p className="text-xs text-destructive">{state.errors.scope}</p> : null}

      <div className="space-y-1.5">
        <Label htmlFor="assignment_due">截止时间（可选）</Label>
        <input id="assignment_due" name="due_at" type="datetime-local" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        {state.errors?.due_at ? <p className="text-xs text-destructive">{state.errors.due_at}</p> : null}
      </div>

      <fieldset className="space-y-1.5 rounded-lg border border-border/60 p-3" disabled={!scopeChosen}>
        <legend className="px-1 text-xs font-medium">点名学生（不选则面向该班级/空间全体）</legend>
        {!scopeChosen ? <p className="text-xs text-muted-foreground">先选班级或空间，才能点名学生。</p> : null}
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {studentOptions.map((option) => (
            <label key={option.studentId} className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="recipients" value={option.studentId} />
              <span>{option.studentName}</span>
            </label>
          ))}
        </div>
        {studentOptions.length === 0 && scopeChosen ? <p className="text-xs text-muted-foreground">你任教班级里还没有学生。</p> : null}
        {state.errors?.recipients ? <p className="text-xs text-destructive">{state.errors.recipients}</p> : null}
      </fieldset>

      {state.message ? (
        <p className={state.ok ? 'rounded-lg border border-primary/20 bg-primary/5 p-2 text-sm text-primary' : 'rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive'} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="cursor-pointer rounded-lg shadow-ink">
          {pending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Send className="mr-1.5 size-4" />}
          {pending ? '布置中...' : '布置任务'}
        </Button>
      </div>
    </form>
  );
}
