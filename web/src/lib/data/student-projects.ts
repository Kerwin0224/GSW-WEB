'use server';

/**
 * student-projects.ts
 *
 * 学生自定义项目的写入面。产品语义（SaaS 通用化）：
 * 项目不再只能由 LLM 从提问里识别篇目产生——学生可以自己建一个项目（例："我的文言虚词笔记"、
 * "数学：一次函数易错点"），之后在该项目下发起的会话同样进入教师核实范围。
 *
 * 与 chat 路由的关系：chat 路由的 ensureProject 是"识别到篇目后自动建"，服务端内部路径；
 * 这里是"学生显式建"，走鉴权 + 校验。两条路径共用同一套标题规范与唯一约束
 * （text_projects_owner_title_normalized_key），不会建出重复项目。
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizeConcreteProjectTitle, normalizeProjectAuthor } from '@/lib/student-chat-prompts';
import { requireRole, type DataResult } from './common';

export type CreateStudentProjectResult =
  | { ok: true; projectId: string; title: string }
  | { ok: false; message: string };

/**
 * 学生新建自定义项目。标题经与归类器同一套规范化（去书名号、长度与前缀占位词校验），
 * 避免"《X》"与"X"被唯一索引当成两个项目。
 */
export async function createStudentProject(formData: FormData): Promise<CreateStudentProjectResult> {
  const role = await requireRole('student');
  if (!role.ok) return { ok: false, message: role.message };

  const title = normalizeConcreteProjectTitle(String(formData.get('title') ?? ''));
  if (!title) return { ok: false, message: '请填写有效的项目名称（不超过 80 字，且不能是系统占位名）。' };
  const author = normalizeProjectAuthor(String(formData.get('author') ?? ''));
  const catalogId = String(formData.get('catalogId') ?? '').trim() || null;

  const supabase = await createClient();
  // 幂等：同学生同标题复用既有项目，不报"已存在"——学生的意图是"进入这个项目"，不是"建一个记录"。
  const { data: existing, error: existingError } = await supabase
    .from('text_projects')
    .select('id,title')
    .eq('owner_id', role.data.id)
    .eq('title', title)
    .maybeSingle();
  if (existingError) return { ok: false, message: `项目查重失败：${existingError.message}` };
  if (existing) return { ok: true, projectId: existing.id, title: existing.title };

  const { data: project, error } = await supabase
    .from('text_projects')
    .insert({
      owner_id: role.data.id,
      title,
      author,
      catalog_id: catalogId,
      // manual：明确是学生自建，不是 AI 识别结果，教师核实页可据此区分来源。
      classification_state: 'manual',
    })
    .select('id,title')
    .single();
  if (error || !project) return { ok: false, message: `项目创建失败：${error?.message ?? 'unknown'}` };

  revalidatePath('/student/me');
  revalidatePath('/student');
  return { ok: true, projectId: project.id, title: project.title };
}

/** 学生可选的目录节点（本校目录 + 公司模板），用于自定义项目时选归属。 */
export async function listStudentCatalogOptions(): Promise<DataResult<Array<{ id: string; label: string }>>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_catalogs')
    .select('id,name,parent_id,sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) return { ok: false, reason: 'error', message: `目录加载失败：${error.message}` };

  const rows = (data ?? []) as Array<{ id: string; name: string; parent_id: string | null }>;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathOf = (id: string) => {
    const names: string[] = [];
    let cursor = byId.get(id);
    let guard = 0;
    while (cursor && guard < 16) {
      names.unshift(cursor.name);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
      guard += 1;
    }
    return names.join(' / ');
  };
  return { ok: true, data: rows.map((row) => ({ id: row.id, label: pathOf(row.id) })) };
}
