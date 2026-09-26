'use server';

/**
 * subjects.ts —— 科目词表。
 *
 * 为什么需要这张表：空间科目此前是自由文本，于是「物理」「Physics」「物 理」
 * 会被算成三个不同的科目，三个空间在学生端并排出现，没人说得清哪个是哪个。
 * 词表给科目一个稳定 id，别名负责把同一门课的多种写法收拢到一起。
 *
 * 读策略按学校锚点（subjects_read），教师读不到全校词表——教师侧的下拉由
 * space-settings.ts 把「词表项」与「自己已在用的自由文本」并起来兜底。
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { fail, ok, requireRole, type ActionState, type DataResult } from './common';

export type SubjectListItem = {
  id: string;
  code: string;
  name: string;
  aliases: string[];
  sortOrder: number;
  enabled: boolean;
  /** 有多少个空间绑在这个科目上。停用前管理员得知道影响面。 */
  spaceCount: number;
};

const CODE_PATTERN = /^[a-z0-9_-]{1,32}$/;

function subjectActionResult(okResult: boolean, message: string, errors?: Record<string, string>): ActionState {
  return errors ? { ok: okResult, message, errors } : { ok: okResult, message };
}

export async function listSubjects(): Promise<DataResult<SubjectListItem[]>> {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const schoolId = role.data.school_id;
  if (!schoolId) return fail('error', '当前管理员账号未归属任何学校，无法维护科目词表。');

  const supabase = await createClient();
  const [catalogResult, spacesResult] = await Promise.all([
    supabase.from('subjects').select('id,code,name,aliases,sort_order,enabled').eq('school_id', schoolId).order('sort_order', { ascending: true }).order('name', { ascending: true }),
    supabase.from('spaces').select('subject_id'),
  ]);
  if (catalogResult.error) return fail('error', `科目词表加载失败：${catalogResult.error.message}`);
  // 空间读不到不算故障：停用统计只是提示信息，不能因此让整张词表打不开。
  const usedBySpace = new Map<string, number>();
  for (const row of (spacesResult.data ?? []) as Array<{ subject_id: string | null }>) {
    if (!row.subject_id) continue;
    usedBySpace.set(row.subject_id, (usedBySpace.get(row.subject_id) ?? 0) + 1);
  }

  return ok(((catalogResult.data ?? []) as Array<{ id: string; code: string; name: string; aliases: string[]; sort_order: number; enabled: boolean }>).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    aliases: row.aliases ?? [],
    sortOrder: row.sort_order,
    enabled: row.enabled,
    spaceCount: usedBySpace.get(row.id) ?? 0,
  })));
}

export async function saveSubjectAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return subjectActionResult(false, role.message);
  const schoolId = role.data.school_id;
  if (!schoolId) return subjectActionResult(false, '当前管理员账号未归属任何学校，无法维护科目词表。');

  const id = String(formData.get('subject_id') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const aliases = String(formData.get('aliases') ?? '')
    .split(/[,，、\n]/)
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0)
    .slice(0, 10);
  const sortOrderRaw = String(formData.get('sort_order') ?? '').trim();
  const sortOrder = Number.parseInt(sortOrderRaw, 10);
  const enabled = String(formData.get('enabled') ?? 'true') !== 'false';

  if (!name) return subjectActionResult(false, '请填写科目名称。', { name: '科目名称不能为空。' });
  if (name.length > 40) return subjectActionResult(false, '科目名称不能超过 40 个字符。', { name: '科目名称过长。' });
  if (!CODE_PATTERN.test(code)) {
    return subjectActionResult(false, '科目代码只能是小写字母、数字、下划线或短横线（1-32 位）。', { code: '科目代码格式不对。' });
  }
  if (aliases.some((alias) => alias.length > 40)) {
    return subjectActionResult(false, '别名不能超过 40 个字符。', { aliases: '有别名写得太长了。' });
  }
  if (sortOrderRaw && (!Number.isFinite(sortOrder) || sortOrder < 0 || sortOrder > 9999)) {
    return subjectActionResult(false, '排序值请填 0-9999 之间的整数，留空则用默认值。', { sort_order: '排序值不合法。' });
  }

  const supabase = await createClient();
  if (id) {
    // 0 行 = RLS 没放行（词表项不属于本校），不是"已保存"。
    const { data: updated, error } = await supabase
      .from('subjects')
      .update({ code, name, aliases, sort_order: Number.isFinite(sortOrder) ? sortOrder : 100, enabled })
      .eq('id', id)
      .eq('school_id', schoolId)
      .select('id');
    if (error) return subjectActionResult(false, `科目保存失败：${error.message}`);
    if (!updated || updated.length === 0) return subjectActionResult(false, '科目未保存：该科目不属于本校。');
    revalidatePath('/admin/subjects');
    revalidatePath('/teacher');
    return subjectActionResult(true, `科目「${name}」已保存。`);
  }

  // 同校同代码已存在：POST 插入会撞唯一索引，报出来的是一句英文。这里先查一次，
  // 好让管理员知道撞的是哪一条。
  const { data: duplicate } = await supabase.from('subjects').select('name').eq('school_id', schoolId).eq('code', code).maybeSingle();
  if (duplicate) {
    return subjectActionResult(false, `代码「${code}」已被「${duplicate.name}」占用，换一个代码。`, { code: '科目代码重复。' });
  }

  const { data: inserted, error } = await supabase
    .from('subjects')
    .insert({ school_id: schoolId, code, name, aliases, sort_order: Number.isFinite(sortOrder) ? sortOrder : 100, enabled })
    .select('id');
  if (error) return subjectActionResult(false, `科目创建失败：${error.message}`);
  if (!inserted || inserted.length === 0) return subjectActionResult(false, '科目未创建：数据库没有返回记录，请重试。');

  revalidatePath('/admin/subjects');
  revalidatePath('/teacher');
  return subjectActionResult(true, `科目「${name}」已加入词表。`);
}

/**
 * 停用而不是删除。
 *
 * 词表项被空间用着（spaces.subject_id 外键 on delete set null），
 * 删掉它等于让所有绑定的空间悄悄退回自由文本，而界面上不会有任何提示。
 * 停用后它从教师的下拉里消失，既有绑定原样保留。
 */
export async function setSubjectEnabledAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('admin');
  if (!role.ok) return subjectActionResult(false, role.message);
  const schoolId = role.data.school_id;
  if (!schoolId) return subjectActionResult(false, '当前管理员账号未归属任何学校，无法维护科目词表。');

  const id = String(formData.get('subject_id') ?? '').trim();
  const enabled = String(formData.get('enabled') ?? '');
  if (!id || (enabled !== 'true' && enabled !== 'false')) {
    return subjectActionResult(false, '缺少科目或目标状态，请刷新词表后重试。');
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase.from('subjects').update({ enabled: enabled === 'true' }).eq('id', id).eq('school_id', schoolId).select('id');
  if (error) return subjectActionResult(false, `科目状态更新失败：${error.message}`);
  if (!updated || updated.length === 0) return subjectActionResult(false, '状态未更新：该科目不属于本校。');

  revalidatePath('/admin/subjects');
  revalidatePath('/teacher');
  return subjectActionResult(true, enabled === 'true' ? '科目已启用。' : '科目已停用：教师新建空间时不再出现在下拉里，已有绑定不受影响。');
}
