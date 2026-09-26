'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/data/common';
import { createClient } from '@/lib/supabase/server';

export type PresetStatus = 'draft' | 'published' | 'disabled';

/** 与 lib/data/common.ts 的 ActionState 同形：所有用户可见失败都在这里回传。 */
export type PresetActionState = { ok: boolean; message: string; errors?: Record<string, string> };

const PRESET_STATUSES: PresetStatus[] = ['draft', 'published', 'disabled'];

const STATUS_LABEL: Record<PresetStatus, string> = { draft: '草稿', published: '已发布', disabled: '已停用' };

/**
 * Prompt 预设的建 / 改 / 发 / 停 / 删。
 *
 * prompt_presets 只有这一处写入口：留在 app/admin/presets 属于"只有这个页面在用"的实现，
 * 不进 lib/data 的公共导出面。
 */
export async function createPromptPreset(_previousState: PresetActionState, formData: FormData): Promise<PresetActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return { ok: false, message: role.message };

  const title = String(formData.get('title') ?? '').trim();
  const scenario = String(formData.get('scenario') ?? '').trim();
  const systemInstruction = String(formData.get('system_instruction') ?? '').trim();
  const variables = String(formData.get('variables') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const status = String(formData.get('status') ?? 'draft') as PresetStatus;

  const errors: Record<string, string> = {};
  if (!title) errors.title = '请填写标题。';
  if (!scenario) errors.scenario = '请填写教学场景。';
  if (!systemInstruction) errors.system_instruction = '请填写 System Instruction。';
  if (!PRESET_STATUSES.includes(status)) errors.status = '状态不合法。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐 Prompt 预设信息。', errors };

  const supabase = await createClient();
  const { error } = await supabase
    .from('prompt_presets')
    .insert({ title, scenario, system_instruction: systemInstruction, variables, status, target_role: 'teacher', created_by: role.data.id });
  if (error) return { ok: false, message: `Prompt 预设保存失败：${error.message}` };

  revalidatePath('/admin/presets');
  revalidatePath('/teacher');
  return { ok: true, message: `预设已保存（${STATUS_LABEL[status]}）。` };
}
export async function updatePromptPreset(_previousState: PresetActionState, formData: FormData): Promise<PresetActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return { ok: false, message: role.message };

  const presetId = String(formData.get('preset_id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const scenario = String(formData.get('scenario') ?? '').trim();
  const systemInstruction = String(formData.get('system_instruction') ?? '').trim();
  const variables = String(formData.get('variables') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const status = String(formData.get('status') ?? 'draft') as PresetStatus;

  const errors: Record<string, string> = {};
  if (!presetId) errors.preset_id = '缺少预设 ID。';
  if (!title) errors.title = '请填写标题。';
  if (!scenario) errors.scenario = '请填写教学场景。';
  if (!systemInstruction) errors.system_instruction = '请填写 System Instruction。';
  if (!PRESET_STATUSES.includes(status)) errors.status = '状态不合法。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐 Prompt 预设信息。', errors };

  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase
    .from('prompt_presets')
    .select('version')
    .eq('id', presetId)
    .maybeSingle();
  if (loadError) return { ok: false, message: `预设读取失败：${loadError.message}` };
  if (!current) return { ok: false, message: '预设不存在，可能已被删除。' };

  // 编辑即新版本：历史互动按版本回溯，悄悄改写同一版本会让追溯失真。
  const { error } = await supabase
    .from('prompt_presets')
    .update({ title, scenario, system_instruction: systemInstruction, variables, status, version: (current.version ?? 1) + 1 })
    .eq('id', presetId);
  if (error) return { ok: false, message: `Prompt 预设保存失败：${error.message}` };

  revalidatePath('/admin/presets');
  revalidatePath('/teacher');
  return { ok: true, message: `预设已保存为 v${(current.version ?? 1) + 1}（${STATUS_LABEL[status]}）。` };
}

export async function setPromptPresetStatus(presetId: string, status: PresetStatus): Promise<PresetActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return { ok: false, message: role.message };
  if (!presetId || !PRESET_STATUSES.includes(status)) return { ok: false, message: '未指定预设或目标状态，请刷新预设列表后重试。' };

  const supabase = await createClient();
  const { error } = await supabase.from('prompt_presets').update({ status }).eq('id', presetId);
  if (error) return { ok: false, message: `预设状态更新失败：${error.message}` };

  revalidatePath('/admin/presets');
  revalidatePath('/teacher');
  return { ok: true, message: status === 'published' ? '预设已发布，教师端立即可见。' : status === 'disabled' ? '预设已停用，教师端不再显示。' : '预设已转为草稿。' };
}

export async function deletePromptPreset(presetId: string): Promise<PresetActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return { ok: false, message: role.message };
  if (!presetId) return { ok: false, message: '未指定要删除的预设，请刷新预设列表后重试。' };

  const supabase = await createClient();
  const { error } = await supabase.from('prompt_presets').delete().eq('id', presetId);
  if (error) return { ok: false, message: `预设删除失败：${error.message}` };

  revalidatePath('/admin/presets');
  revalidatePath('/teacher');
  return { ok: true, message: '预设已删除。' };
}
