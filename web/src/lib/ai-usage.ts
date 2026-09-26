import 'server-only';

import { wrapLanguageModel, type LanguageModel } from 'ai';
import { z } from 'zod';

import { getProfile } from '@/lib/auth';
import { emitLogEvent } from '@/lib/observability/log-event';
import { createClient } from '@/lib/supabase/server';

/**
 * AI 用量计量。这是「先有计量再谈配额」的第一步。
 *
 * 硬性约束：计量失败**绝不能**影响 AI 主流程。
 * 一次 AI 回答要是因为写不进去量行而失败，代价远大于漏计的那一行，
 * 所以这里全链路 try/catch，失败只落一条 debug 日志。
 * 配额与限流不在本文件范围内——没有配额的计量无法和配额对账，先把口径记准。
 */

export type AiUsageInput = {
  /** 教学场景键（teaching_scenarios.key）或模型能力名。 */
  scenario: string;
  modelId?: string | null;
  providerId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  requestId?: string | null;
  errorCode?: string | null;
};

/**
 * 写一行用量。任何失败都吞掉——调用方在 AI 响应路径上，
 * 这里的异常会变成「学生提问报错」这种完全不相干的症状。
 */
export async function recordAiUsage(input: AiUsageInput): Promise<void> {
  try {
    // 租户从当前会话档案推断：用量必须归到学校和公司，否则按学校分摊无从谈起。
    const profile = await getProfile();
    const supabase = await createClient();
    const { error } = await supabase.rpc('record_ai_usage', {
      p_school_id: profile?.school_id ?? null,
      p_organization_id: profile?.organization_id ?? null,
      p_profile_id: profile?.id ?? null,
      p_scenario: input.scenario,
      p_model_id: input.modelId ?? null,
      p_provider_id: input.providerId ?? null,
      p_input_tokens: input.inputTokens ?? null,
      p_output_tokens: input.outputTokens ?? null,
      p_request_id: input.requestId ?? null,
      p_error_code: input.errorCode ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    emitLogEvent({
      level: 'debug',
      area: 'runtime',
      event: 'ai_usage_record_failed',
      message: error instanceof Error ? error.message : '用量计量写入失败',
      context: { scenario: input.scenario, modelId: input.modelId ?? null },
    });
  }
}

/** 从 SDK 抛出的错误里取一个可统计的短码，取不到就用错误名。 */
function errorCodeOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const cause = 'cause' in error ? error.cause : undefined;
    if (cause && typeof cause === 'object' && 'name' in cause && typeof cause.name === 'string' && cause.name.trim()) {
      return cause.name;
    }
    if ('name' in error && typeof error.name === 'string' && error.name.trim()) return error.name;
  }
  return 'unknown_error';
}

/**
 * 在模型实例上包一层计量。放在 resolveLanguageModel 这一个出口上，
 * 是因为全部 AI 路径（学生会话、教师问答、挑战出题与评阅、AI 预审、
 * 首问归属与提问类型判断）都从这里拿模型——包在调用点上等于要包六遍，
 * 漏一处就是一处静默的用量黑洞。
 */
export function instrumentLanguageModel(model: LanguageModel, usage: AiUsageInput): LanguageModel {
  // LanguageModel 里还包含字符串形式的全局模型 ID，以及 v2/v3 的旧协议实例；
  // 中间件按 v4 的 usage 结构读 token，那两种形态原样放行。
  if (typeof model === 'string' || model.specificationVersion !== 'v4') return model;

  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async (options) => {
        try {
          const result = await options.doGenerate();
          await recordAiUsage({ ...usage, ...tokenFields(result.usage) });
          return result;
        } catch (error) {
          await recordAiUsage({ ...usage, errorCode: errorCodeOf(error) });
          throw error;
        }
      },
      wrapStream: async (options) => {
        let result;
        try {
          result = await options.doStream();
        } catch (error) {
          await recordAiUsage({ ...usage, errorCode: errorCodeOf(error) });
          throw error;
        }
        // 用量随流的 finish 片段到达。不 await：等它落库会把首字节压到一次
        // 数据库往返之后。计量晚一点没关系，漏计量才是问题。
        let recorded = false;
        return {
          ...result,
          stream: result.stream.pipeThrough(new TransformStream({
            transform(part, controller) {
              if (part.type === 'finish') {
                recorded = true;
                void recordAiUsage({ ...usage, ...tokenFields(part.usage) });
              }
              controller.enqueue(part);
            },
            flush() {
              // 流被中断时没有 finish 片段（学生答到一半关掉页面就是这种情况）。
              // 整段漏记会让「实际烧了多少」与账单对不上，所以补一笔标记为未完成的用量。
              if (!recorded) void recordAiUsage({ ...usage, errorCode: 'stream_incomplete' });
            },
          })),
        };
      },
    },
  });
}

/** v4 的用量把缓存命中的输入 token 单列出来了；对账按总数走。 */
function tokenFields(usage: { inputTokens: { total?: number }; outputTokens: { total?: number } }) {
  return { inputTokens: usage.inputTokens.total ?? null, outputTokens: usage.outputTokens.total ?? null };
}

export type AiUsageDailyRow = {
  schoolId: string | null;
  schoolName: string | null;
  day: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  errors: number;
};

// ai_usage_daily 的 Returns 是 Json[]，没有生成类型：数字列在 PostgREST 上可能是
// number 也可能是字符串，coerce 两边都吃下。
const dailyRowSchema = z.object({
  school_id: z.string().nullable(),
  school_name: z.string().nullable(),
  day: z.coerce.string(),
  calls: z.coerce.number(),
  input_tokens: z.coerce.number(),
  output_tokens: z.coerce.number(),
  total_tokens: z.coerce.number(),
  errors: z.coerce.number(),
});

/**
 * 按学校 × 天汇总。作用域由 ai_usage_daily 里的 can_admin_school_scope 判定：
 * 校管理员只看到本校，公司管理员看到本公司全部学校，应用层不再重复过滤。
 */
export async function readAiUsageDaily(from: Date, to: Date): Promise<AiUsageDailyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('ai_usage_daily', { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(error.message);
  return z.array(dailyRowSchema).parse(data ?? []).map((row) => ({
    schoolId: row.school_id,
    schoolName: row.school_name,
    day: row.day,
    calls: row.calls,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    errors: row.errors,
  }));
}
