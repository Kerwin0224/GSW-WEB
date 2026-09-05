/**
 * student-chat-classifiers.ts
 *
 * 学生会话的 AI 分类调用：篇目归属裁决 + 布鲁姆认知路径判定。
 *
 * 这两个函数都调用 `generateObject`，是副作用性操作（网络请求 + token 消耗）。
 * 它们从 student-chat-prompts.ts 分离出来，使后者只保留纯函数（提示词构建 + 规范化），
 * 让接缝更清晰：
 *   - student-chat-prompts.ts → 纯函数，可直接单元测试，无 import 'ai'
 *   - student-chat-classifiers.ts → 副作用层，接受 LanguageModel 参数，调用方负责编排时序
 *
 * 两个函数的类型签名和行为与原来完全一致，只是换了文件位置。
 */

import { generateObject, type LanguageModel } from 'ai';
import { z } from 'zod';

import { extractExplicitProjectTitle, normalizeConcreteProjectTitle, normalizeProjectAuthor } from './student-chat-prompts';

// ─── 篇目归属裁决 ────────────────────────────────────────────────────────────

const projectSchema = z.object({
  title: z.string().trim().max(80).nullable(),
  author: z.string().trim().max(40).nullable().optional(),
  confidence: z.number().min(0).max(1),
});

/**
 * 篇目归属裁决：仅在全局空白入口首问时调用。
 * 置信度 < 0.8 或无法裁决时返回 null，会话进入日常会话归档。
 * 失败时静默返回 null（不抛出），由调用方决定降级策略。
 */
export async function classifyProjectFromQuestion(
  model: LanguageModel,
  question: string,
): Promise<{ title: string | null; author: string | null }> {
  // 快路径：首问自带《书名号》时直接归档，不等模型裁决——
  // 消除"发起提问后长时间不归档"的最常见原因（模型慢/裁决保守/调用失败）。
  const explicitTitle = extractExplicitProjectTitle(question);
  if (explicitTitle) return { title: explicitTitle, author: null };
  try {
    const result = await generateObject({
      model,
      schema: projectSchema,
      system:
        '你是文韵智途的篇目归属裁决器。只为全局空白入口首问判断会话沉淀容器，不决定 AI 回答范围。只能返回真实古诗文篇目标题；title 去掉书名号，不要返回作者、主题、体裁、年级、题型、泛泛学习意图或占位标题。首问提到多个篇目时，不要直接归入日常会话归档；请根据学生本轮真正要学习或追问的主旨裁决一个主篇目。只有无法确定主篇目、候选篇目只是例子、问题泛泛谈古诗文学习，或置信度不足时，才返回 title=null、confidence=0。禁止返回"自动识别中的篇目""未定篇目""待自动归属""篇目项目""日常会话归档"等占位标题。',
      prompt: `学生首问：${question}\n\n输出具体篇目标题、作者（能确定才填）和置信度。若不能可靠裁决一个主篇目，title 必须为 null。`,
    });
    if (result.object.confidence < 0.8) return { title: null, author: null };
    return {
      title: normalizeConcreteProjectTitle(result.object.title),
      author: normalizeProjectAuthor(result.object.author),
    };
  } catch {
    return { title: null, author: null };
  }
}

// ─── 布鲁姆认知路径判定 ──────────────────────────────────────────────────────

const bloomLevelSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3),
  z.literal(4), z.literal(5), z.literal(6),
]);
const bloomSchema = z.object({
  level: bloomLevelSchema,
  reason: z.string().trim().max(120),
});

export type BloomClassificationResult = z.infer<typeof bloomSchema>;

/**
 * 布鲁姆认知路径判定：只针对单个学生问题，确定真正学懂所需要达到的最高充分层级。
 * 调用方负责捕获异常并决定写 bloom_state='failed'。
 */
export async function classifyBloomLevel(
  model: LanguageModel,
  question: string,
): Promise<BloomClassificationResult> {
  const result = await generateObject({
    model,
    schema: bloomSchema,
    system:
      '你是文韵智途的布鲁姆认知路径判定器。只根据学生本轮问题的真实学习意图，判断把这个问题真正学懂所需要达到的最高充分层次；每个问题只记录一个层级。不要参考 AI 回答、教师修订、挑战结果、项目最高层级或学生语气篇幅；这不是挑战确认，也不是项目级布鲁姆认知分布。选择能够完整覆盖问题要求的最低层级，避免高估；若一个问题同时包含多个认知动作，取真正必需的最高动作。1 记忆=找出、背诵、指出人物/景物/字词/原句等文本事实；2 理解=翻译、解释、概括诗句文意或情感；3 应用=把文意、方法或情感迁移到相似新情境；4 分析=比较、拆分结构关系、意象关系、情感递进或写法作用；5 评价=提出判断并用文本依据支持；6 创造=仿写、改写、补写或生成新的贴合文本的表达。只输出结构化结果。',
    prompt: `学生问题：${question}\n\n请返回该问题的布鲁姆认知路径最高充分层次和一句不超过 120 字的理由。`,
  });
  return result.object;
}
