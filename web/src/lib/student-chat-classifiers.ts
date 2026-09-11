/**
 * student-chat-classifiers.ts
 *
 * 学生会话的 AI 分类调用：篇目归属裁决 + 布鲁姆认知路径判定。
 *
 * 两个分类都走流式累积的两行纯文本协议（不依赖结构化输出能力）：
 * 所接模型网关只正常服务 SSE，非流式 JSON 会直接抛错（2026-09-11 归类事故根因）。
 * 两个都是副作用性操作（网络请求 + token 消耗）。
 * 它们从 student-chat-prompts.ts 分离出来，使后者只保留纯函数（提示词构建 + 规范化），
 * 让接缝更清晰：
 *   - student-chat-prompts.ts → 纯函数，可直接单元测试，无 import 'ai'
 *   - student-chat-classifiers.ts → 副作用层，接受 LanguageModel 参数，调用方负责编排时序
 *
 * 两个函数的类型签名和行为与原来完全一致，只是换了文件位置。
 */

import { streamText, type LanguageModel } from 'ai';

import { matchKnownProjectTitle, parseBloomClassificationAnswer, parseClassificationAnswer } from './student-chat-prompts.ts';

// ─── 篇目归属裁决 ────────────────────────────────────────────────────────────

export type ProjectClassificationOutcome =
  | { title: string; author: string | null; failure?: undefined; detail?: undefined }
  | { title: null; author: null; failure: 'model-error' | 'model-unavailable' | 'unclassified'; detail?: string };

/**
 * 篇目归属裁决：仅在全局空白入口首问时调用。
 * 已知篇目直查（学生已有项目，零模型调用）→ 模型直判 → 无法裁决进日常会话归档。
 * 直判走流式累积：所接模型网关只正常服务 SSE，非流式 JSON 会直接抛错；
 * 问答本身走的就是流式，分类与它共用同一条活路。
 * 模型异常不抛出（failure: 'model-error'，附 provider 原文截断），由调用方记日志并降级。
 */
export async function classifyProjectFromQuestion(
  model: LanguageModel,
  question: string,
  knownTitles: readonly string[] = [],
): Promise<ProjectClassificationOutcome> {
  const knownTitle = matchKnownProjectTitle(question, knownTitles);
  if (knownTitle) return { title: knownTitle, author: null };
  try {
    const result = streamText({
      model,
      maxOutputTokens: 100,
      system:
        '你是文韵智途的篇目归属裁决器。只为全局空白入口首问判断会话沉淀容器，不决定 AI 回答范围。只能返回真实古诗文篇目标题。学生是否加书名号只是书写习惯，与能否归属无关："赤壁赋的背景是什么"归赤壁赋，"登高这首诗讲什么"归登高，"静夜思里疑是什么意思"归静夜思，"念奴娇上阕怎么理解"归念奴娇·赤壁怀古。首问提到多个篇目时，以学生本轮真正要学习的主旨裁决一个主篇目，不要直接判无法归属。只要问题聚焦于某个具体篇目或某位作者的作品，就给出对应标题；只有问题与古诗文学习完全无关时才判无法归属。禁止输出占位标题。输出格式必须严格遵守：只输出两行，第一行只写篇目标题本身（不加书名号、不写出处说明、不写完整句子），第二行是作者（能确定才填，否则空着）；无法归属时只输出一行 NULL。',
      prompt: `学生首问：${question}`,
    });
    const text = await result.text;
    const parsed = parseClassificationAnswer(text);
    if (!parsed.title) {
      // 原文进 detail，生产日志（project_classification_fallback）可回查模型到底吐了什么。
      return { title: null, author: null, failure: 'unclassified', detail: text.slice(0, 200) };
    }
    return { title: parsed.title, author: parsed.author };
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 200) : 'unknown classification error';
    return { title: null, author: null, failure: 'model-error', detail };
  }
}
// ─── 布鲁姆认知路径判定 ──────────────────────────────────────────────────────

export type BloomClassificationResult = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  reason: string;
};

/**
 * 布鲁姆认知路径判定：只针对单个学生问题，确定真正学懂所需要达到的最高充分层级。
 * 与篇目归属同理走流式累积的两行文本协议（结构化输出在只讲 SSE 的网关上不可用，
 * 见 project_classification_fallback 事故），解析失败抛错，
 * 由调用方捕获并决定写 bloom_state='failed'。
 */
export async function classifyBloomLevel(
  model: LanguageModel,
  question: string,
): Promise<BloomClassificationResult> {
  const result = streamText({
    model,
    maxOutputTokens: 100,
    system:
      '你是文韵智途的布鲁姆认知路径判定器。只根据学生本轮问题的真实学习意图，判断把这个问题真正学懂所需要达到的最高充分层次；每个问题只记录一个层级。不要参考 AI 回答、教师修订、挑战结果、项目最高层级或学生语气篇幅；这不是挑战确认，也不是项目级布鲁姆认知分布。选择能够完整覆盖问题要求的最低层级，避免高估；若一个问题同时包含多个认知动作，取真正必需的最高动作。1 记忆=找出、背诵、指出人物/景物/字词/原句等文本事实；2 理解=翻译、解释、概括诗句文意或情感；3 应用=把文意、方法或情感迁移到相似新情境；4 分析=比较、拆分结构关系、意象关系、情感递进或写法作用；5 评价=提出判断并用文本依据支持；6 创造=仿写、改写、补写或生成新的贴合文本的表达。只输出以下两行，不要多余文字：第一行是 1 到 6 中的单个数字，第二行是一句不超过 120 字的理由。',
    prompt: `学生问题：${question}\n\n请返回该问题的布鲁姆认知路径最高充分层次和一句不超过 120 字的理由。`,
  });
  const text = await result.text;
  const parsed = parseBloomClassificationAnswer(text);
  if (!parsed) throw new Error(`布鲁姆层级解析失败：${text.slice(0, 80)}`);
  return parsed;
}
