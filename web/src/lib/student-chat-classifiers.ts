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

import {
  buildProjectClassificationInstruction,
  defaultBloomClassificationInstruction,
  matchKnownProjectTitle,
  parseBloomClassificationAnswer,
  parseClassificationAnswer,
} from './student-chat-prompts.ts';

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
 *
 * 归类规则不再是硬编码：接受教师配置的规则与本校目录路径（见 project-classification-prompt）。
 * 不传时退回内置默认，行为与以前一致。
 */
export async function classifyProjectFromQuestion(
  model: LanguageModel,
  question: string,
  knownTitles: readonly string[] = [],
  options: { teacherRules?: readonly { teacherName: string; instruction: string }[]; catalogPaths?: readonly string[] } = {},
): Promise<ProjectClassificationOutcome> {
  const knownTitle = matchKnownProjectTitle(question, knownTitles);
  if (knownTitle) return { title: knownTitle, author: null };
  try {
    const result = streamText({
      model,
      maxOutputTokens: 100,
      system: buildProjectClassificationInstruction(options),
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
    system: defaultBloomClassificationInstruction,
    prompt: `学生问题：${question}\n\n请返回该问题的布鲁姆认知路径最高充分层次和一句不超过 120 字的理由。`,
  });
  const text = await result.text;
  const parsed = parseBloomClassificationAnswer(text);
  if (!parsed) throw new Error(`布鲁姆层级解析失败：${text.slice(0, 80)}`);
  return parsed;
}
