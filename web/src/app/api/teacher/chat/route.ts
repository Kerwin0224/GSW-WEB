import { consumeStream, convertToModelMessages, createGateway, safeValidateUIMessages, streamText, stepCountIs, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { extractTextFromParts, getCapability, jsonForDatabase, requireRole, resolveEnvSecret, type CapabilityStatus } from '@/lib/data/common';

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

const bodySchema = z.object({ messages: z.unknown(), presetId: z.string().uuid() });

export async function POST(req: Request) {
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
  if (!capability.ok || !capability.data.ready) return Response.json({ error: 'AI provider not configured', resolution: capability.ok ? capability.data.blockedReason : capability.message }, { status: 503 });
  const languageModel = resolveLanguageModel(capability.data);
  if (!languageModel) return Response.json({ error: 'Server model secret missing', resolution: `${capability.data.providerName ?? 'Provider'} 的 secret_ref 未在服务端环境中解析成功；不会从浏览器读取 Provider 密钥。` }, { status: 503 });

  const supabase = await createClient();
  const { data: preset, error: presetError } = await supabase.from('prompt_presets').select('*').eq('id', parsed.data.presetId).eq('status', 'published').eq('target_role', 'teacher').single();
  if (presetError || !preset) return Response.json({ error: 'Published preset not found', resolution: '教师只能使用管理员发布的真实预设。' }, { status: 409 });
  const userText = extractTextFromParts(messages);
  if (!userText) return Response.json({ error: '消息不能为空' }, { status: 400 });
  const { data: conversation, error: conversationError } = await supabase.from('conversations').insert({ owner_id: role.data.id, source: 'teacher_chat', prompt_preset_id: preset.id, title: userText.slice(0, 80) }).select('id').single();
  if (conversationError) return Response.json({ error: `教师对话创建失败：${conversationError.message}` }, { status: 500 });
  await supabase.from('conversation_messages').insert({ conversation_id: conversation.id, role: 'user', content: userText, parts: jsonForDatabase(messages.at(-1)?.parts ?? null), bloom_state: 'unclassified' });
  const modelId = capability.data.modelId;
  if (!modelId) return Response.json({ error: 'Model id missing', resolution: 'Provider capability 缺少 model_id；不能选择默认模型。' }, { status: 503 });
  const result = streamText({
    model: languageModel,
    system: preset.system_instruction,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    abortSignal: req.signal,
    onFinish: async ({ text }) => {
      const { data: assistant } = await supabase.from('conversation_messages').insert({ conversation_id: conversation.id, role: 'assistant', content: text, model_id: modelId, bloom_state: 'unclassified' }).select('id').single();
      if (assistant) await supabase.from('audit_records').insert({ source_message_id: assistant.id, source_conversation_id: conversation.id, auditor_id: role.data.id, kind: 'sft', status: 'pending', prompt: userText, original_answer: text, metadata: { preset_id: preset.id, preset_version: preset.version } });
    },
  });
  return result.toUIMessageStreamResponse({ originalMessages: messages, consumeSseStream: consumeStream });
}
