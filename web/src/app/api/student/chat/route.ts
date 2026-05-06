import { consumeStream, convertToModelMessages, createGateway, generateObject, safeValidateUIMessages, streamText, stepCountIs, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { extractTextFromParts, getCapabilities, jsonForDatabase, requireRole, resolveEnvSecret, type CapabilityStatus } from '@/lib/data/common';
import { retrieveConversationDocumentChunks } from '@/lib/data/retrieval';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function resolveLanguageModel(capability: CapabilityStatus): LanguageModel | null {
  if (!capability.modelId) return null;
  const apiKey = resolveEnvSecret(capability.secretRef);
  if (!apiKey) return null;
  if (capability.providerType === 'gateway') return createGateway({ apiKey, baseURL: capability.baseUrl ?? process.env.AI_GATEWAY_BASE_URL })(capability.modelId);
  return createOpenAI({ apiKey, baseURL: capability.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined })(capability.modelId);
}

const nonConcreteProjectTitles = new Set(['自动识别中的篇目', '未定篇目', '待自动归属', '待归属篇目', '未知篇目', '未识别篇目', '默认篇目', '示例篇目', '篇目标题', '篇目项目', '日常会话归档']);

function normalizeConcreteProjectTitle(value?: string | null) {
  const title = value?.trim().replace(/^《(.+)》$/, '$1').trim();
  if (!title || title.length > 80) return null;
  if (nonConcreteProjectTitles.has(title)) return null;
  return title;
}

function normalizeProjectAuthor(value?: string | null) {
  const author = value?.trim();
  return author ? author : null;
}

async function ensureProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
  title: string,
  author: string | null,
) {
  const { data: existingProject, error: existingError } = await supabase
    .from('text_projects')
    .select('id,title')
    .eq('owner_id', ownerId)
    .eq('title', title)
    .maybeSingle();

  if (existingError) {
    throw new Error(`项目查重失败：${existingError.message}`);
  }

  if (existingProject) return existingProject;

  const { data: project, error } = await supabase
    .from('text_projects')
    .insert({ owner_id: ownerId, title, author, classification_state: 'classified' })
    .select('id,title')
    .single();

  if (error || !project) {
    throw new Error(`项目归档失败：${error?.message ?? 'unknown'}`);
  }

  return project;
}

const optionalUuidField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().uuid().optional(),
);
const optionalProjectTitleField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const bodySchema = z.object({
  messages: z.unknown(),
  conversationId: optionalUuidField,
  projectId: optionalUuidField,
  projectTitle: optionalProjectTitleField,
  trigger: z.enum(['submit-message', 'regenerate-message']).optional(),
  messageId: z.string().trim().min(1).optional(),
});
const projectSchema = z.object({ title: z.string().trim().max(80).nullable(), author: z.string().trim().max(40).nullable().optional(), confidence: z.number().min(0).max(1) });
const bloomSchema = z.object({ level: z.number().int().min(1).max(6), reason: z.string().trim().max(120) });
type AssignmentKind = 'project' | 'archive' | 'project-switch';

type ConversationContext = {
  id: string;
  project_id: string | null;
  text_projects?: { title: string } | { title: string }[] | null;
};

function getConversationProjectTitle(conversation: ConversationContext | null) {
  const project = conversation ? (Array.isArray(conversation.text_projects) ? conversation.text_projects[0] : conversation.text_projects) : null;
  return normalizeConcreteProjectTitle(project?.title);
}

async function classifyProject(model: LanguageModel, question: string) {
  try {
    const result = await generateObject({
      model,
      schema: projectSchema,
      system: '你只判断学生古诗文学习问题是否明确指向一个真实的古诗词或文言文篇目。不要猜测；无法从文本中确定具体篇目时返回 title=null、confidence=0。禁止返回“自动识别中的篇目”“未定篇目”“待自动归属”“篇目项目”等占位标题。',
      prompt: `学生问题：${question}\n\n如果问题明确出现或强上下文指向一个具体篇目，返回该篇目标题；否则 title 返回 null。`,
    });
    if (result.object.confidence < 0.8) return { title: null, author: null };
    return { title: normalizeConcreteProjectTitle(result.object.title), author: normalizeProjectAuthor(result.object.author) };
  } catch {
    return { title: null, author: null };
  }
}

