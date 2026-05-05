import 'server-only';

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGateway } from 'ai';
import type { LanguageModel } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { getChallengeClimbProgress } from '@/lib/challenge-progression';
import { getModelTier, resolveEnvSecret, type ModelTierStatus } from '@/lib/data/common';

export type ChallengeData = {
  id: string;
  projectId: string;
  projectTitle: string;
  targetLevel: number;
  prompt: string;
  structuredQuestions: ChallengeStructuredQuestion[];
  createdAt: string;
};

export type ChallengeStructuredQuestion = {
  label: string;
  prompt: string;
  requiredEvidence: string;
};

const bloomLevelNames: Record<number, string> = {
  1: '记忆',
  2: '理解',
  3: '应用',
  4: '分析',
  5: '评价',
  6: '创造',
};

function getLevelTaskInstruction(targetLevel: number) {
  switch (targetLevel) {
    case 1:
      return '准确回忆文本中的人物、意象、事件、字词或句子信息。';
    case 2:
      return '用自己的话解释文本意义，并说明关键句如何支持你的解释。';
    case 3:
      return '把文本中的方法、情感或道理迁移到一个新语境中使用。';
    case 4:
      return '拆解文本结构、意象关系、情感转折或论证层次。';
    case 5:
      return '提出判断并用文本证据论证这个判断是否成立。';
    case 6:
      return '综合文本特征进行仿写、重组、改写或设计新的表达方案。';
    default:
      return '围绕文本完成对应认知层级的任务。';
  }
}

function buildStructuredQuestions(targetLevel: number, coreTask: string): ChallengeStructuredQuestion[] {
  const levelName = bloomLevelNames[targetLevel] ?? '认知';
  return [
    {
      label: '证据定位',
      prompt: '先写出你会依据的原文词句、意象、人物、事件或文意线索。',
      requiredEvidence: '必须包含至少一处可回到文本核对的具体依据。',
    },
    {
      label: `L${targetLevel} ${levelName}任务`,
      prompt: `${coreTask}\n答题时要体现：${getLevelTaskInstruction(targetLevel)}`,
      requiredEvidence: `必须用上一问的证据完成 L${targetLevel} ${levelName} 的认知操作。`,
    },
    {
      label: '自我校验',
      prompt: `说明你的答案为什么已经达到 L${targetLevel} ${levelName}，如果还不够，需要补哪一步。`,
      requiredEvidence: '必须明确写出判断理由，而不是只给结论。',
    },
  ];
}

function formatStructuredChallenge(targetLevel: number, questions: ChallengeStructuredQuestion[]) {
  const levelName = bloomLevelNames[targetLevel] ?? '认知';
  return [
    `目标核查：L${targetLevel} ${levelName}`,
    '请按以下三步作答，缺少任一步都不会判定为达标。',
    ...questions.map((question, index) => `${index + 1}. ${question.label}\n${question.prompt}\n要求：${question.requiredEvidence}`),
  ].join('\n\n');
}

function extractCoreTask(prompt: string, targetLevel: number) {
  const marker = `2. ${buildStructuredQuestions(targetLevel, '')[1].label}`;
  const [, afterMarker] = prompt.split(marker);
  if (!afterMarker) return prompt;
  const [body] = afterMarker.split('\n要求：');
  return body.replace(`\n答题时要体现：${getLevelTaskInstruction(targetLevel)}`, '').trim() || prompt;
}

export type EvaluationResult = {
  id: string;
  achieved: boolean;
  feedback: string;
  evaluatedAt: string;
};

export type ChallengeError = {
  error: string;
  resolution?: string;
};

function resolveLanguageModel(tier: ModelTierStatus): LanguageModel | null {
  if (!tier.modelId) return null;
  const apiKey = resolveEnvSecret(tier.secretRef);
  if (!apiKey) return null;
  if (tier.providerType === 'gateway') {
    return createGateway({
      apiKey,
      baseURL: tier.baseUrl ?? process.env.AI_GATEWAY_BASE_URL
    })(tier.modelId);
  }
  return createOpenAI({
    apiKey,
    baseURL: tier.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined
  })(tier.modelId);
}

/**
 * 生成挑战题目
 * @param projectId 项目 ID
 * @param userId 用户 ID
 * @param targetLevel 目标布鲁姆层级 (1-6)
 * @returns 挑战数据或错误信息
 */
