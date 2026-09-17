import { Output, streamText } from 'ai';
import { z } from 'zod';

import { withApiLogging } from '@/lib/observability/with-api-logging';
import { writeLogEvent } from '@/lib/observability/server-log-store';
import { createClient } from '@/lib/supabase/server';
import { getCapability, requireRole, resolveReadyModel } from '@/lib/data/common';
import { buildChallengeEvaluationPrompt } from '@/lib/challenge-prompts';
import { postgresUuidSchema } from '@/lib/request-schemas';

export const maxDuration = 60;

const bodySchema = z.object({
  practiceId: postgresUuidSchema,
  answer: z.string().trim().min(1).max(4000),
});

const evaluationSchema = z.object({
  achieved: z.boolean(),
  feedback: z.string().trim().min(1).max(800),
});

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'challenge_evaluate', route: '/api/challenge/evaluate' }, async (requestId) => {
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

    const ready = resolveReadyModel(capability.data);
    if (!ready.ok) return Response.json({ state: 'blocked', error: ready.error, resolution: ready.resolution }, { status: ready.status });
    const model = ready.model;

    const supabase = await createClient();
    const { data: practice, error: practiceError } = await supabase
      .from('practice_records')
      .select('*, projects(id,name,subtitle)')
      .eq('id', parsed.data.practiceId)
      .eq('student_id', role.data.id)
      .maybeSingle();
    if (practiceError) return Response.json({ state: 'error', error: `挑战记录加载失败：${practiceError.message}` }, { status: 500 });
    if (!practice) return Response.json({ state: 'error', error: '未找到可评估的真实挑战记录。' }, { status: 404 });
    if (!practice.project_id) return Response.json({ state: 'error', error: '挑战记录缺少项目，不能更新项目认知状态。' }, { status: 422 });
    if (!practice.prompt) return Response.json({ state: 'error', error: '挑战记录缺少题目，不能评估。' }, { status: 422 });

    const project = Array.isArray(practice.projects) ? practice.projects[0] : practice.projects;
    let evaluation: z.infer<typeof evaluationSchema>;
    try {
      // 同 challenge/generate：非流式 JSON 请求在该网关会抛 Invalid JSON response，
      // streamText 的 body 带 stream: true，Output.object 仍产出校验过的对象。
      const result = streamText({
        model,
        output: Output.object({ schema: evaluationSchema }),
        prompt: buildChallengeEvaluationPrompt({
          projectName: project?.name ?? '未知项目',
          projectSubtitle: project?.subtitle,
          targetBloomLevel: practice.target_bloom_level,
          challengePrompt: practice.prompt,
          studentAnswer: parsed.data.answer,
        }),
      });
      evaluation = await result.output;
    } catch (error) {
      // 与 challenge/generate 同理：此前的失败只体现在 502 响应体里，运行日志看不到原因。
      // 只记错误原文，不含 prompt 与对话正文。
      await writeLogEvent({
        level: 'error',
        area: 'api',
        event: 'challenge_evaluate_failed',
        requestId,
        route: '/api/challenge/evaluate',
        method: 'POST',
        status: 502,
        context: { error: (error instanceof Error ? error.message : String(error)).slice(0, 200) },
      });
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
