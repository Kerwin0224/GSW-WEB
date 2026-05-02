import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getUser();
  if (!user || user.role !== 'student') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messages, conversationId } = await req.json() as {
    messages: UIMessage[];
    conversationId?: string;
  };

  if (!messages || !Array.isArray(messages)) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = await createClient();
  const modelId = process.env.DEFAULT_CHAT_MODEL?.trim() || 'gpt-4o';
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY;

  if (!apiKey) {
    const { data: route } = await supabase
      .from('model_routes')
      .select('model_id')
      .eq('capability', 'student_chat')
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
    system: '你是文韵智途的古诗文AI教学助手。以布鲁姆认知层次理论为指导，用苏格拉底式提问引导学生从记忆、理解、应用、分析、评价到创造逐步深入。',
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    abortSignal: req.signal,
    onFinish: async ({ text }) => {
      if (conversationId) {
        try {
          const lastUserMsg = [...messages].reverse().find(m => m.parts?.some(p => p.type === 'text'));
          const userContent = lastUserMsg?.parts?.find(p => p.type === 'text')?.text ?? '';
          await supabase.from('messages').insert([
            { conversation_id: conversationId, role: 'user', content: userContent },
            { conversation_id: conversationId, role: 'assistant', content: text },
          ]);
        } catch { /* non-critical */ }
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
