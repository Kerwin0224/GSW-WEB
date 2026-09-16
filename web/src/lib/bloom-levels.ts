/**
 * bloom-levels.ts
 *
 * 布鲁姆六层的唯一定义。
 *
 * 此前这六层被分别写了四遍，而且每遍都夹带学科内容：
 *   · classification-prompts.ts 的判定提示词      ——「记忆=背诵诗句、分析=意象关系」
 *   · challenge-prompts.ts 的 getK12ChallengeTask ——「让学生从原文中找出人物、景物」
 *   · challenge-prompts.ts 的确认提示词           —— 又一份「1 记忆：能找出或说出明确文本信息」
 *   · bloom-badge.tsx 的 bloomLevelInfo           ——「背诵、识记、找出处」
 * 四份各自漂移，且把「认知层级」和「古诗文内容」焊死在一起：数学班的 L1 会被告知去背诵诗句。
 *
 * 抽象的口径：**层级只描述认知操作，不描述操作对象**。操作对象由教师的归类规则与
 * 学生的实际学习内容带入，提示词和界面都不该替它们假设。
 *
 * 一个层级的 operation 同时服务两个语境，所以写成不带主语的动词短语：
 *   · 判定口径：`${level} ${name}：${operation}`   →「1 记忆：找出并说出材料中的明确信息…」
 *   · 出题要求：`当前层级任务重点：${operation}`    →「当前层级任务重点：找出并说出…」
 *
 * 纯函数、无依赖，可直接单测。
 */

export type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const BLOOM_LEVELS = [1, 2, 3, 4, 5, 6] as const satisfies readonly BloomLevel[];

/** 自高到低。界面上层是高层级（六层塔从「创造」往下看）。 */
export const BLOOM_LEVELS_DESC = [...BLOOM_LEVELS].reverse() as BloomLevel[];

export type BloomLevelInfo = {
  level: BloomLevel;
  /** 层级名。界面、提示词、判定口径共用同一个叫法。 */
  name: string;
  /** 该层级的认知操作，**不含**任何学科内容。判定口径与出题要求共用这一句。 */
  operation: string;
  /** 界面用的极简提示，比 operation 短。 */
  hint: string;
};

export const BLOOM_LEVEL_INFO: Record<BloomLevel, BloomLevelInfo> = {
  1: { level: 1, name: '记忆', operation: '找出并说出材料中的明确信息（人物、时间、字词、原句、定义、公式等）', hint: '识记、找出、复述' },
  2: { level: 2, name: '理解', operation: '用自己的话解释材料的意思，并说清依据', hint: '解释、翻译、概括' },
  3: { level: 3, name: '应用', operation: '把学到的方法或结论用到另一个熟悉的情境里', hint: '套用、迁移、举例' },
  4: { level: 4, name: '分析', operation: '比较、拆分材料中的结构关系、因果关系或写法作用', hint: '比较、拆解、找关系' },
  5: { level: 5, name: '评价', operation: '先提出判断，再用材料里的依据支持这个判断', hint: '判断、论证、评价' },
  6: { level: 6, name: '创造', operation: '完成贴合要求的仿写、改写、补写或新表达，并说明为什么这样写', hint: '创作、仿写、重组' },
};

export function isBloomLevel(value: unknown): value is BloomLevel {
  return typeof value === 'number' && (BLOOM_LEVELS as readonly number[]).includes(value);
}

/** 宽进严出：来源可能是数据库里的 number | null，或脏数据。 */
export function toBloomLevel(value: number | null | undefined): BloomLevel | undefined {
  return isBloomLevel(value) ? value : undefined;
}

/**
 * 把某一层渲染成「出题要求」那一行：`当前层级任务重点：…`。
 * 未知层级退回一句通用要求，不把脏数据传进提示词。
 */
export function bloomLevelTaskLine(level: number): string {
  return isBloomLevel(level)
    ? BLOOM_LEVEL_INFO[level].operation
    : '围绕学生正在学习的内容，完成一个清楚、具体、适合当前层级的学习任务。';
}

/** 把六层渲染成判定口径列表，供提示词直接嵌入。 */
export function formatBloomLevelCriteria(): string {
  return BLOOM_LEVELS.map((level) => `${level} ${BLOOM_LEVEL_INFO[level].name}：${BLOOM_LEVEL_INFO[level].operation}`).join('\n');
}
