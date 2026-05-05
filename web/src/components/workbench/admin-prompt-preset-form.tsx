'use client';

import { useActionState } from 'react';
import { Plus } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { savePromptPreset, type AdminActionState } from '@/lib/data/admin';

const initialState: AdminActionState = { ok: false, message: '' };

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive" role="alert">{message}</p> : null;
}

export function AdminPromptPresetFormFields() {
  const [state, action, pending] = useActionState(savePromptPreset, initialState);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="title">标题</Label>
          <Input id="title" name="title" placeholder="苏格拉底式引导" />
          <FieldError message={state.errors?.title} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scenario">教学场景</Label>
          <Input id="scenario" name="scenario" placeholder="课堂追问 / 练习设计" />
          <FieldError message={state.errors?.scenario} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="system_instruction">System Instruction</Label>
          <Textarea id="system_instruction" name="system_instruction" className="min-h-32 font-mono" />
          <FieldError message={state.errors?.system_instruction} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="variables">变量</Label>
          <Input id="variables" name="variables" placeholder="篇目, 年级, 学生误区" />
        </div>
        <div className="space-y-2">
          <Label>状态</Label>
          <Select name="status" defaultValue="draft">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">draft</SelectItem>
              <SelectItem value="published">published</SelectItem>
              <SelectItem value="disabled">disabled</SelectItem>
            </SelectContent>
          </Select>
          <FieldError message={state.errors?.status} />
        </div>
      </div>
      {state.message ? (
        <Alert variant={state.ok ? 'default' : 'destructive'}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <Plus className="mr-2 size-4" />{pending ? '保存中…' : '保存预设'}
        </Button>
      </div>
    </form>
  );
}

export function AdminPromptPresetDialog() {
  return (
    <AdminDialogShell
      trigger={(
        <Button type="button">
          <Plus className="mr-2 size-4" />新建预设
        </Button>
      )}
      title="新建 Prompt 预设"
      description="保存为草稿或发布新版本，历史互动可追踪版本。"
      icon={<Plus className="size-5" />}
      className="max-w-2xl"
    >
      <AdminPromptPresetFormFields />
    </AdminDialogShell>
  );
}
