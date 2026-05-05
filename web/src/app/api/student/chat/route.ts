import { consumeStream, convertToModelMessages, createGateway, generateObject, safeValidateUIMessages, streamText, stepCountIs, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { extractTextFromParts, getCapabilities, jsonForDatabase, requireRole, resolveEnvSecret, type CapabilityStatus } from '@/lib/data/common';

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

const bodySchema = z.object({ messages: z.unknown(), conversationId: z.string().uuid().optional(), projectId: z.string().uuid().optional(), projectTitle: z.string().trim().min(1).optional() });
const projectSchema = z.object({ title: z.string().trim().min(1).max(80), author: z.string().trim().max(40).optional() });
const bloomSchema = z.object({ level: z.number().int().min(1).max(6), reason: z.string().trim().max(120) });

async function classifyProject(model: LanguageModel, question: string) {
  const result = await generateObject({
    model,
    schema: projectSchema,
    prompt: `请只根据学生古诗文问题判断最可能的篇目项目。项目名必须是篇目名，不要输出解释。若问题没有明确篇目，请用“未定篇目”。\n学生问题：${question}`,
  });
  return result.object;
}

async function classifyBloom(model: LanguageModel, question: string, answer: string) {
  const result = await generateObject({
    model,
    schema: bloomSchema,
    prompt: `请根据学生问题与 AI 回答判断本轮学生问题对应的布鲁姆认知层级。1记忆，2理解，3应用，4分析，5评价，6创造。只输出结构化结果。\n学生问题：${question}\nAI回答：${answer}`,
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
    let classifiedProjectTitle = parsed.data.projectTitle;
    if (!projectId) {
      const classified = await classifyProject(projectModel, userText);
      classifiedProjectTitle = classified.title || '未定篇目';
      const { data: project, error: projectError } = await supabase
        .from('text_projects')
        .upsert({ owner_id: role.data.id, title: classifiedProjectTitle, author: classified.author ?? null, classification_state: 'classified' }, { onConflict: 'owner_id,title,author' })
        .select('id')
        .single();
      if (projectError) return Response.json({ error: `项目归档失败：${projectError.message}` }, { status: 500 });
      projectId = project.id;
    }

    const { data: conversation, error: conversationError } = parsed.data.conversationId
      ? await supabase.from('conversations').select('id,project_id,text_projects(title)').eq('id', parsed.data.conversationId).eq('owner_id', role.data.id).single()
      : await supabase.from('conversations').insert({ owner_id: role.data.id, project_id: projectId, source: 'student_chat', title: userText.slice(0, 80) }).select('id,project_id,text_projects(title)').single();
    if (conversationError) return Response.json({ error: `对话创建失败：${conversationError.message}` }, { status: 500 });
    const conversationProject = Array.isArray(conversation.text_projects) ? conversation.text_projects[0] : conversation.text_projects;
    classifiedProjectTitle = classifiedProjectTitle ?? conversationProject?.title ?? '篇目项目';

    const { data: userMessage } = await supabase.from('conversation_messages').insert({ conversation_id: conversation.id, role: 'user', content: userText, parts: jsonForDatabase(messages.at(-1)?.parts ?? null), bloom_state: 'pending' }).select('id').single();
    const modelId = caps.student_chat.modelId;
    if (!modelId) return Response.json({ error: 'Model id missing', resolution: 'Provider capability 缺少 model_id；不能选择默认模型。' }, { status: 503 });
    const result = streamText({
      model: languageModel,
      system: `你是文韵智途的古诗文 AI 教学助手。当前会话已归入《${classifiedProjectTitle ?? '篇目项目'}》。必须基于古诗文学习语境回答，用苏格拉底式追问帮助学生沿布鲁姆认知层级深入；不要声称已完成教师核实。`,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(5),
      abortSignal: req.signal,
      onFinish: async ({ text }) => {
        const bloom = await classifyBloom(bloomModel, userText, text);
        if (userMessage) {
          await supabase.from('conversation_messages').update({ bloom_level: bloom.level, bloom_state: 'classified' }).eq('id', userMessage.id);
        }
        await supabase.from('text_projects').update({ highest_bloom_level: bloom.level }).eq('id', projectId).or(`highest_bloom_level.is.null,highest_bloom_level.lt.${bloom.level}`);
        await supabase.from('conversation_messages').insert({ conversation_id: conversation.id, role: 'assistant', content: text, parts: [{ type: 'text', text }], model_id: modelId, bloom_state: 'unclassified' });
      },
    });
    return result.toUIMessageStreamResponse({ originalMessages: messages, consumeSseStream: consumeStream });
  });
}
