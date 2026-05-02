import { consumeStream, convertToModelMessages, safeValidateUIMessages, streamText, stepCountIs, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { extractTextFromParts, getCapabilities, jsonForDatabase, requireRole } from '@/lib/data/common';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';


function resolveLanguageModel({ modelId, providerType, baseUrl }: { modelId: string; providerType?: string; baseUrl?: string | null }): LanguageModel {
  if (process.env.AI_GATEWAY_API_KEY || providerType === 'gateway') return modelId;
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: baseUrl ?? undefined })(modelId);
}

const bodySchema = z.object({ messages: z.unknown(), conversationId: z.string().uuid().optional(), projectId: z.string().uuid().optional(), projectTitle: z.string().trim().min(1).optional() });

export async function POST(req: Request) {
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
  if (!process.env.OPENAI_API_KEY && !process.env.AI_GATEWAY_API_KEY) return Response.json({ error: 'Server model secret missing', resolution: '已配置能力元数据，但服务端缺少 OPENAI_API_KEY 或 AI_GATEWAY_API_KEY；不能从浏览器读取 Provider 密钥。' }, { status: 503 });

  const supabase = await createClient();
  const userText = extractTextFromParts(messages);
  if (!userText) return Response.json({ error: '消息不能为空' }, { status: 400 });

  let projectId = parsed.data.projectId;
  if (!projectId) {
    if (!parsed.data.projectTitle) return Response.json({ error: 'Project classification pending', resolution: '请求未提供真实分类后的 projectTitle；缺少分类结果时不创建猜测项目。' }, { status: 409 });
    const { data: project, error: projectError } = await supabase
      .from('text_projects')
      .upsert({ owner_id: role.data.id, title: parsed.data.projectTitle, classification_state: 'classified' }, { onConflict: 'owner_id,title,author' })
      .select('id')
      .single();
    if (projectError) return Response.json({ error: `项目归档失败：${projectError.message}` }, { status: 500 });
    projectId = project.id;
  }

  const { data: conversation, error: conversationError } = parsed.data.conversationId
    ? await supabase.from('conversations').select('id').eq('id', parsed.data.conversationId).eq('owner_id', role.data.id).single()
    : await supabase.from('conversations').insert({ owner_id: role.data.id, project_id: projectId, source: 'student_chat', title: userText.slice(0, 80) }).select('id').single();
  if (conversationError) return Response.json({ error: `对话创建失败：${conversationError.message}` }, { status: 500 });

  await supabase.from('conversation_messages').insert({ conversation_id: conversation.id, role: 'user', content: userText, parts: jsonForDatabase(messages.at(-1)?.parts ?? null), bloom_state: 'pending' });
  const modelId = caps.student_chat.modelId ?? process.env.DEFAULT_CHAT_MODEL ?? 'gpt-4o';
  const result = streamText({
    model: resolveLanguageModel({ modelId, providerType: caps.student_chat.providerType, baseUrl: caps.student_chat.baseUrl }),
    system: '你是文韵智途的古诗文 AI 教学助手。必须基于古诗文学习语境回答，用苏格拉底式追问帮助学生沿布鲁姆认知层级深入；不要声称已完成系统分类。',
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    abortSignal: req.signal,
    onFinish: async ({ text }) => {
      const { data: assistant } = await supabase.from('conversation_messages').insert({ conversation_id: conversation.id, role: 'assistant', content: text, model_id: modelId, bloom_state: 'unclassified' }).select('id').single();
      if (assistant) await supabase.from('audit_records').insert({ source_message_id: assistant.id, source_conversation_id: conversation.id, kind: 'sft', status: 'pending', prompt: userText, original_answer: text });
    },
  });
  return result.toUIMessageStreamResponse({ originalMessages: messages, consumeSseStream: consumeStream });
}
