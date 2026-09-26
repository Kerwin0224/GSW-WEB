'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import type { AdminReviewDimension } from '@/lib/data/review-dimensions';
import {
  removeReviewDimension,
  shiftReviewDimension,
  submitReviewDimension,
  toggleReviewDimension,
  type DimensionActionState,
} from './actions';
import { DIMENSION_IMPACT_HINT } from './dimension-copy';

const SEVERITY_LABEL: Record<string, string> = { low: '轻微（low）', medium: '可疑（medium）', high: '严重（high）' };

const initialState: DimensionActionState = { ok: false, message: '' };

type DimensionFormProps = {
  initial?: AdminReviewDimension;
  submitLabel: string;
  onSaved?: () => void;
};

function DimensionForm({ initial, submitLabel, onSaved }: DimensionFormProps) {
  const [state, formAction, pending] = useActionState(submitReviewDimension, initialState);

  useEffect(() => {
    if (state.ok && onSaved) onSaved();
    // 只在一次新的成功结果上触发；state 对象每次渲染都不同。
  }, [state, onSaved]);

  return (
    <form action={formAction} className="space-y-4">
      {initial ? <input type="hidden" name="dimension_id" value={initial.id} /> : null}
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="label_key">稳定键</Label>
            <Input id="label_key" name="label_key" defaultValue={initial?.labelKey} placeholder="unit_dimension_error" />
            <p className="text-xs text-muted-foreground">小写字母开头，只含小写字母、数字与下划线。它是疑点的聚合口径，改名会让历史疑点无法归类。</p>
            {state.errors?.label_key ? <p className="text-xs text-destructive" role="alert">{state.errors.label_key}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="display_name">显示名</Label>
            <Input id="display_name" name="display_name" defaultValue={initial?.displayName} placeholder="量纲错误" />
            {state.errors?.display_name ? <p className="text-xs text-destructive" role="alert">{state.errors.display_name}</p> : null}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="criteria">判定说明</Label>
          <Textarea id="criteria" name="criteria" defaultValue={initial?.criteria} className="min-h-20" placeholder="把公式、单位、量纲写错，或给出在本学科不成立的结论" />
          <p className="text-xs text-muted-foreground">这一句是租户的教学承诺，显示名改动不会改它。</p>
          {state.errors?.criteria ? <p className="text-xs text-destructive" role="alert">{state.errors.criteria}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="prompt_fragment">给模型的判定说明</Label>
          <Textarea id="prompt_fragment" name="prompt_fragment" defaultValue={initial?.promptFragment} className="min-h-20" placeholder="讲错公式、单位或量纲。" />
          <p className="text-xs text-muted-foreground">留空则直接用上面的判定说明。</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>默认严重度</Label>
            <Select name="default_severity" defaultValue={initial?.defaultSeverity ?? 'medium'}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SEVERITY_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.errors?.default_severity ? <p className="text-xs text-destructive" role="alert">{state.errors.default_severity}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sort_order">顺序</Label>
            <Input id="sort_order" name="sort_order" type="number" defaultValue={initial?.sortOrder ?? 100} />
            <p className="text-xs text-muted-foreground">数字小的排前面，决定提示词里维度的先后。</p>
            {state.errors?.sort_order ? <p className="text-xs text-destructive" role="alert">{state.errors.sort_order}</p> : null}
          </div>
        </div>
      </div>
      <Alert>
        <AlertDescription>{DIMENSION_IMPACT_HINT}</AlertDescription>
      </Alert>
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

export function DimensionCreateDialog() {
  const [open, setOpen] = useState(false);
  return (
    <AdminDialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={<Button type="button"><Plus className="mr-2 size-4" />新增维度</Button>}
      title="新增评价维度"
      description="新增只影响本校：平台默认维度不受影响，两套按稳定键合并，本校同键优先。"
      icon={<Plus className="size-5" />}
      className="max-w-2xl"
    >
      <DimensionForm submitLabel="保存维度" onSaved={() => setOpen(false)} />
    </AdminDialogShell>
  );
}

function DimensionEditDialog({ dimension }: { dimension: AdminReviewDimension }) {
  const [open, setOpen] = useState(false);
  return (
    <AdminDialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={<Button type="button" variant="outline" size="sm"><Pencil className="mr-1 size-3.5" />编辑</Button>}
      title={`编辑维度 · ${dimension.displayName}`}
      description="保存后立刻对下一次 AI 预审生效。"
      icon={<Pencil className="size-5" />}
      className="max-w-2xl"
    >
      <DimensionForm initial={dimension} submitLabel="保存修改" onSaved={() => setOpen(false)} />
    </AdminDialogShell>
  );
}

/** 启用 / 停用 / 上下调序 / 删除：停用与删除都先确认，并说明影响。 */
export function DimensionRowActions({ dimension, isFirst, isLast }: { dimension: AdminReviewDimension; isFirst: boolean; isLast: boolean }) {
  const [pending, startTransition] = useTransition();
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function run(action: () => Promise<DimensionActionState>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <DimensionEditDialog dimension={dimension} />
      <Button type="button" variant="outline" size="sm" disabled={pending || isFirst} title={isFirst ? '已经是第一条' : '上移'} onClick={() => run(() => shiftReviewDimension(dimension.id, 'up'))}>
        <ArrowUp className="size-3.5" />
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={pending || isLast} title={isLast ? '已经是最后一条' : '下移'} onClick={() => run(() => shiftReviewDimension(dimension.id, 'down'))}>
        <ArrowDown className="size-3.5" />
      </Button>
      {dimension.enabled ? (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirmDisable(true)}>停用</Button>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => toggleReviewDimension(dimension.id, true))}>启用</Button>
      )}
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmDelete(true)}>
        <Trash2 className="mr-1 size-3.5" />删除
      </Button>

      <AdminDialogShell
        open={confirmDisable}
        onOpenChange={setConfirmDisable}
        title={`停用维度「${dimension.displayName}」`}
        description="停用后 AI 预审不再检查这一类疑点。"
        className="max-w-md"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmDisable(false)} disabled={pending}>取消</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => run(async () => { setConfirmDisable(false); return toggleReviewDimension(dimension.id, false); })}>
              {pending ? <><Loader2 className="mr-2 size-4 animate-spin" />处理中…</> : '确认停用'}
            </Button>
          </>
        )}
      >
        <Alert variant="destructive">
          <AlertDescription>
            已经产生的疑点不会被删除，仍按「{dimension.displayName}」显示；只是下一次预审不再检查这一类。要恢复随时可以重新启用。
          </AlertDescription>
        </Alert>
      </AdminDialogShell>

      <AdminDialogShell
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`删除本校维度「${dimension.displayName}」`}
        description="删除的是本校覆盖，不是平台默认。"
        icon={<Trash2 className="size-5" />}
        className="max-w-md"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>取消</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => run(async () => { setConfirmDelete(false); return removeReviewDimension(dimension.id); })}>
              {pending ? <><Loader2 className="mr-2 size-4 animate-spin" />删除中…</> : '确认删除'}
            </Button>
          </>
        )}
      >
        <Alert variant="destructive">
          <AlertDescription>
            {dimension.origin === 'platform' ? '这个稳定键在平台默认里还有一条，删除本校覆盖后它会立刻回落到平台默认的判定口径。' : '这是本校独有的维度，删除后 AI 预审不再检查这一类疑点，历史疑点仍按原标签保留。'}
          </AlertDescription>
        </Alert>
      </AdminDialogShell>
    </div>
  );
}
