'use server';

/**
 * space-settings.ts —— 空间的可配置项（科目词表绑定 + 学生首屏追问示例）。
 *
 * 为什么单独成文件而不是并进 spaces.ts：
 * - 科目不再自由文本。spaces.subject 是历史兼容列，spaces.subject_id 才是归一化锚点；
 *   词表那张表的管理策略（谁能新建、别名怎么算等价）与空间的增删改不是一件事。
 * - 词表是租户数据：subjects 的读策略按学校锚点，教师侧未必读得到全校词表，
 *   所以下拉列表必须把「词表里有的」和「我自己空间里已经在用的」合并——
 *   否则教师打开面板会看到一个空列表，又退回自由文本。
 * - 首屏追问示例是空间作者写给学生首屏的四句话，与归类规则（theme）不是一回事。
 *
 * 所有写入都取回命中行：RLS 过滤掉的 update 返回 0 行，报「已保存」就是撒谎。
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { fail, ok, requireRole, type ActionState, type DataResult } from './common';

/** 科目下拉的一项：id 来自词表（catalog），无 id 的来自已在用的自由文本（existing）。 */
export type SubjectOption = { id: string | null; name: string; source: 'catalog' | 'existing' };

/** 空间面板要的两项空间级配置；TeacherSpace 形状里没有，所以单独读一次窄列。 */
export type SpaceSetting = { subjectId: string | null; starterPrompts: string[] };

export type SpaceSettingsMap = Record<string, SpaceSetting>;

export const STARTER_PROMPT_SLOTS = 4;
const MAX_STARTER_PROMPT_LENGTH = 60;

/** jsonb 里存的是任意 JSON；只认字符串数组，其余一律当作没配（回落默认追问示例）。 */
export function readStarterPrompts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= MAX_STARTER_PROMPT_LENGTH)
    .slice(0, STARTER_PROMPT_SLOTS);
}

function actionResult(okResult: boolean, message: string, errors?: Record<string, string>): ActionState {
  return errors ? { ok: okResult, message, errors } : { ok: okResult, message };
}

/** 去重键：大小写与首尾空白不算差别，「物理」和「 physics 」是同一个科目。 */
function subjectKey(name: string) {
  return name.trim().toLocaleLowerCase('zh-CN');
}

/**
 * 科目下拉的候选项。
 *
 * 词表（subjects）的读策略只放行学校管理员，教师读不到；所以这里把
 * 「我能读到的词表项」与「我已经用过的空间科目文本」并起来，
 * 至少保证同一位教师不会把同一个科目写成两个词。
 */
export async function listSubjectOptions(): Promise<DataResult<SubjectOption[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;

  const supabase = await createClient();
  const [catalogResult, spacesResult] = await Promise.all([
    // RLS 可能整表读空（教师不是管理员）——那是词表没对这个角色开放，不是故障。
    supabase.from('subjects').select('id,name,aliases').eq('enabled', true),
    supabase.from('spaces').select('subject'),
  ]);
  if (spacesResult.error) return fail('error', `空间科目读取失败：${spacesResult.error.message}`);

  const byKey = new Map<string, SubjectOption>();
  for (const row of (spacesResult.data ?? []) as Array<{ subject: string | null }>) {
    const name = row.subject?.trim();
    if (!name) continue;
    const key = subjectKey(name);
    if (!byKey.has(key)) byKey.set(key, { id: null, name, source: 'existing' });
  }
  for (const row of (catalogResult.data ?? []) as Array<{ id: string; name: string; aliases: string[] }>) {
    const name = row.name.trim();
    if (!name) continue;
    // 词表项覆盖同名自由文本项：词表项带 id，能真正归一化。
    byKey.set(subjectKey(name), { id: row.id, name, source: 'catalog' });
    for (const alias of row.aliases ?? []) {
      const aliasName = alias.trim();
      if (aliasName && !byKey.has(subjectKey(aliasName))) byKey.set(subjectKey(aliasName), { id: row.id, name, source: 'catalog' });
    }
  }

  return ok([...byKey.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')));
}

/** 空间面板初始化用：各空间的 subject_id 与首屏追问示例。 */
export async function listSpaceSettings(spaceIds: string[]): Promise<DataResult<SpaceSettingsMap>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  if (spaceIds.length === 0) return ok({});

  const supabase = await createClient();
  const { data, error } = await supabase.from('spaces').select('id,subject_id,starter_prompts').in('id', spaceIds);
  if (error) return fail('error', `空间配置读取失败：${error.message}`);

  const settings: SpaceSettingsMap = {};
  for (const row of (data ?? []) as Array<{ id: string; subject_id: string | null; starter_prompts: unknown }>) {
    settings[row.id] = { subjectId: row.subject_id ?? null, starterPrompts: readStarterPrompts(row.starter_prompts) };
  }
  return ok(settings);
}

/**
 * 保存空间科目：名称（兼容列）与词表 id 一起写。
 *
 * 传空 id 表示「这个科目只在文本层面存在」——教师可以先用一个词，
 * 等学校管理员把词补进词表后再回来绑定，两步都不丢数据。
 */
export async function saveSpaceSubjectAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const spaceId = String(formData.get('space_id') ?? '').trim();
  const subject = String(formData.get('subject') ?? '').trim();
  const subjectId = String(formData.get('subject_id') ?? '').trim();
  if (!spaceId) return actionResult(false, '空间还没创建，先保存空间再设置科目。');
  if (!subject) return actionResult(false, '科目不能为空。', { subject: '请选择或新建一个科目。' });
  if (subject.length > 40) return actionResult(false, '科目名称不能超过 40 个字符。', { subject: '科目名称过长。' });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from('spaces')
    .update({ subject, subject_id: subjectId || null })
    .eq('id', spaceId)
    .select('id');
  if (error) return actionResult(false, `科目保存失败：${error.message}`);
  if (!updated || updated.length === 0) return actionResult(false, '科目未保存：该空间不存在或不属于你。');

  revalidatePath('/teacher');
  revalidatePath('/student');
  return actionResult(true, subjectId ? `科目已保存，并归并到词表中的「${subject}」。` : '科目已保存。该科目暂未进词表，同学科的空间仍可能重复。');
}

/**
 * 保存学生首屏的追问示例。
 * 留空的槽位会被丢掉；全部留空等于「用默认示例」，界面据此回落到内置的四句。
 */
export async function saveStarterPromptsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const spaceId = String(formData.get('space_id') ?? '').trim();
  if (!spaceId) return actionResult(false, '空间还没创建，先保存空间再设置追问示例。');

  const prompts = Array.from({ length: STARTER_PROMPT_SLOTS }, (_, index) => String(formData.get(`starter_prompt_${index}`) ?? '').trim());
  if (prompts.some((prompt) => prompt.length > MAX_STARTER_PROMPT_LENGTH)) {
    return actionResult(false, `每条追问示例不超过 ${MAX_STARTER_PROMPT_LENGTH} 个字。`, { starter_prompts: '有示例写得太长了。' });
  }
  const kept = prompts.filter((prompt) => prompt.length > 0);

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from('spaces')
    .update({ starter_prompts: kept.length > 0 ? kept : null })
    .eq('id', spaceId)
    .select('id');
  if (error) return actionResult(false, `追问示例保存失败：${error.message}`);
  if (!updated || updated.length === 0) return actionResult(false, '追问示例未保存：该空间不存在或不属于你。');

  revalidatePath('/teacher');
  revalidatePath('/student');
  return actionResult(true, kept.length > 0 ? `已保存 ${kept.length} 条追问示例。` : '已清空，学生端回落到默认追问示例。');
}