async function classifyBloom(model: LanguageModel, question: string) {
  const result = await generateObject({
    model,
    schema: bloomSchema,
    system: '你只根据学生本轮问题判断布鲁姆认知层级；不得参考 AI 回答、教师修订或挑战结果。1记忆，2理解，3应用，4分析，5评价，6创造。只输出结构化结果。',
    prompt: `学生问题：${question}`,
  });
  return result.object;
}

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'student_chat', route: '/api/student/chat' }, async () => {
    const role = await requireRole('student');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request', issues: [{ message: 'Malformed JSON body' }] }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });
    const validated = await safeValidateUIMessages({ messages: parsed.data.messages });
    if (!validated.success) return Response.json({ error: 'Invalid request', issues: [{ message: validated.error.message }] }, { status: 400 });
    const messages = validated.data;

    const caps = await getCapabilities(['student_chat', 'project_classification', 'bloom_classification']);
    if (!caps.student_chat.ready) return Response.json({ error: 'AI provider not configured', resolution: caps.student_chat.blockedReason }, { status: 503 });
    if (!caps.project_classification.ready || !caps.bloom_classification.ready) return Response.json({ error: 'Classification provider not configured', resolution: '缺少 project_classification / bloom_classification 真实模型能力；不会伪造篇目或 Bloom 分类。' }, { status: 503 });
    const languageModel = resolveLanguageModel(caps.student_chat);
    const projectModel = resolveLanguageModel(caps.project_classification);
    const bloomModel = resolveLanguageModel(caps.bloom_classification);
    if (!languageModel) return Response.json({ error: 'Server model secret missing', resolution: `${caps.student_chat.providerName ?? 'Provider'} 的 secret_ref 未在服务端环境中解析成功；不能从浏览器读取 Provider 密钥。` }, { status: 503 });
    if (!projectModel || !bloomModel) return Response.json({ error: 'Classification model secret missing', resolution: '分类能力的 secret_ref 未在服务端环境中解析成功。' }, { status: 503 });

    const supabase = await createClient();
    const userText = extractTextFromParts(messages);
    if (!userText) return Response.json({ error: '消息不能为空' }, { status: 400 });

    let projectId = parsed.data.projectId;
    let classifiedProjectTitle = normalizeConcreteProjectTitle(parsed.data.projectTitle);
    const isRegeneration = parsed.data.trigger === 'regenerate-message';
    let conversation: ConversationContext | null = null;
    let assignmentKind: AssignmentKind | null = null;

    if (parsed.data.conversationId) {
      const { data: existingConversation, error: existingConversationError } = await supabase
        .from('conversations')
        .select('id,project_id,text_projects(title)')
        .eq('id', parsed.data.conversationId)
        .eq('owner_id', role.data.id)
        .single();
      if (existingConversationError) return Response.json({ error: `会话创建失败：${existingConversationError.message}` }, { status: 500 });
      conversation = existingConversation as ConversationContext;
      projectId = conversation.project_id ?? projectId;
      classifiedProjectTitle = getConversationProjectTitle(conversation) ?? classifiedProjectTitle;
    }

    const classified = isRegeneration ? null : await classifyProject(projectModel, userText);
    const explicitProjectTitle = classified?.title ?? null;
    const currentConversationProjectTitle = getConversationProjectTitle(conversation);

    if (conversation?.project_id && explicitProjectTitle && explicitProjectTitle !== currentConversationProjectTitle) {
      try {
        const project = await ensureProject(supabase, role.data.id, explicitProjectTitle, classified?.author ?? null);
        projectId = project.id;
        classifiedProjectTitle = project.title;
        conversation = null;
        assignmentKind = 'project-switch';
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : '项目归档失败' }, { status: 500 });
      }
    } else if (explicitProjectTitle) {
      try {
        const project = await ensureProject(supabase, role.data.id, explicitProjectTitle, classified?.author ?? null);
        projectId = project.id;
        classifiedProjectTitle = project.title;
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : '项目归档失败' }, { status: 500 });
      }
    }

    const hadConversation = Boolean(conversation);

    if (!conversation) {
      const { data: newConversation, error: conversationError } = await supabase
        .from('conversations')
        .insert({ owner_id: role.data.id, project_id: projectId ?? null, source: 'student_chat', title: userText.slice(0, 80) })
        .select('id,project_id,text_projects(title)')
        .single();
      if (conversationError) return Response.json({ error: `会话创建失败：${conversationError.message}` }, { status: 500 });
      conversation = newConversation as ConversationContext;
      assignmentKind = assignmentKind ?? (projectId ? 'project' : 'archive');
    } else if (!conversation.project_id && projectId) {
      const { error: projectLinkError } = await supabase
        .from('conversations')
        .update({ project_id: projectId })
        .eq('id', conversation.id)
        .eq('owner_id', role.data.id)
        .is('project_id', null);
      if (projectLinkError) return Response.json({ error: `会话归入篇目失败：${projectLinkError.message}` }, { status: 500 });
      conversation.project_id = projectId;
      assignmentKind = 'project';
    } else if (!hadConversation && !projectId) {
      assignmentKind = 'archive';
    }

    projectId = conversation.project_id ?? projectId;
    classifiedProjectTitle = classifiedProjectTitle ?? getConversationProjectTitle(conversation);

    let userMessage = null as null | { id: string; content?: string | null };
    if (isRegeneration) {
      const { data: existingUserMessage, error: existingUserMessageError } = await supabase
        .from('conversation_messages')
        .select('id,content')
        .eq('conversation_id', conversation.id)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .maybeSingle();
      if (existingUserMessageError) return Response.json({ error: `学生问题重试失败：${existingUserMessageError.message}` }, { status: 500 });
      if (existingUserMessage?.content === userText) userMessage = existingUserMessage;
    }

    if (!userMessage) {
      const { data: insertedUserMessage, error: insertedUserMessageError } = await supabase
        .from('conversation_messages')
        .insert({ conversation_id: conversation.id, role: 'user', content: userText, parts: jsonForDatabase(messages.at(-1)?.parts ?? null), bloom_state: projectId ? 'pending' : 'unclassified' })
        .select('id,content')
        .single();
      if (insertedUserMessageError) return Response.json({ error: `学生问题保存失败：${insertedUserMessageError.message}` }, { status: 500 });
      userMessage = insertedUserMessage;
    }
    const { count: attachmentCount, error: attachmentCountError } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
      .eq('owner_id', role.data.id);
    if (attachmentCountError) return Response.json({ error: `附件检查失败：${attachmentCountError.message}` }, { status: 500 });
    const attachmentContext = (attachmentCount ?? 0) > 0 ? await retrieveConversationDocumentChunks({ query: userText, conversationId: conversation.id }) : null;
    if (attachmentContext && !attachmentContext.ok && attachmentContext.reason === 'error') return Response.json({ error: attachmentContext.message }, { status: 500 });
    const attachmentPrompt = attachmentContext?.ok && attachmentContext.data.length > 0
      ? `\n\n当前会话附件检索片段（只能作为本会话参考，禁止引用其他会话或项目附件）：\n${attachmentContext.data.map((chunk, index) => `[附件${index + 1}｜${chunk.document_title}] ${chunk.content}`).join('\n\n')}`
      : '';
    const modelId = caps.student_chat.modelId;
    if (!modelId) return Response.json({ error: 'Model id missing', resolution: 'Provider capability 缺少 model_id；不能选择默认模型。' }, { status: 503 });
    const result = streamText({
      model: languageModel,
      system: classifiedProjectTitle
        ? `你是文韵智途的古诗文 AI 教学助手。当前会话已归入《${classifiedProjectTitle}》。必须基于古诗文学习语境回答，用苏格拉底式追问帮助学生沿布鲁姆认知层级深入；不要声称已完成教师核实。${attachmentPrompt}`
        : `你是文韵智途的古诗文 AI 教学助手。当前会话暂存于日常会话归档；只有学生明确提到真实古诗词或文言文篇目后，系统才会归入篇目项目。必须基于古诗文学习语境回答，用苏格拉底式追问帮助学生沿布鲁姆认知层级深入；不要声称已完成教师核实。${attachmentPrompt}`,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(5),
      abortSignal: req.signal,
      onFinish: async ({ text }) => {
        if (projectId && userMessage) {
          const bloom = await classifyBloom(bloomModel, userText);
          await supabase.from('conversation_messages').update({ bloom_level: bloom.level, bloom_state: 'classified' }).eq('id', userMessage.id);
        }
        await supabase.from('conversation_messages').insert({ conversation_id: conversation.id, role: 'assistant', content: text, parts: [{ type: 'text', text }], model_id: modelId, bloom_state: 'unclassified' });
      },
    });
    const response = result.toUIMessageStreamResponse({ originalMessages: messages, consumeSseStream: consumeStream });
    response.headers.set('x-conversation-id', conversation.id);
    if (assignmentKind) response.headers.set('x-assignment-kind', assignmentKind);
    if (classifiedProjectTitle) response.headers.set('x-project-title', encodeURIComponent(classifiedProjectTitle));
    if (projectId) response.headers.set('x-project-id', projectId);
    return response;
  });
}
