'use client';

import { useActionState } from 'react';
import { Plus } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClass, type AdminActionState } from '@/lib/data/admin';

const initialState: AdminActionState = { ok: false, message: '' };

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive" role="alert">{message}</p> : null;
}

export function AdminClassCreateForm() {
  const [state, action, pending] = useActionState(createClass, initialState);

  return (
    <form action={action} className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-2">
        <Label htmlFor="name">班级名称</Label>
        <Input id="name" name="name" placeholder="高一(3)班" />
        <FieldError message={state.errors?.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="grade">年级</Label>
        <Input id="grade" name="grade" placeholder="高一" />
      </div>
      <Button type="submit" className="self-end" disabled={pending}>
        <Plus className="mr-2 size-4" />{pending ? '创建中…' : '创建班级'}
      </Button>
      {state.message ? (
        <Alert variant={state.ok ? 'default' : 'destructive'} className="md:col-span-3">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
