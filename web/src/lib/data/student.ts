import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { fail, getCapabilities, ok, requireRole, type DataResult } from './common';
import type { BloomLevel } from '@/components/workbench/bloom-badge';

export type ProjectSummary = { id: string; title: string; author?: string; highestLevel?: BloomLevel; questionCount: number; practiceCount: number; updatedLabel: string };
export type StudentWorkspace = { providerBlocked?: string; classificationBlocked?: string };
export type ProjectDetail = { project: Database['public']['Tables']['text_projects']['Row']; questions: Database['public']['Tables']['conversation_messages']['Row'][]; practices: Database['public']['Tables']['practice_records']['Row'][] };

export async function getStudentWorkspace(): Promise<DataResult<StudentWorkspace>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const caps = await getCapabilities(['student_chat', 'bloom_classification', 'project_classification']);
  return ok({
    providerBlocked: caps.student_chat.ready ? undefined : caps.student_chat.blockedReason,
    classificationBlocked: caps.bloom_classification.ready && caps.project_classification.ready ? undefined : '缺少 bloom_classification / project_classification 真实模型能力配置。',
  });
}

export async function getStudentProjects(): Promise<DataResult<ProjectSummary[]>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data: projects, error } = await supabase.from('text_projects').select('*').eq('owner_id', role.data.id).order('updated_at', { ascending: false });
  if (error) return fail('error', `项目加载失败：${error.message}`);
  const summaries = await Promise.all((projects ?? []).map(async (project) => {
    const [{ count: questionCount }, { count: practiceCount }] = await Promise.all([
      supabase.from('conversation_messages').select('id, conversations!inner(project_id)', { count: 'exact', head: true }).eq('conversations.project_id', project.id).eq('role', 'user'),
      supabase.from('practice_records').select('id', { count: 'exact', head: true }).eq('project_id', project.id),
    ]);
    return { id: project.id, title: project.title, author: project.author ?? undefined, highestLevel: project.highest_bloom_level as BloomLevel | undefined, questionCount: questionCount ?? 0, practiceCount: practiceCount ?? 0, updatedLabel: new Date(project.updated_at).toLocaleString('zh-CN') };
  }));
  return ok(summaries);
}

export async function getStudentProject(projectId: string): Promise<DataResult<ProjectDetail | null>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data: project, error } = await supabase.from('text_projects').select('*').eq('id', projectId).eq('owner_id', role.data.id).maybeSingle();
  if (error) return fail('error', `篇目详情加载失败：${error.message}`);
  if (!project) return ok(null);
  const [{ data: questions, error: qError }, { data: practices, error: pError }] = await Promise.all([
    supabase.from('conversation_messages').select('*, conversations!inner(project_id)').eq('conversations.project_id', project.id).eq('role', 'user').order('created_at', { ascending: false }),
    supabase.from('practice_records').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
  ]);
  if (qError) return fail('error', `问题记录加载失败：${qError.message}`);
  if (pError) return fail('error', `练习记录加载失败：${pError.message}`);
  return ok({ project, questions: (questions ?? []) as Database['public']['Tables']['conversation_messages']['Row'][], practices: practices ?? [] });
}

export async function getStudentProfileSummary() {
  const projects = await getStudentProjects();
  if (!projects.ok) return projects;
  const distribution = [1, 2, 3, 4, 5, 6].map((level) => ({ level, count: projects.data.filter((project) => project.highestLevel === level).length }));
  return ok({ distribution, projects: projects.data });
}
