import { generateObject, type LanguageModel } from 'ai';
import { z } from 'zod';

import { withApiLogging } from '@/lib/observability/with-api-logging';
import { createClient } from '@/lib/supabase/server';
import { getCapability, requireRole, resolveLanguageModel } from '@/lib/data/common';
import { buildChallengeGenerationPrompt, getK12ChallengeTask } from '@/lib/challenge-prompts';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const postgresUuidSchema = z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');

const bodySchema = z.object({
  projectId: postgresUuidSchema,
});

const challengeSchema = z.object({
  prompt: z.string().trim().min(8).max(800),
  guidance: z.string().trim().min(1).max(240),
});

function nextBloomLevel(confirmedLevel: number | null | undefined) {
  if (!confirmedLevel) return 1;
  return Math.min(confirmedLevel + 1, 6);
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

    const targetBloomLevel = nextBloomLevel(project.highest_bloom_level);
    const { data: priorQuestions, error: questionError } = await supabase
      .from('conversation_messages')
      .select('content,bloom_level,created_at,conversations!inner(project_id,deleted_at)')
      .eq('conversations.project_id', project.id)
      .is('conversations.deleted_at', null)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(8);
    if (questionError) return Response.json({ state: 'error', error: `项目问题加载失败：${questionError.message}` }, { status: 500 });

    // 同一项目下只允许一条待作答挑战；先把旧的 pending 标成 blocked 再插入新记录。
    const { error: blockError } = await supabase
      .from('practice_records')
      .update({ evaluation_state: 'blocked' })
      .eq('student_id', role.data.id)
      .eq('project_id', project.id)
      .eq('evaluation_state', 'pending');
    if (blockError) return Response.json({ state: 'error', error: `清理旧挑战记录失败：${blockError.message}` }, { status: 500 });

    let generated: z.infer<typeof challengeSchema>;
    try {
      const result = await generateObject({
        model,
        schema: challengeSchema,
        prompt: buildChallengeGenerationPrompt({
          projectTitle: project.title,
          projectAuthor: project.author,
          targetBloomLevel,
          priorQuestions: priorQuestions ?? [],
        }),
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
