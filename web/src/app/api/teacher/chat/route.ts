import { consumeStream, convertToModelMessages, createGateway, safeValidateUIMessages, streamText, stepCountIs, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { extractTextFromParts, getCapability, jsonForDatabase, requireRole, resolveEnvSecret, type CapabilityStatus } from '@/lib/data/common';
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

const bodySchema = z.object({ messages: z.unknown(), presetId: z.string().uuid(), conversationId: z.string().uuid().optional() });

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'teacher_chat', route: '/api/teacher/chat' }, async () => {
  const role = await requireRole('teacher');
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
  const capability = await getCapability('teacher_chat');
  if (!capability.ok) return Response.json({ error: 'Teacher chat provider lookup failed', resolution: capability.message }, { status: 500 });
  if (!capability.data.ready) return Response.json({ error: 'Teacher chat provider not configured', resolution: capability.data.blockedReason }, { status: 503 });
  const languageModel = resolveLanguageModel(capability.data);
  if (!languageModel) return Response.json({ error: 'Server model secret missing', resolution: `${capability.data.providerName ?? 'Provider'} 的 secret_ref 未在服务端环境中解析成功；不会从浏览器读取 Provider 密钥。` }, { status: 503 });

  const supabase = await createClient();
  const { data: preset, error: presetError } = await supabase.from('prompt_presets').select('*').eq('id', parsed.data.presetId).eq('status', 'published').eq('target_role', 'teacher').single();
  if (presetError || !preset) return Response.json({ error: 'Published preset not found', resolution: '教师只能使用管理员发布的真实预设。' }, { status: 409 });
  const userText = extractTextFromParts(messages);
  if (!userText) return Response.json({ error: '消息不能为空' }, { status: 400 });
  const { data: conversation, error: conversationError } = parsed.data.conversationId
    ? await supabase.from('conversations').select('id').eq('id', parsed.data.conversationId).eq('owner_id', role.data.id).eq('source', 'teacher_chat').single()
    : await supabase.from('conversations').insert({ owner_id: role.data.id, source: 'teacher_chat', prompt_preset_id: preset.id, title: userText.slice(0, 80) }).select('id').single();
  if (conversationError) return Response.json({ error: `教师问答创建失败：${conversationError.message}` }, { status: 500 });
  await supabase.from('conversation_messages').insert({ conversation_id: conversation.id, role: 'user', content: userText, parts: jsonForDatabase(messages.at(-1)?.parts ?? null), bloom_state: 'unclassified' });
  const modelId = capability.data.modelId;
  if (!modelId) return Response.json({ error: 'Model id missing', resolution: 'teacher_chat 能力缺少 model_id；不能选择默认模型。' }, { status: 503 });
  const { count: attachmentCount, error: attachmentCountError } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('owner_id', role.data.id);
  if (attachmentCountError) return Response.json({ error: `附件检查失败：${attachmentCountError.message}` }, { status: 500 });
  const attachmentContext = (attachmentCount ?? 0) > 0 ? await retrieveConversationDocumentChunks({ query: userText, conversationId: conversation.id }) : null;
  if (attachmentContext && !attachmentContext.ok && attachmentContext.reason === 'error') return Response.json({ error: attachmentContext.message }, { status: 500 });
  const attachmentPrompt = attachmentContext?.ok && attachmentContext.data.length > 0
    ? `\n\n当前会话附件检索片段（只能作为本会话参考，禁止引用其他会话附件）：\n${attachmentContext.data.map((chunk, index) => `[附件${index + 1}｜${chunk.document_title}] ${chunk.content}`).join('\n\n')}`
    : '';
  const result = streamText({
    model: languageModel,
    system: `${preset.system_instruction}${attachmentPrompt}`,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    abortSignal: req.signal,
    onFinish: async ({ text }) => {
      await supabase.from('conversation_messages').insert({ conversation_id: conversation.id, role: 'assistant', content: text, model_id: modelId, bloom_state: 'unclassified' });
    },
  });
  const response = result.toUIMessageStreamResponse({ originalMessages: messages, consumeSseStream: consumeStream });
  response.headers.set('x-conversation-id', conversation.id);
  return response;
  });
}
