'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { closeAssignment, type ActionState } from '@/lib/data/assignments';

const initialState: ActionState = { ok: false, message: '' };

/** 关闭任务。学生端不再看到它，但已有的提交物与核实记录全部保留。 */
export function AssignmentCloseButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(closeAssignment, initialState);

  useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [router, state]);

  return (
    <form action={action}>
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="cursor-pointer rounded-lg">
        {pending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
        {pending ? '关闭中...' : '关闭任务'}
      </Button>
      {state.message ? <span className={state.ok ? 'ml-2 text-xs text-primary' : 'ml-2 text-xs text-destructive'}>{state.message}</span> : null}
    </form>
  );
}
