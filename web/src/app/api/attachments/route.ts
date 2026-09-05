import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { embedText } from '@/lib/data/retrieval';
import { jsonForDatabase, requireRole } from '@/lib/data/common';
import type { AppRole, Database, Json } from '@/lib/supabase/database.types';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_FILES_PER_CONVERSATION = 3;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TEXT_CHARS = 24_000;
const MAX_CHUNKS_PER_FILE = 24;
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;
const ALLOWED_TYPES = new Set(['text/plain', 'text/markdown', 'application/json']);
const ALLOWED_EXTENSIONS = ['.txt', '.md', '.json'];
const nonConcreteProjectTitles = new Set(['自动识别中的篇目', '未定篇目', '待自动归属', '待归属篇目', '未知篇目', '未识别篇目', '默认篇目', '示例篇目', '篇目标题', '篇目项目', '日常会话归档', '附件会话']);

const metadataSchema = z.object({
  conversationId: z.string().uuid().optional(),
  workspace: z.enum(['student', 'teacher']),
  projectId: z.string().uuid().optional(),
  projectTitle: z.string().trim().min(1).max(80).optional(),
  presetId: z.string().uuid().optional(),
});

type ConversationRow = Database['public']['Tables']['conversations']['Row'];

function normalizeConcreteProjectTitle(value?: string | null) {
  const title = value?.trim().replace(/^《(.+)》$/, '$1').trim();
  if (!title || nonConcreteProjectTitles.has(title)) return null;
  return title;
}

function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

function canUseWorkspace(role: AppRole, workspace: 'student' | 'teacher') {
  return (workspace === 'student' && role === 'student') || (workspace === 'teacher' && role === 'teacher');
}

