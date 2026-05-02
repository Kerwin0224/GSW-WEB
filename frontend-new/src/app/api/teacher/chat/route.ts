import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getUser();
  if (!user || user.role !== 'teacher') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messages, presetId } = await req.json() as {
    messages: UIMessage[];
    presetId?: string;
  };

  if (!messages || !Array.isArray(messages)) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = await createClient();
  let systemInstruction = '你是文韵智途的AI教学助手，帮助教师完成备课、教学和评估工作。';

  if (presetId) {
    const { data: preset } = await supabase
      .from('prompt_presets')
      .select('system_instruction')
      .eq('id', presetId)
      .eq('enabled', true)
      .single();
    if (preset) systemInstruction = preset.system_instruction;
  }

  const modelId = process.env.DEFAULT_CHAT_MODEL?.trim() || 'gpt-4o';
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY;

  if (!apiKey) {
    const { data: route } = await supabase
      .from('model_routes')
      .select('model_id')
      .eq('capability', 'teacher_chat')
      .eq('enabled', true)
      .single();
    if (!route) {
      return Response.json(
        { error: 'AI provider not configured', resolution: '请在管理面板中配置 AI 模型' },
        { status: 503 },
      );
    }
  }

  const result = streamText({
    model: `openai/${modelId}`,
    system: systemInstruction,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    abortSignal: req.signal,
  });

  return result.toUIMessageStreamResponse();
}
