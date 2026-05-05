import { createGateway, generateObject, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

import { withApiLogging } from '@/lib/observability/with-api-logging';
import { createClient } from '@/lib/supabase/server';
import { getCapability, requireRole, resolveEnvSecret, type CapabilityStatus } from '@/lib/data/common';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  projectId: z.string().uuid(),
  targetBloomLevel: z.number().int().min(1).max(6).optional(),
});

const challengeSchema = z.object({
  prompt: z.string().trim().min(8).max(800),
  guidance: z.string().trim().min(1).max(240),
});

function resolveLanguageModel(capability: CapabilityStatus): LanguageModel | null {
  if (!capability.modelId) return null;
  const apiKey = resolveEnvSecret(capability.secretRef);
  if (!apiKey) return null;
  if (capability.providerType === 'gateway') return createGateway({ apiKey, baseURL: capability.baseUrl ?? process.env.AI_GATEWAY_BASE_URL })(capability.modelId);
  return createOpenAI({ apiKey, baseURL: capability.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined })(capability.modelId);
}

function nextBloomLevel(highestLevel: number | null | undefined) {
  if (!highestLevel) return 1;
  return Math.min(highestLevel + 1, 6);
}

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'challenge_generate', route: '/api/challenge/generate' }, async () => {
    const role = await requireRole('student');
    if (!role.ok) return Response.json({ state: role.reason, error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ state: 'error', error: 'Invalid request', issues: [{ message: 'Malformed JSON body' }] }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return Response.json({ state: 'error', error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    const capability = await getCapability('practice_generation');
    if (!capability.ok) return Response.json({ state: 'error', error: capability.message }, { status: 500 });
    if (!capability.data.ready) return Response.json({ state: 'blocked', error: 'Practice generation provider not configured', resolution: capability.data.blockedReason }, { status: 503 });

    const model = resolveLanguageModel(capability.data);
    if (!model) return Response.json({ state: 'blocked', error: 'Practice generation model unavailable', resolution: `${capability.data.providerName ?? 'Provider'} 的 secret_ref 未在服务端环境中解析成功。` }, { status: 503 });

    const supabase = await createClient();
    const { data: project, error: projectError } = await supabase
      .from('text_projects')
      .select('id,title,author,highest_bloom_level')
      .eq('id', parsed.data.projectId)
      .eq('owner_id', role.data.id)
      .maybeSingle();
    if (projectError) return Response.json({ state: 'error', error: `项目加载失败：${projectError.message}` }, { status: 500 });
    if (!project) return Response.json({ state: 'error', error: '未找到可挑战的真实篇目项目。' }, { status: 404 });

    const targetBloomLevel = parsed.data.targetBloomLevel ?? nextBloomLevel(project.highest_bloom_level);
    const { data: priorQuestions, error: questionError } = await supabase
      .from('conversation_messages')
      .select('content,bloom_level,created_at,conversations!inner(project_id)')
      .eq('conversations.project_id', project.id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(8);
    if (questionError) return Response.json({ state: 'error', error: `历史问题加载失败：${questionError.message}` }, { status: 500 });

    let generated: z.infer<typeof challengeSchema>;
    try {
      const result = await generateObject({
        model,
        schema: challengeSchema,
        prompt: `你是古诗文学习挑战生成器。请基于真实篇目项目与学生历史问题，生成一个用于确认布鲁姆 L${targetBloomLevel} 认知水平的挑战题。不要给答案，不要虚构学生已完成结果。\n篇目：《${project.title}》${project.author ? `，作者：${project.author}` : ''}\n学生历史问题：${(priorQuestions ?? []).map((question, index) => `${index + 1}. L${question.bloom_level ?? '未分类'} ${question.content}`).join('\n') || '暂无历史问题，只能围绕篇目本身生成入门挑战。'}\n输出要求：prompt 为学生需要作答的题目；guidance 为一句作答提醒。`,
      });
      generated = result.object;
    } catch (error) {
      return Response.json({ state: 'failed', error: '真实挑战生成调用失败。', resolution: error instanceof Error ? error.message : 'Provider 返回未知错误。' }, { status: 502 });
    }

    const { data: practice, error: insertError } = await supabase
      .from('practice_records')
      .insert({
        student_id: role.data.id,
        project_id: project.id,
        target_bloom_level: targetBloomLevel,
        prompt: generated.prompt,
        feedback: generated.guidance,
        evaluation_state: 'pending',
      })
      .select('*')
      .single();
    if (insertError) return Response.json({ state: 'error', error: `挑战记录保存失败：${insertError.message}` }, { status: 500 });

    return Response.json({ state: 'pending', challenge: practice, guidance: generated.guidance, modelId: capability.data.modelId });
  });
}