export async function generateChallenge(
  projectId: string,
  userId: string,
  targetLevel: number
): Promise<ChallengeData | ChallengeError> {
  try {
    // 验证目标层级
    if (targetLevel < 1 || targetLevel > 6) {
      return { error: '目标层级必须在 1-6 之间' };
    }

    const supabase = await createClient();

    // 获取项目信息
    const { data: project, error: projectError } = await supabase
      .from('text_projects')
      .select('id, title, author, text_type, highest_bloom_level')
      .eq('id', projectId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (projectError) {
      return { error: `获取项目信息失败：${projectError.message}` };
    }

    if (!project) {
      return { error: '项目不存在或无权访问' };
    }

    // 获取用户当前最高层级
    const { data: userMessages, error: messagesError } = await supabase
      .from('conversation_messages')
      .select('bloom_level, conversations!inner(project_id, owner_id)')
      .eq('conversations.project_id', projectId)
      .eq('conversations.owner_id', userId)
      .eq('role', 'user')
      .not('bloom_level', 'is', null)
      .order('bloom_level', { ascending: false })
      .limit(1);

    if (messagesError) {
      return { error: `获取用户历史失败：${messagesError.message}` };
    }

    const currentMaxLevel = userMessages?.[0]?.bloom_level ?? 0;

    const { data: practices, error: practicesError } = await supabase
      .from('practice_records')
      .select('target_bloom_level, achieved, evaluation_state')
      .eq('project_id', projectId)
      .eq('student_id', userId);

    if (practicesError) {
      return { error: `获取挑战进度失败：${practicesError.message}` };
    }

    const climbProgress = getChallengeClimbProgress(practices ?? []);
    if (targetLevel !== climbProgress.currentLevel || climbProgress.isComplete) {
      return {
        error: '挑战层级尚未解锁',
        resolution: climbProgress.isComplete
          ? 'L1 到 L6 已全部达标，请回到项目详情查看挑战核查证据。'
          : `请先完成当前 L${climbProgress.currentLevel} 挑战，达标后才能进入下一层。`,
      };
    }

    // 检查能力配置
    const flash = await getModelTier('flash');
    if (!flash.ok || !flash.data.ready) {
      return {
        error: 'Flash Model 未配置',
        resolution: flash.ok ? flash.data.blockedReason : flash.message
      };
    }

    const languageModel = resolveLanguageModel(flash.data);
    if (!languageModel) {
      return {
        error: '服务端模型密钥缺失',
        resolution: `${flash.data.providerName ?? 'Provider'} 的 secret_ref 未在服务端环境中解析成功`
      };
    }

    // 构建出题提示词
    const systemPrompt = `你是文韵智途的古诗文认知核查出题助手。根据项目信息和目标布鲁姆层级生成一个核心任务。

布鲁姆认知层级：
1. 记忆：回忆基本事实、术语、概念
2. 理解：解释意义、转述、举例说明
3. 应用：在新情境中使用知识
4. 分析：分解结构、识别关系、区分要素
5. 评价：判断价值、批判性思考、论证观点
6. 创造：综合信息、设计方案、创作新作品

要求：
- 核心任务必须与项目《${project.title}》${project.author ? `（作者：${project.author}）` : ''}相关
- 核心任务难度对应布鲁姆层级 ${targetLevel}
- 核心任务要能真实核查学生是否具备该层认知能力
- 不要输出分步骤题面，不要包含答案，只输出一个清晰具体的核心任务
- 用简洁的中文表述`;

    const userPrompt = `项目：《${project.title}》
作者：${project.author ?? '未知'}
类型：${project.text_type}
用户当前最高层级：${currentMaxLevel}
目标层级：${targetLevel}

请生成一道符合层级 ${targetLevel} 的练习题。`;

    // 调用 AI 生成题目
    const { text: coreTask } = await generateText({
      model: languageModel,
      system: systemPrompt,
      prompt: userPrompt,
    });

    if (!coreTask || coreTask.trim().length === 0) {
      return { error: 'AI 生成题目失败，返回内容为空' };
    }

    const structuredQuestions = buildStructuredQuestions(targetLevel, coreTask.trim());
    const prompt = formatStructuredChallenge(targetLevel, structuredQuestions);

    // 存储到 practice_records 表
    const { data: record, error: insertError } = await supabase
      .from('practice_records')
      .insert({
        student_id: userId,
        project_id: projectId,
        target_bloom_level: targetLevel,
        prompt,
        evaluation_state: 'pending',
      })
      .select('id, student_id, project_id, target_bloom_level, prompt, created_at')
      .single();

    if (insertError || !record) {
      return { error: `存储题目失败：${insertError?.message ?? '未知错误'}` };
    }

    return {
      id: record.id,
      projectId: record.project_id ?? projectId,
      projectTitle: project.title,
      targetLevel: record.target_bloom_level,
      prompt: record.prompt ?? '',
      structuredQuestions,
      createdAt: record.created_at,
    };
  } catch (error) {
    return {
      error: '生成挑战题目时发生异常',
      resolution: error instanceof Error ? error.message : '未知错误'
    };
  }
}

/**
 * 评判用户答案
 * @param challengeId 挑战记录 ID
 * @param userAnswer 用户答案
 * @returns 评判结果或错误信息
 */
export async function evaluateAnswer(
  challengeId: string,
  userId: string,
  userAnswer: string
): Promise<EvaluationResult | ChallengeError> {
  try {
    // 验证答案不为空
    if (!userAnswer || userAnswer.trim().length === 0) {
      return { error: '答案不能为空' };
    }

    const supabase = await createClient();

    // 获取挑战记录
    const { data: challenge, error: challengeError } = await supabase
      .from('practice_records')
      .select('id, student_id, project_id, target_bloom_level, prompt, answer, evaluation_state, text_projects(title, author)')
      .eq('id', challengeId)
      .eq('student_id', userId)
      .maybeSingle();

    if (challengeError) {
      return { error: `获取挑战记录失败：${challengeError.message}` };
    }

    if (!challenge) {
      return { error: '挑战记录不存在' };
    }

    if (challenge.evaluation_state === 'evaluated') {
      return { error: '该挑战已评判，不能重复提交' };
    }

    if (!challenge.prompt) {
      return { error: '挑战题目缺失，无法评判' };
    }

    // 检查能力配置
    const advanced = await getModelTier('advanced');
    if (!advanced.ok || !advanced.data.ready) {
      return {
        error: 'Advanced Model 未配置',
        resolution: advanced.ok ? advanced.data.blockedReason : advanced.message
      };
    }

    const languageModel = resolveLanguageModel(advanced.data);
    if (!languageModel) {
      return {
        error: '服务端模型密钥缺失',
        resolution: `${advanced.data.providerName ?? 'Provider'} 的 secret_ref 未在服务端环境中解析成功`
      };
    }

    const projectInfo = Array.isArray(challenge.text_projects)
      ? challenge.text_projects[0]
      : challenge.text_projects;
    const structuredQuestions = buildStructuredQuestions(
      challenge.target_bloom_level,
      extractCoreTask(challenge.prompt, challenge.target_bloom_level)
    );

    // 构建评判提示词
    const systemPrompt = `你是文韵智途的古诗文认知核查评判助手。根据结构化题目和用户答案，评判答案是否达到目标布鲁姆层级要求。

布鲁姆认知层级：
1. 记忆：回忆基本事实、术语、概念
2. 理解：解释意义、转述、举例说明
3. 应用：在新情境中使用知识
4. 分析：分解结构、识别关系、区分要素
5. 评价：判断价值、批判性思考、论证观点
6. 创造：综合信息、设计方案、创作新作品

评判标准：
- 答案是否准确回应了题目要求
- 答案是否逐项回应“证据定位 / L${challenge.target_bloom_level} 任务 / 自我校验”三个结构化问题
- 答案是否包含可核对的文本证据，并用证据完成目标层级的认知操作
- 答案是否体现了目标层级的认知能力
- 答案的深度和完整性
- 只有三步都成立且目标层级能力明确时，ACHIEVED 才能为 true

输出格式（严格按照此格式）：
ACHIEVED: true/false
FEEDBACK: [具体的反馈意见，包括优点和改进建议]`;

    const userPrompt = `项目：《${projectInfo?.title ?? '未知'}》
作者：${projectInfo?.author ?? '未知'}
目标层级：${challenge.target_bloom_level}

题目：
${challenge.prompt}

结构化核查点：
${structuredQuestions.map((question, index) => `${index + 1}. ${question.label}：${question.requiredEvidence}`).join('\n')}

用户答案：
${userAnswer.trim()}

请评判该答案是否达到层级 ${challenge.target_bloom_level} 的要求。`;

    // 调用 AI 评判答案
    const { text: evaluationText } = await generateText({
      model: languageModel,
      system: systemPrompt,
      prompt: userPrompt,
    });

    if (!evaluationText || evaluationText.trim().length === 0) {
      return { error: 'AI 评判失败，返回内容为空' };
    }

    // 解析评判结果
    const achievedMatch = evaluationText.match(/ACHIEVED:\s*(true|false)/i);
    const feedbackMatch = evaluationText.match(/FEEDBACK:\s*([\s\S]+)/);

    const achieved = achievedMatch?.[1]?.toLowerCase() === 'true';
    const feedback = feedbackMatch?.[1]?.trim() ?? evaluationText.trim();

    // 更新 practice_records 表
    const { data: updatedRecord, error: updateError } = await supabase
      .from('practice_records')
      .update({
        answer: userAnswer.trim(),
        feedback,
        achieved,
        evaluation_state: 'evaluated',
      })
      .eq('id', challengeId)
      .eq('student_id', userId)
      .select('id, created_at')
      .single();

    if (updateError || !updatedRecord) {
      return { error: `更新评判结果失败：${updateError?.message ?? '未知错误'}` };
    }

    return {
      id: updatedRecord.id,
      achieved,
      feedback,
      evaluatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      error: '评判答案时发生异常',
      resolution: error instanceof Error ? error.message : '未知错误'
    };
  }
}
