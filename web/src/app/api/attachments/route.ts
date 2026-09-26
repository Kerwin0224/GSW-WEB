import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { embedText } from '@/lib/data/retrieval';
import { jsonForDatabase, requireRole } from '@/lib/data/common';
import { normalizeConcreteProjectTitle } from '@/lib/project-title';
import {
  ARTIFACT_MAX_BYTES,
  artifactKindOf,
  countArtifacts,
  signArtifactUrl,
  uploadArtifact,
  type ArtifactKind,
} from '@/lib/artifacts';
import type { AppRole, Database, Json } from '@/lib/supabase/database.types';

export const maxDuration = 60;

const MAX_FILES_PER_CONVERSATION = 3;
const MAX_TEXT_CHARS = 24_000;
const MAX_CHUNKS_PER_FILE = 24;
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;
const metadataSchema = z.object({
  conversationId: z.string().uuid().optional(),
  workspace: z.enum(['student', 'teacher']),
  projectId: z.string().uuid().optional(),
  projectTitle: z.string().trim().min(1).max(80).optional(),
  presetId: z.string().uuid().optional(),
  spaceId: z.string().uuid().optional(),
});

type ConversationRow = Database['public']['Tables']['conversations']['Row'];

function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

function canUseWorkspace(role: AppRole, workspace: 'student' | 'teacher') {
  return (workspace === 'student' && role === 'student') || (workspace === 'teacher' && role === 'teacher');
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
  spaceId,
  title,
}: {
  conversationId?: string;
  workspace: 'student' | 'teacher';
  profileId: string;
  projectId?: string;
  projectTitle?: string;
  presetId?: string;
  spaceId?: string;
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
      .from('projects')
      .select('id')
      .eq('owner_id', profileId)
      .eq('space_id', spaceId ?? null)
      .eq('name', concreteProjectTitle)
      .maybeSingle();
    if (existingError) return { ok: false as const, message: `附件项目查重失败：${existingError.message}` };
    resolvedProjectId = existingProject?.id ?? undefined;
  }

  if (workspace === 'student' && !resolvedProjectId && concreteProjectTitle) {
    const { data: project, error } = await supabase
      .from('projects')
      .insert({ owner_id: profileId, space_id: spaceId ?? null, name: concreteProjectTitle, classification_state: 'manual' })
      .select('id')
      .single();
    if (error) return { ok: false as const, message: `附件项目创建失败：${error.message}` };
    resolvedProjectId = project.id;
  }

  // zod 4.6 起 supabase insert 的泛型对异形联合不再放行，显式标注让两个分支共享同一插入类型
  const insert: Database['public']['Tables']['conversations']['Insert'] = workspace === 'student'
    ? { owner_id: profileId, project_id: resolvedProjectId, space_id: spaceId ?? null, source: 'student_chat' as const, title }
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
    // try/catch 的 catch 分支直接返回，走到后面时 metadataJson 必然已被赋值
    let metadataJson: unknown;
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

    const mime = file.type || 'text/plain';
    const kind: ArtifactKind | null = artifactKindOf(mime);
    if (!kind) return jsonError('当前支持文本、PDF 与图片附件；其他格式请先转成这三种之一。');
    if (file.size > ARTIFACT_MAX_BYTES[kind]) {
      const limit = kind === 'text' ? '512KB' : `${Math.round(ARTIFACT_MAX_BYTES[kind] / 1024 / 1024)}MB`;
      return jsonError(`附件超过 ${limit}；请压缩或拆分后再上传。`);
    }

    const conversation = await ensureConversation({
      conversationId: metadata.data.conversationId,
      workspace: metadata.data.workspace,
      profileId: role.data.id,
      projectId: metadata.data.projectId,
      projectTitle: metadata.data.projectTitle,
      presetId: metadata.data.presetId,
      spaceId: metadata.data.spaceId,
      title: file.name.slice(0, 80),
    });
    if (!conversation.ok) return jsonError(conversation.message, 409);

    const supabase = await createClient();
    // 二进制不走 documents，所以数量要数存储目录而不是文档表，
    // 否则同一会话先传三张图、再传文本时图片根本不会被计入上限。
    const stored = await countArtifacts(supabase, role.data.id, conversation.conversation.id, MAX_FILES_PER_CONVERSATION + 1);
    if (!stored.ok) return jsonError(stored.message, 500);
    if (stored.data >= MAX_FILES_PER_CONVERSATION) return jsonError(`单个会话最多上传 ${MAX_FILES_PER_CONVERSATION} 个附件。`);

    const uploaded = await uploadArtifact({
      supabase,
      profileId: role.data.id,
      scopeId: conversation.conversation.id,
      file,
      mime,
      kind,
      indexed: kind === 'text',
    });
    if (!uploaded.ok) return jsonError(uploaded.message, 500);

    const signed = await signArtifactUrl(supabase, uploaded.data.path);
    if (!signed.ok) return jsonError(signed.message, 500);

    // 只有纯文本进 RAG：图片与 PDF 由模型多模态通道直接读，
    // 把它们解码成文本只会得到一堆乱码，还白烧 embedding 额度。
    let chunkCount = 0;
    let textChars = 0;
    if (kind === 'text') {
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
        source_uri: `artifact:${uploaded.data.path}`,
        metadata: jsonForDatabase({
          type: 'conversation_attachment',
          fileName: file.name,
          fileType: mime,
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

      chunkCount = chunks.length;
      textChars = text.length;
    }

    return Response.json({
      ok: true,
      conversationId: conversation.conversation.id,
      projectId: conversation.conversation.project_id,
      fileName: file.name,
      mime,
      kind,
      size: file.size,
      textChars,
      chunkCount,
      // 前端拿这个 part 直接进消息，模型侧读到的是重签后的同一路径。
      path: uploaded.data.path,
      signedUrl: signed.data,
      part: { type: 'file' as const, mediaType: mime, filename: file.name, url: signed.data },
    });
  });
}