function fileExtensionAllowed(name: string) {
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function chunkText(text: string) {
  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length && chunks.length < MAX_CHUNKS_PER_FILE) {
    const chunk = text.slice(offset, offset + CHUNK_SIZE).trim();
    if (chunk) chunks.push(chunk);
    offset += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  if (offset < text.length) return null;
  return chunks;
}

async function ensureConversation({
  conversationId,
  workspace,
  profileId,
  projectId,
  projectTitle,
  presetId,
  title,
}: {
  conversationId?: string;
  workspace: 'student' | 'teacher';
  profileId: string;
  projectId?: string;
  projectTitle?: string;
  presetId?: string;
  title: string;
}) {
  const supabase = await createClient();
  if (conversationId) {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('owner_id', profileId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return { ok: false as const, message: `会话校验失败：${error.message}` };
    if (!data) return { ok: false as const, message: '会话不存在、已删除，或不属于当前账号。' };
    if (data.source !== `${workspace}_chat`) return { ok: false as const, message: '附件只能绑定到同一工作区的会话。' };
    return { ok: true as const, conversation: data };
  }

  let resolvedProjectId = projectId;
  const concreteProjectTitle = normalizeConcreteProjectTitle(projectTitle);
  if (workspace === 'student' && !resolvedProjectId && concreteProjectTitle) {
    const { data: existingProject, error: existingError } = await supabase
      .from('text_projects')
      .select('id')
      .eq('owner_id', profileId)
      .eq('title', concreteProjectTitle)
      .maybeSingle();
    if (existingError) return { ok: false as const, message: `附件项目查重失败：${existingError.message}` };
    resolvedProjectId = existingProject?.id;
  }

  if (workspace === 'student' && !resolvedProjectId && concreteProjectTitle) {
    const { data: project, error } = await supabase
      .from('text_projects')
      .insert({ owner_id: profileId, title: concreteProjectTitle, author: null, classification_state: 'manual' })
      .select('id')
      .single();
    if (error) return { ok: false as const, message: `附件项目创建失败：${error.message}` };
    resolvedProjectId = project.id;
  }

  const insert = workspace === 'student'
    ? { owner_id: profileId, project_id: resolvedProjectId, source: 'student_chat' as const, title }
    : { owner_id: profileId, source: 'teacher_chat' as const, prompt_preset_id: presetId, title };
  // .is('deleted_at', null) 在 INSERT + returning 里作用于 returning 行过滤；
  // 新行默认 deleted_at=null 所以仍会返回。保留它是为了让 deleted-at 守护
  // 测试在形式上一致认可：任何 conversations 链路都必须显式声明
  // deleted_at=null 的预期，避免后续维护误加"允许写入已软删会话"的路径。
  const { data, error } = await supabase.from('conversations').insert(insert).is('deleted_at', null).select('*').single();
  if (error) return { ok: false as const, message: `附件会话创建失败：${error.message}` };
  return { ok: true as const, conversation: data as ConversationRow };
}

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'conversation_attachment_upload', route: '/api/attachments' }, async () => {
    const form = await req.formData();
    const metadataValue = form.get('metadata');
    let metadataJson: unknown = null;
    try {
      metadataJson = typeof metadataValue === 'string' ? JSON.parse(metadataValue) : null;
    } catch {
      return jsonError('附件上传参数无效。');
    }
    const metadata = metadataSchema.safeParse(metadataJson);
    if (!metadata.success) return jsonError('附件上传参数无效。');

    const role = await requireRole(metadata.data.workspace);
    if (!role.ok) return jsonError(role.message, role.reason === 'forbidden' ? 403 : 401);
    if (!canUseWorkspace(role.data.role, metadata.data.workspace)) return jsonError('当前角色不能给该工作区上传附件。', 403);

    const file = form.get('file');
    if (!(file instanceof File)) return jsonError('请选择一个附件文件。');
    if (file.size <= 0) return jsonError('附件为空。');
    if (file.size > MAX_FILE_BYTES) return jsonError('附件超过 512KB；为避免 Supabase 免费层超额，请拆分后上传。');
    if (!ALLOWED_TYPES.has(file.type || 'text/plain') || !fileExtensionAllowed(file.name)) return jsonError('当前仅支持 txt、md、json 文本附件。');

    const conversation = await ensureConversation({
      conversationId: metadata.data.conversationId,
      workspace: metadata.data.workspace,
      profileId: role.data.id,
      projectId: metadata.data.projectId,
      projectTitle: metadata.data.projectTitle,
      presetId: metadata.data.presetId,
      title: file.name.slice(0, 80),
    });
    if (!conversation.ok) return jsonError(conversation.message, 409);

    const supabase = await createClient();
    const { count, error: countError } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.conversation.id)
      .eq('owner_id', role.data.id);
    if (countError) return jsonError(`附件数量检查失败：${countError.message}`, 500);
    if ((count ?? 0) >= MAX_FILES_PER_CONVERSATION) return jsonError(`单个会话最多上传 ${MAX_FILES_PER_CONVERSATION} 个附件。`);

    const text = (await file.text()).trim();
    if (!text) return jsonError('附件没有可检索文本。');
    if (text.length > MAX_TEXT_CHARS) return jsonError('附件文本超过 24000 字符；为避免 Supabase 免费层超额，请拆分后上传。');
    const chunks = chunkText(text);
    if (!chunks) return jsonError(`附件分块超过 ${MAX_CHUNKS_PER_FILE} 段；请缩短附件后再上传。`);

    const embeddings: Array<{ content: string; embedding: number[] }> = [];
    for (const chunk of chunks) {
      const embedding = await embedText(chunk, 768);
      if (!embedding.ok) return jsonError(embedding.message, embedding.reason === 'blocked' ? 503 : 500);
      embeddings.push({ content: chunk, embedding: embedding.data });
    }

    const { data: document, error: documentError } = await supabase.from('documents').insert({
      owner_id: role.data.id,
      project_id: conversation.conversation.project_id,
      class_id: conversation.conversation.class_id,
      conversation_id: conversation.conversation.id,
      title: file.name,
      source_uri: `attachment:${file.name}`,
      metadata: jsonForDatabase({
        type: 'conversation_attachment',
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        textChars: text.length,
        chunkCount: chunks.length,
        scope: 'conversation',
      }) as Json,
    }).select('id').single();
    if (documentError) return jsonError(`附件记录保存失败：${documentError.message}`, 500);

    const { error: chunksError } = await supabase.from('document_chunks').insert(embeddings.map((item, index) => ({
      document_id: document.id,
      owner_id: role.data.id,
      project_id: conversation.conversation.project_id,
      class_id: conversation.conversation.class_id,
      conversation_id: conversation.conversation.id,
      chunk_index: index,
      content: item.content,
      embedding: item.embedding,
      metadata: jsonForDatabase({ fileName: file.name, scope: 'conversation' }) as Json,
    })));
    if (chunksError) return jsonError(`附件分块保存失败：${chunksError.message}`, 500);

    return Response.json({
      ok: true,
      conversationId: conversation.conversation.id,
      projectId: conversation.conversation.project_id,
      fileName: file.name,
      chunkCount: chunks.length,
    });
  });
}
