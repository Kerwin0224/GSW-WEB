'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/data/common';
import { isPresetPurpose, type PresetPurpose } from '@/lib/presets';
import { createClient } from '@/lib/supabase/server';
import { postgresUuidSchema } from '@/lib/request-schemas';

export type PresetStatus = 'draft' | 'published' | 'disabled';

/** 与 lib/data/common.ts 的 ActionState 同形：所有用户可见失败都在这里回传。 */
export type PresetActionState = { ok: boolean; message: string; errors?: Record<string, string> };

const PRESET_STATUSES: PresetStatus[] = ['draft', 'published', 'disabled'];

const STATUS_LABEL: Record<PresetStatus, string> = { draft: '草稿', published: '已发布', disabled: '已停用' };

/**
 * 预设用途的词表与白名单在 lib/presets.ts：'use server' 只能导出 async 函数，
 * 而这份词表要被页面、客户端表单和这里的 server action 三边共用。
 */

/**
 * 解析用途与空间作用域。
 * 空间、班级、学校三选一（数据库 check prompt_presets_scope_single 强制），
 * 所以选了空间就不再写 school_id 与 class_id，否则这一行会被数据库直接拒绝。
 * 用途走白名单：拼错的 purpose 会静默落成「无处生效的预设」，界面却显示保存成功。
 */
function readScope(formData: FormData) {
  const purpose = String(formData.get('purpose') ?? 'chat').trim();
  const spaceId = String(formData.get('space_id') ?? '').trim();
  const errors: Record<string, string> = {};
  if (!isPresetPurpose(purpose)) errors.purpose = '用途不合法，请重新选择。';
  if (spaceId && !postgresUuidSchema.safeParse(spaceId).success) errors.space_id = '空间选择不合法，请重新选择。';
  return { purpose: purpose as PresetPurpose, spaceId: spaceId || null, errors };
}

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
  const scope = readScope(formData);

  const errors: Record<string, string> = { ...scope.errors };
  if (!title) errors.title = '请填写标题。';
  if (!scenario) errors.scenario = '请填写教学场景。';
  if (!systemInstruction) errors.system_instruction = '请填写 System Instruction。';
  if (!PRESET_STATUSES.includes(status)) errors.status = '状态不合法。';
  if (Object.keys(errors).length > 0) return { ok: false, message: '请补齐 Prompt 预设信息。', errors };

  const supabase = await createClient();
  // 取回命中行：被 RLS 过滤的写入既不报错也不返回行，否则界面会显示「已保存」而列表里根本没有它。
  const { data, error } = await supabase
    .from('prompt_presets')
    .insert({
      title,
      scenario,
      system_instruction: systemInstruction,
      variables,
      status,
      purpose: scope.purpose,
      space_id: scope.spaceId,
      class_id: null,
      school_id: null,
      target_role: 'teacher',
      created_by: role.data.id,
    })
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, message: `Prompt 预设保存失败：${error.message}` };
  if (!data) return { ok: false, message: 'Prompt 预设保存失败：数据库没有返回可核对的写入结果，请刷新后确认是否已保存。' };

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
  const scope = readScope(formData);

  const errors: Record<string, string> = { ...scope.errors };
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
  const { data: updated, error } = await supabase
    .from('prompt_presets')
    .update({
      title,
      scenario,
      system_instruction: systemInstruction,
      variables,
      status,
      purpose: scope.purpose,
      space_id: scope.spaceId,
      class_id: null,
      school_id: null,
      version: (current.version ?? 1) + 1,
    })
    .eq('id', presetId)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, message: `Prompt 预设保存失败：${error.message}` };
  if (!updated) return { ok: false, message: 'Prompt 预设保存失败：这条预设不存在或不在你的管理范围内，请刷新列表后重试。' };

  revalidatePath('/admin/presets');
  revalidatePath('/teacher');
  return { ok: true, message: `预设已保存为 v${(current.version ?? 1) + 1}（${STATUS_LABEL[status]}）。` };
}

export async function setPromptPresetStatus(presetId: string, status: PresetStatus): Promise<PresetActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return { ok: false, message: role.message };
  if (!presetId || !PRESET_STATUSES.includes(status)) return { ok: false, message: '未指定预设或目标状态，请刷新预设列表后重试。' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('prompt_presets')
    .update({ status })
    .eq('id', presetId)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, message: `预设状态更新失败：${error.message}` };
  if (!data) return { ok: false, message: '预设状态未更新：这条预设不存在或不在你的管理范围内，请刷新列表后重试。' };

  revalidatePath('/admin/presets');
  revalidatePath('/teacher');
  return { ok: true, message: status === 'published' ? '预设已发布，教师端立即可见。' : status === 'disabled' ? '预设已停用，教师端不再显示。' : '预设已转为草稿。' };
}

export async function deletePromptPreset(presetId: string): Promise<PresetActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return { ok: false, message: role.message };
  if (!presetId) return { ok: false, message: '未指定要删除的预设，请刷新预设列表后重试。' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('prompt_presets')
    .delete()
    .eq('id', presetId)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, message: `预设删除失败：${error.message}` };
  if (!data) return { ok: false, message: '预设未删除：这条预设不存在或不在你的管理范围内，请刷新列表后重试。' };

  revalidatePath('/admin/presets');
  revalidatePath('/teacher');
  return { ok: true, message: '预设已删除。' };
}
