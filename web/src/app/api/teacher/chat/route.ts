import { consumeStream, convertToModelMessages, safeValidateUIMessages, streamText, stepCountIs } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { writeLogEvent } from '@/lib/observability/server-log-store';
import { extractTextFromParts, getCapability, jsonForDatabase, requireRole, resolveReadyModel } from '@/lib/data/common';
import { buildAttachmentPrompt } from '@/lib/chat-attachments';
import { getRoleMcpTools } from '@/lib/mcp-runtime';
import { buildTeacherSystemPrompt } from '@/lib/teacher-chat-prompts';

export const maxDuration = 60;

const bodySchema = z.object({ messages: z.unknown(), presetId: z.string().uuid().optional(), conversationId: z.string().uuid().optional() });

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'teacher_chat', route: '/api/teacher/chat' }, async (requestId) => {
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
  const ready = resolveReadyModel(capability.data);
  if (!ready.ok) return Response.json({ error: ready.error, resolution: ready.resolution }, { status: ready.status });
  const languageModel = ready.model;

  const supabase = await createClient();
  const preset = parsed.data.presetId
    ? (await supabase.from('prompt_presets').select('*').eq('id', parsed.data.presetId).eq('target_role', 'teacher').or(`status.eq.published,created_by.eq.${role.data.id}`).single()).data
    : null;
  if (parsed.data.presetId && !preset) return Response.json({ error: 'Preset not found', resolution: '教师只能使用已发布或本人创建的真实模板。' }, { status: 409 });
  const userText = extractTextFromParts(messages);
  if (!userText) return Response.json({ error: '消息不能为空' }, { status: 400 });
  const { data: conversation, error: conversationError } = parsed.data.conversationId
    ? await supabase.from('conversations').select('id').eq('id', parsed.data.conversationId).eq('owner_id', role.data.id).eq('source', 'teacher_chat').is('deleted_at', null).maybeSingle()
    : await supabase.from('conversations').insert({ owner_id: role.data.id, source: 'teacher_chat', prompt_preset_id: preset?.id ?? null, title: userText.slice(0, 80) }).select('id').single();
  if (conversationError) return Response.json({ error: `教师问答创建失败：${conversationError.message}` }, { status: 500 });
  if (!conversation) return Response.json({ error: '会话不存在或已删除' }, { status: 404 });
  await supabase.from('conversation_messages').insert({ conversation_id: conversation.id, role: 'user', content: userText, parts: jsonForDatabase(messages.at(-1)?.parts ?? null), bloom_state: 'unclassified' });
  const modelId = capability.data.modelId;
  if (!modelId) return Response.json({ error: 'Model id missing', resolution: 'teacher_chat 能力缺少 model_id；不能选择默认模型。' }, { status: 503 });
  const attachment = await buildAttachmentPrompt({
    supabase,
    conversationId: conversation.id,
    ownerId: role.data.id,
    query: userText,
  });
  if (!attachment.ok) return Response.json({ error: attachment.message }, { status: attachment.status });
  const attachmentPrompt = attachment.prompt;
  let mcp;
  try {
    mcp = await getRoleMcpTools(supabase, 'teacher');
  } catch (error) {
    return Response.json({ error: 'MCP Server unavailable', resolution: error instanceof Error ? error.message : 'MCP Server 初始化失败。' }, { status: 503 });
  }
  const result = streamText({
    model: languageModel,
    system: buildTeacherSystemPrompt({
      presetInstruction: preset?.system_instruction,
      attachmentPrompt,
    }),
    messages: await convertToModelMessages(messages),
    tools: mcp.tools,
    stopWhen: stepCountIs(5),
    abortSignal: req.signal,
    onFinish: async ({ text }) => {
      await mcp.close();
      await supabase.from('conversation_messages').insert({ conversation_id: conversation.id, role: 'assistant', content: text, model_id: modelId, bloom_state: 'unclassified' });
    },
    onError: async (error) => {
      // 与学生端一致：mid-stream 模型失败不会让 withApiLogging 记到 error（响应头已 200 返回），
      // 必须在此显式落库，否则线上排查"接口报错"时这条故障完全不可见。
      await writeLogEvent({
        level: 'error',
        area: 'api',
        event: 'teacher_chat_stream_failed',
        requestId,
        route: '/api/teacher/chat',
        message: error instanceof Error ? error.message : '教师问答流式响应失败',
        context: { conversationId: conversation.id, modelId, provider: capability.data.providerName },
      });
      await mcp.close();
    },
    onAbort: async () => {
      await mcp.close();
    },
  });
  const response = result.toUIMessageStreamResponse({ originalMessages: messages, consumeSseStream: consumeStream });
  response.headers.set('x-conversation-id', conversation.id);
  return response;
  });
}
