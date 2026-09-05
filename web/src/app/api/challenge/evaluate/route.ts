import { generateObject, type LanguageModel } from 'ai';
import { z } from 'zod';

import { withApiLogging } from '@/lib/observability/with-api-logging';
import { createClient } from '@/lib/supabase/server';
import { getCapability, requireRole, resolveLanguageModel } from '@/lib/data/common';
import { buildChallengeEvaluationPrompt } from '@/lib/challenge-prompts';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const postgresUuidSchema = z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');

const bodySchema = z.object({
  practiceId: postgresUuidSchema,
  answer: z.string().trim().min(1).max(4000),
});

const evaluationSchema = z.object({
  achieved: z.boolean(),
  feedback: z.string().trim().min(1).max(800),
});

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
      .select('*, text_projects(id,title,author)')
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
        prompt: buildChallengeEvaluationPrompt({
          projectTitle: project?.title ?? '未知篇目',
          projectAuthor: project?.author,
          targetBloomLevel: practice.target_bloom_level,
          challengePrompt: practice.prompt,
          studentAnswer: parsed.data.answer,
        }),
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

    // highest_bloom_level 由触发器 practice_records_sync_project_bloom 自动维护，
    // 不需要在应用层重复写入。

    return Response.json({ state: 'evaluated', result: updatedPractice, projectUpdated: evaluation.achieved, modelId: capability.data.modelId });
  });
}
