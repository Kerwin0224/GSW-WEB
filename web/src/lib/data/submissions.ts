import 'server-only';

/**
 * 提交物（submissions）：非对话式的学习产物——实验报告、代码、扫描稿、拍照。
 * 与 documents 分表是刻意的：documents 是"喂给模型的检索资料"，
 * submissions 是"学生交上来的东西"，两者的可见性与清退口径不同。
 *
 * 三条纪律：
 *  · 作用域只从**学生自己拥有的项目**推导。客户端传来的 class_id/space_id
 *    一律不信——否则学生可以把作业挂到别人的班上，那边的教师就会看到一条
 *    不属于本班的提交。推导不出来就留空：只有本人和学校管理员看得到，
 *    这比"猜一个班挂上去"安全。
 *  · 每次写都取回命中行，0 行要能看见。被 RLS 过滤掉的写入既不报错也不返回行。
 *  · 文件先从存储删掉再删行：反过来会出现行没了、文件还在的孤儿对象。
 */

import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { fail, ok, requireAnyRole, requireRole, type DataResult } from './common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ARTIFACT_MAX_BYTES, artifactKindOf, removeArtifact, signArtifactUrls, uploadArtifact } from '@/lib/artifacts';

type SubmissionRow = Database['public']['Tables']['submissions']['Row'];

/** 一次最多交几个文件。多于这个数就该打包，而不是让一条记录背上十几个附件。 */
const MAX_FILES_PER_SUBMISSION = 6;

export type SubmissionFilePart = { type: 'file'; mediaType: string; filename?: string; url: string; path: string; size: number };

export type SubmissionView = {
  id: string;
  title: string;
  kind: string;
  content: string | null;
  projectId?: string;
  spaceId?: string;
  classId?: string;
  schoolId?: string;
  assignmentId?: string;
  reviewState: string;
  submittedAt: string;
  files: Array<{ name: string; path: string; mime: string; size: number; url: string }>;
};

export type SubmissionInput = {
  title: string;
  kind?: string;
  content?: string | null;
  projectId?: string | null;
  files: File[];
};

/** 提交物形态。库里是自由文本，这里只认这几个，其余一律按首个文件的类型推断。 */
const KNOWN_KINDS: Record<string, true> = { file: true, text: true, image: true, pdf: true, code: true, data: true };

/** 列表里展示的一行：文件路径原样给出，URL 一律现签。 */
function toSubmissionView(row: SubmissionRow, urls: Record<string, string>): SubmissionView {
  const parts = Array.isArray(row.parts) ? (row.parts as SubmissionFilePart[]) : [];
  const files = Array.isArray(row.blob_paths)
    ? row.blob_paths.map((path) => {
      const part = parts.find((item) => item?.path === path);
      return {
        name: part?.filename ?? path.split('/').pop() ?? path,
        path,
        mime: part?.mediaType ?? 'application/octet-stream',
        size: part?.size ?? 0,
        url: urls[path] ?? '',
      };
    })
    : [];
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    content: row.content,
    projectId: row.project_id ?? undefined,
    spaceId: row.space_id ?? undefined,
    classId: row.class_id ?? undefined,
    schoolId: row.school_id ?? undefined,
    assignmentId: row.assignment_id ?? undefined,
    reviewState: row.review_state,
    submittedAt: row.submitted_at,
    files,
  };
}

async function toViews(supabase: SupabaseClient, rows: SubmissionRow[]): Promise<SubmissionView[]> {
  const urls = await signArtifactUrls(supabase, rows.flatMap((row) => row.blob_paths ?? []));
  return rows.map((row) => toSubmissionView(row, urls));
}

