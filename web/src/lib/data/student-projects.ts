'use server';

/**
 * student-projects.ts
 *
 * 学生自定义项目的写入面。产品语义（SaaS 通用化）：
 * 项目不再只能由 LLM 从提问里识别产生——学生可以自己建一个项目（例："我的文言虚词笔记"、
 * "数学：一次函数易错点"），之后在该项目下发起的会话同样进入教师核实范围。
 *
 * 与 chat 路由的关系：chat 路由的 ensureProject 是"识别到归属后自动建"，服务端内部路径；
 * 这里是"学生显式建"，走鉴权 + 校验。两条路径共用同一套标题规范与唯一约束
 * （projects_owner_name_normalized_key），不会建出重复项目。
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizeConcreteProjectTitle, normalizeProjectSubtitle } from '@/lib/project-title';
import { requireRole } from './common';

export type CreateStudentProjectResult =
  | { ok: true; projectId: string; name: string }
  | { ok: false; message: string };

/**
 * 学生新建自定义项目。标题经与归类器同一套规范化（去书名号、长度与前缀占位词校验），
 * 避免"《X》"与"X"被唯一索引当成两个项目。
 */
export async function createStudentProject(formData: FormData): Promise<CreateStudentProjectResult> {
  const role = await requireRole('student');
  if (!role.ok) return { ok: false, message: role.message };

  const name = normalizeConcreteProjectTitle(String(formData.get('name') ?? ''));
  if (!name) return { ok: false, message: '请填写有效的项目名称（不超过 80 字，且不能是系统占位名）。' };
  const subtitle = normalizeProjectSubtitle(String(formData.get('subtitle') ?? ''));
  const spaceId = String(formData.get('space_id') ?? '').trim();
  if (!spaceId) return { ok: false, message: '请先选择一个学习空间，再创建项目。' };

  const supabase = await createClient();
  // 幂等：同一空间内的同名项目复用，跨空间同名项目互不覆盖。
  const { data: existing, error: existingError } = await supabase
    .from('projects')
    .select('id,name')
    .eq('owner_id', role.data.id)
    .eq('space_id', spaceId)
    .eq('name', name)
    .maybeSingle();
  if (existingError) return { ok: false, message: `项目查重失败：${existingError.message}` };
  if (existing) return { ok: true, projectId: existing.id, name: existing.name };

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      owner_id: role.data.id,
      space_id: spaceId,
      name,
      subtitle,
      // manual：明确是学生自建，不是 AI 识别结果，教师核实页可据此区分来源。
      classification_state: 'manual',
    })
    .select('id,name')
    .single();
  if (error || !project) return { ok: false, message: `项目创建失败：${error?.message ?? 'unknown'}` };

  revalidatePath('/student/me');
  revalidatePath('/student');
  return { ok: true, projectId: project.id, name: project.name };
}
