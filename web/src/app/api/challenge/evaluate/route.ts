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
  practiceId: z.string().uuid(),
  answer: z.string().trim().min(1).max(4000),
});

const evaluationSchema = z.object({
  achieved: z.boolean(),
  feedback: z.string().trim().min(1).max(800),
});

function resolveLanguageModel(capability: CapabilityStatus): LanguageModel | null {
  if (!capability.modelId) return null;
  const apiKey = resolveEnvSecret(capability.secretRef);
  if (!apiKey) return null;
  if (capability.providerType === 'gateway') return createGateway({ apiKey, baseURL: capability.baseUrl ?? process.env.AI_GATEWAY_BASE_URL })(capability.modelId);
  return createOpenAI({ apiKey, baseURL: capability.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined })(capability.modelId);
}

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'challenge_evaluate', route: '/api/challenge/evaluate' }, async () => {
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

    const capability = await getCapability('practice_evaluation');
    if (!capability.ok) return Response.json({ state: 'error', error: capability.message }, { status: 500 });
    if (!capability.data.ready) return Response.json({ state: 'blocked', error: 'Challenge confirmation provider not configured', resolution: capability.data.blockedReason }, { status: 503 });

    const model = resolveLanguageModel(capability.data);
    if (!model) return Response.json({ state: 'blocked', error: 'Challenge confirmation model unavailable', resolution: `${capability.data.providerName ?? 'Provider'} 的 secret_ref 未在服务端环境中解析成功。` }, { status: 503 });

    const supabase = await createClient();
    const { data: practice, error: practiceError } = await supabase
      .from('practice_records')
      .select('*, text_projects(id,title,author,highest_bloom_level)')
      .eq('id', parsed.data.practiceId)
      .eq('student_id', role.data.id)
      .maybeSingle();
    if (practiceError) return Response.json({ state: 'error', error: `挑战记录加载失败：${practiceError.message}` }, { status: 500 });
    if (!practice) return Response.json({ state: 'error', error: '未找到可评估的真实挑战记录。' }, { status: 404 });
    if (!practice.project_id) return Response.json({ state: 'error', error: '挑战记录缺少篇目项目，不能更新项目认知状态。' }, { status: 422 });
    if (!practice.prompt) return Response.json({ state: 'error', error: '挑战记录缺少题目，不能评估。' }, { status: 422 });

    const project = Array.isArray(practice.text_projects) ? practice.text_projects[0] : practice.text_projects;
    let evaluation: z.infer<typeof evaluationSchema>;
    try {
      const result = await generateObject({
        model,
        schema: evaluationSchema,
        prompt: `你是古诗文挑战确认助手。请根据题目目标层级、学生作答和篇目信息，判断学生是否达成该布鲁姆层级。必须严格确认，不要因为有回答就判定通过。\n篇目：《${project?.title ?? '未知篇目'}》${project?.author ? `，作者：${project.author}` : ''}\n目标层级：L${practice.target_bloom_level}\n挑战题：${practice.prompt}\n学生作答：${parsed.data.answer}\n输出要求：achieved 表示是否达成；feedback 给学生具体、可执行的学习反馈。`,
      });
      evaluation = result.object;
    } catch (error) {
      await supabase.from('practice_records').update({ answer: parsed.data.answer, evaluation_state: 'failed', feedback: error instanceof Error ? `挑战确认调用失败：${error.message}` : '挑战确认调用失败：Provider 返回未知错误。' }).eq('id', practice.id);
      return Response.json({ state: 'failed', error: '真实挑战确认调用失败。', resolution: error instanceof Error ? error.message : 'Provider 返回未知错误。' }, { status: 502 });
    }

    const { data: updatedPractice, error: updateError } = await supabase
      .from('practice_records')
      .update({ answer: parsed.data.answer, feedback: evaluation.feedback, achieved: evaluation.achieved, evaluation_state: 'evaluated' })
      .eq('id', practice.id)
      .select('*')
      .single();
    if (updateError) return Response.json({ state: 'error', error: `挑战确认结果保存失败：${updateError.message}` }, { status: 500 });

    if (evaluation.achieved) {
      const currentHighest = project?.highest_bloom_level ?? null;
      if (!currentHighest || practice.target_bloom_level > currentHighest) {
        const { error: projectUpdateError } = await supabase
          .from('text_projects')
          .update({ highest_bloom_level: practice.target_bloom_level })
          .eq('id', practice.project_id)
          .eq('owner_id', role.data.id);
        if (projectUpdateError) return Response.json({ state: 'error', error: `项目认知状态更新失败：${projectUpdateError.message}` }, { status: 500 });
      }
    }

    return Response.json({ state: 'evaluated', result: updatedPractice, projectUpdated: evaluation.achieved, modelId: capability.data.modelId });
  });
}