/** 学生提交。文件先落存储，再落 submissions 行；行写失败时把刚传的文件删掉，不留孤儿对象。 */
export async function createSubmission(input: SubmissionInput): Promise<DataResult<SubmissionView>> {
  const role = await requireRole('student');
  if (!role.ok) return role;

  const title = input.title.trim();
  if (!title) return fail('error', '请给这次提交起一个名字，之后要靠它找到。');
  if (input.files.length === 0 && !input.content?.trim()) return fail('error', '请至少交一份文件或一段文字。');
  if (input.files.length > MAX_FILES_PER_SUBMISSION) return fail('error', `一次最多交 ${MAX_FILES_PER_SUBMISSION} 个文件，请合并后再交。`);

  const supabase = await createClient();

  // 作用域只认学生自己拥有的项目，见文件头注释。
  let projectId: string | null = null;
  if (input.projectId) {
    const { data: project, error } = await supabase
      .from('projects')
      .select('id')
      .eq('id', input.projectId)
      .eq('owner_id', role.data.id)
      .maybeSingle();
    if (error) return fail('error', `项目校验失败：${error.message}`);
    if (!project) return fail('forbidden', '项目不存在或不属于当前账号，提交没有保存。');
    projectId = project.id;
  }

  const uploaded: Array<{ path: string; fileName: string; mime: string; size: number }> = [];
  for (const file of input.files) {
    if (file.size <= 0) return fail('error', `「${file.name}」是空文件，没有可提交的内容。`);
    const mime = file.type || 'application/octet-stream';
    const kind = artifactKindOf(mime);
    if (!kind) return fail('error', `「${file.name}」的格式暂不支持，请改用文本、PDF 或图片。`);
    if (file.size > ARTIFACT_MAX_BYTES[kind]) {
      return fail('error', `「${file.name}」超过 ${Math.round(ARTIFACT_MAX_BYTES[kind] / 1024 / 1024)}MB，请压缩或拆分后再交。`);
    }
    const artifact = await uploadArtifact({
      supabase,
      profileId: role.data.id,
      scopeId: projectId ?? `submission-${role.data.id}`,
      file,
      mime,
      kind,
      // 提交物是成果不是检索资料：切块只会白烧 embedding 额度。
      indexed: false,
    });
    if (!artifact.ok) {
      for (const done of uploaded) await removeArtifact(supabase, done.path);
      return artifact;
    }
    uploaded.push(artifact.data);
  }

  const urls = await signArtifactUrls(supabase, uploaded.map((item) => item.path));
  const unlinkable = uploaded.find((item) => !urls[item.path]);
  if (unlinkable) {
    for (const item of uploaded) await removeArtifact(supabase, item.path);
    return fail('error', `「${unlinkable.fileName}」保存后无法生成访问链接，提交没有保存，请重试。`);
  }
  const parts: SubmissionFilePart[] = uploaded.map((item) => ({
    type: 'file',
    mediaType: item.mime,
    filename: item.fileName,
    url: urls[item.path],
    path: item.path,
    size: item.size,
  }));

  const kind = input.kind && KNOWN_KINDS[input.kind] ? input.kind : (uploaded[0] ? (artifactKindOf(uploaded[0].mime) ?? 'file') : 'text');
  const { data: submission, error } = await supabase
    .from('submissions')
    .insert({
      owner_id: role.data.id,
      project_id: projectId,
      title,
      kind,
      content: input.content?.trim() || null,
      parts: parts as unknown as Database['public']['Tables']['submissions']['Insert']['parts'],
      blob_paths: uploaded.map((item) => item.path),
    })
    .select('*')
    .single();
  if (error || !submission) {
    for (const item of uploaded) await removeArtifact(supabase, item.path);
    return fail('error', `提交保存失败：${error?.message ?? '数据库没有返回可核对的写入结果，请刷新后确认是否已保存。'}`);
  }

  return ok(toSubmissionView(submission as SubmissionRow, urls));
}

/** 学生列出自己的提交物。 */
export async function listMySubmissions(): Promise<DataResult<SubmissionView[]>> {
  const role = await requireRole('student');
  if (!role.ok) return role;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('owner_id', role.data.id)
    .order('submitted_at', { ascending: false })
    .limit(50);
  if (error) return fail('error', `提交列表加载失败：${error.message}`);
  return ok(await toViews(supabase, (data ?? []) as SubmissionRow[]));
}

/**
 * 教师/管理员查看作用域内的提交物。可见性由 submissions_scope_read 判，
 * 应用层只负责不许"不带任何作用域"地要一份全校列表——那是不受控的读放大入口。
 */
export async function listManagedSubmissions({ classId, spaceId }: { classId?: string; spaceId?: string }): Promise<DataResult<SubmissionView[]>> {
  const role = await requireAnyRole(['teacher', 'admin']);
  if (!role.ok) return role;
  if (!classId && !spaceId) return fail('error', '请先选择要查看的班级或学习空间。');

  const supabase = await createClient();
  let query = supabase.from('submissions').select('*');
  if (classId) query = query.eq('class_id', classId);
  if (spaceId) query = query.eq('space_id', spaceId);
  const { data, error } = await query.order('submitted_at', { ascending: false }).limit(100);
  if (error) return fail('error', `提交列表加载失败：${error.message}`);
  return ok(await toViews(supabase, (data ?? []) as SubmissionRow[]));
}

/** 学生删除自己的提交物。 */
export async function deleteSubmission(id: string): Promise<DataResult<{ id: string }>> {
  const role = await requireRole('student');
  if (!role.ok) return role;

  const supabase = await createClient();
  const { data: owned, error: loadError } = await supabase
    .from('submissions')
    .select('id,blob_paths')
    .eq('id', id)
    .eq('owner_id', role.data.id)
    .maybeSingle();
  if (loadError) return fail('error', `提交读取失败：${loadError.message}`);
  if (!owned) return fail('error', '这条提交不存在或不属于当前账号，什么都没有删除。');

  for (const path of owned.blob_paths ?? []) {
    const removed = await removeArtifact(supabase, path);
    if (!removed.ok) return fail('error', `文件删除失败，提交仍保留：${removed.message}`);
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('submissions')
    .delete()
    .eq('id', id)
    .eq('owner_id', role.data.id)
    .select('id')
    .maybeSingle();
  if (deleteError) return fail('error', `提交删除失败：${deleteError.message}`);
  if (!deleted) return fail('error', '提交删除失败：这条提交已不存在或不属于当前账号。');

  return ok({ id });
}
