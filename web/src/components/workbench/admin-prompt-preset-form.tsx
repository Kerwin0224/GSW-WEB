'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { createPromptPreset, deletePromptPreset, setPromptPresetStatus, updatePromptPreset, type PresetActionState, type PresetStatus } from '@/app/admin/presets/actions';

const initialState: PresetActionState = { ok: false, message: '' };

/** 列表与编辑弹窗共用的预设数据（来自 prompt_presets 行）。 */
export type PromptPresetItem = {
  id: string;
  title: string;
  scenario: string;
  system_instruction: string;
  variables: unknown;
  status: PresetStatus;
  version: number;
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive" role="alert">{message}</p> : null;
}

type PresetFormProps = {
  action: (state: PresetActionState, formData: FormData) => Promise<PresetActionState>;
  initial?: PromptPresetItem;
  submitLabel: string;
  /** 保存成功后由外层关窗并重置，避免"关了又带着旧值重开"。 */
  onSaved?: (message: string) => void;
};

function PresetForm({ action, initial, submitLabel, onSaved }: PresetFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.ok && onSaved) onSaved(state.message);
    // 只在一次新的成功结果上触发；state 对象每次渲染都不同。
  }, [state, onSaved]);

  const variables = Array.isArray(initial?.variables) ? initial.variables.join(', ') : '';

  return (
    <form action={formAction} className="space-y-4">
      {initial ? <input type="hidden" name="preset_id" value={initial.id} /> : null}
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="title">标题</Label>
          <Input id="title" name="title" defaultValue={initial?.title} placeholder="苏格拉底式引导" />
          <FieldError message={state.errors?.title} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scenario">教学场景</Label>
          <Input id="scenario" name="scenario" defaultValue={initial?.scenario} placeholder="课堂追问 / 挑战设计" />
          <FieldError message={state.errors?.scenario} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="system_instruction">System Instruction</Label>
          <Textarea id="system_instruction" name="system_instruction" defaultValue={initial?.system_instruction} className="min-h-32 font-mono" />
          <FieldError message={state.errors?.system_instruction} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="variables">变量</Label>
          <Input id="variables" name="variables" defaultValue={variables} placeholder="学习内容, 年级, 学生误区" />
          <p className="text-xs text-muted-foreground">多个变量请用半角逗号分隔。</p>
        </div>
        <div className="space-y-2">
          <Label>状态</Label>
          <Select name="status" defaultValue={initial?.status ?? 'draft'}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">草稿</SelectItem>
              <SelectItem value="published">已发布</SelectItem>
              <SelectItem value="disabled">已停用</SelectItem>
            </SelectContent>
          </Select>
          <FieldError message={state.errors?.status} />
        </div>
      </div>
      {state.message ? (
        <Alert variant={state.ok ? 'default' : 'destructive'} role={state.ok ? 'status' : 'alert'}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {pending ? '保存中…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function AdminPromptPresetDialog() {
  const [open, setOpen] = useState(false);
  return (
    <AdminDialogShell
      open={open}
      onOpenChange={setOpen}
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
      <PresetForm
        action={createPromptPreset}
        submitLabel="保存预设"
        onSaved={() => setOpen(false)}
      />
    </AdminDialogShell>
  );
}

/** 列表行的编辑入口：预填当前内容，保存后关窗并回到列表的最新状态。 */
export function AdminPromptPresetEditDialog({ preset }: { preset: PromptPresetItem }) {
  const [open, setOpen] = useState(false);
  return (
    <AdminDialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={(
        <Button type="button" variant="outline" size="sm">
          <Pencil className="mr-1 size-3.5" />编辑
        </Button>
      )}
      title={`编辑预设 · v${preset.version}`}
      description="保存后会记为新版本，历史互动仍按旧版本追溯。"
      icon={<Pencil className="size-5" />}
      className="max-w-2xl"
    >
      <PresetForm
        action={updatePromptPreset}
        initial={preset}
        submitLabel="保存修改"
        onSaved={() => setOpen(false)}
      />
    </AdminDialogShell>
  );
}

/** 发布 / 停用 / 删除：危险操作都先确认，结果就地提示。 */
export function PresetRowActions({ preset }: { preset: PromptPresetItem }) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function changeStatus(status: PresetStatus) {
    startTransition(async () => {
      const result = await setPromptPresetStatus(preset.id, status);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deletePromptPreset(preset.id);
      setConfirmDelete(false);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <AdminPromptPresetEditDialog preset={preset} />
      {preset.status === 'published' ? (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => changeStatus('disabled')}>
          停用
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => changeStatus('published')}>
          发布
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmDelete(true)}>
        <Trash2 className="mr-1 size-3.5" />删除
      </Button>

      <AdminDialogShell
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`删除预设「${preset.title}」`}
        description="删除后教师端立即不再显示该预设。"
        icon={<Trash2 className="size-5" />}
        className="max-w-md"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>取消</Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
              {pending ? <><Loader2 className="mr-2 size-4 animate-spin" />删除中…</> : '确认删除'}
            </Button>
          </>
        )}
      >
        <Alert variant="destructive">
          <AlertDescription>
            已产生的历史互动仍会记录预设 ID 与版本，但界面上无法再找回这个预设的正文。只想暂时下线请改用「停用」。
          </AlertDescription>
        </Alert>
      </AdminDialogShell>
    </div>
  );
}
