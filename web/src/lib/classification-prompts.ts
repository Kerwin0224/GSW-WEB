/**
 * classification-prompts.ts
 *
 * 项目归类与布鲁姆判定的纯函数层：提示词构建 + 模型输出解析 + 标题规范化。
 *
 * 不依赖数据库、AI SDK 或网络请求，可直接单元测试。副作用层
 * （两次流式调用）在 student-chat-classifiers.ts，取数层在 data/classification-rule.ts。
 *
 * 定位：归类口径由**任课教师**用自己的提示词决定（见 buildProjectClassificationInstruction），
 * 这里的默认提示词只是「教师没配」时的兜底，因此不能假设任何学科——
 * 它不知道这是语文课还是数学课，只按学生问题里的学习主题裁决归属。
 */

import { formatBloomLevelCriteria } from './bloom-levels.ts';
import { looksLikeTitleLine, normalizeConcreteProjectTitle, normalizeProjectSubtitle } from './project-title.ts';

// ─── 项目标题规范化（已迁至 project-title.ts，此处重导出保持调用点稳定）────────

export { normalizeConcreteProjectTitle, normalizeProjectSubtitle } from './project-title.ts';

// ─── 已知标题直查 ────────────────────────────────────────────────────────────

/**
 * 在问题里找出学生提到的已知项目标题。
 * 取**最早出现**的那个：学生先说哪个，哪个才是本轮要学的主话题
 * （"《春望》和《静夜思》比较"= 以《春望》为主，与先说哪篇无关的排序是错的）。
 * 同一位置再取更长的标题，因为它更具体（"念奴娇·赤壁怀古" 优先于 "念奴娇"）。
 */
export function matchKnownProjectName(question: string, knownNames: readonly string[]): string | null {
  const haystack = question.replace(/[《》\s]/g, '');
  if (!haystack) return null;
  let best: { name: string; index: number } | null = null;
  for (const raw of knownNames) {
    const name = normalizeConcreteProjectTitle(raw);
    if (!name || name.length < 2) continue;
    const index = haystack.indexOf(name);
    if (index < 0) continue;
    if (!best || index < best.index || (index === best.index && name.length > best.name.length)) {
      best = { name, index };
    }
  }
  return best?.name ?? null;
}

// ─── 归类输出解析 ────────────────────────────────────────────────────────────

/**
 * 解析模型直判的输出：第一行项目标题（或 NULL），第二行补充标识（作者/出处/章节，可空）。
 * 标题走归一化（去书名号、拒占位与拒绝语）。首行不像标题时，从全文的书名号里捞一个
 * （如"这句出自王昌龄的《出塞》，……"→ 出塞）；全文无书名号则判无法归属。
 */
export function parseClassificationAnswer(text: string): { name: string; subtitle: string | null } | { name: null; subtitle: null } {
  const [rawFirst = '', rawSubtitle] = text.trim().split('\n');
  const rawName = rawFirst.replace(/^(?:项目|主题|标题|篇目)\s*[:：]\s*/u, '');
  const name = normalizeConcreteProjectTitle(rawName);
  if (name && name.toUpperCase() !== 'NULL' && looksLikeTitleLine(rawName)) {
    return { name, subtitle: normalizeProjectSubtitle(rawSubtitle) };
  }
  for (const match of text.matchAll(/《([^《》]{1,40})》/g)) {
    const salvaged = normalizeConcreteProjectTitle(match[1]);
    if (salvaged) return { name: salvaged, subtitle: null };
  }
  return { name: null, subtitle: null };
}

// ─── 归类提示词 ──────────────────────────────────────────────────────────────
//
// 归类能力的核心就是提示词。教师在教师端写入自己的归类口径（存 prompt_presets，
// purpose='project_classification'），这里把「默认口径」和「教师口径」组装成最终
// system instruction。输出协议无论用哪套规则都由系统强制拼接，教师改规则不会破坏解析。

/** 输出协议。无论用内置规则还是教师规则，这一段落都由系统强制拼接。 */
const projectClassificationProtocol =
  '输出格式必须严格遵守：只输出两行，第一行只写项目标题本身（不加书名号、不写说明、不写完整句子），'
  + '第二行是项目的补充标识（如作者、出处、章节，能确定才填，否则空着）；无法归属时只输出一行 NULL。';

/**
 * 内置归类口径（教师未配置时使用）。
 *
 * 不假设学科，也不假设分类依据是「篇目」：默认按学生实际在学的学习主题归类。
 * 教师在提示词里写了别的分类依据（按知识点、按题型、按章节……）时，走教师那一套。
 */
export const defaultProjectClassificationInstruction =
  '你是文韵智途的项目归属裁决器。只为全局空白入口首问判断会话的沉淀容器，不决定 AI 回答范围。'
  + '只能返回真实学习项目的标题，禁止输出占位标题。'
  + '默认口径是「按学生实际在学的学习主题归类」：问题聚焦在哪个具体主题上，就归到那个主题的名称。'
  + '同一主题在提问里会有多种说法（简称、别称、只提到其中一部分、不带书名号），按学生真正要学的内容裁决，'
  + '不要因为写法不同就判无法归属。学生是否加书名号只是书写习惯，与能否归属无关。'
  + '首问涉及多个主题时，以学生本轮真正要学习的主旨裁决一个主归属，不要直接判无法归属。'
  + '只有问题与学习完全无关时才判无法归属。';

export const defaultBloomClassificationInstruction =
  '你是文韵智途的布鲁姆认知路径判定器。只根据学生本轮问题的真实学习意图，判断把这个问题真正学懂所需要达到的最高充分层次；每个问题只记录一个层级。'
  + '层级只描述认知操作；操作对象是学生正在学的具体内容，不要假设学科，也不要因为问题简短就判低层级。'
  + '不要参考 AI 回答、教师修订、挑战结果、项目最高层级或学生语气篇幅；这不是挑战确认，也不是项目级布鲁姆认知分布。'
  + '选择能够完整覆盖问题要求的最低层级，避免高估；若一个问题同时包含多个认知动作，取真正必需的最高动作。\n'
  + `${formatBloomLevelCriteria()}\n`
  + '只输出以下两行，不要多余文字：第一行是 1 到 6 中的单个数字，第二行是一句不超过 120 字的理由。';

/**
 * 把教师配置的归类规则组装成最终 system instruction。
 *
 * 每师每班一条：一个班可能有多位任课教师，各写各的归类口径（通常按学科分，但不止于学科）。
 * 规则文本自带适用范围说明，由模型按问题选用对应一条——因此这里把全部规则并列带出，
 * 而不是替模型选。
 *
 * 输出协议由系统强制拼接（内置规则也走同一路径），教师改规则不会破坏解析协议。
 */
export function buildProjectClassificationInstruction(options: {
  /** 本班各任课教师配置的归类规则；为空表示用内置默认。 */
  teacherRules?: readonly { teacherName: string; instruction: string }[];
} = {}): string {
  const rules = (options.teacherRules ?? []).flatMap((rule) => {
    const instruction = rule.instruction.trim();
    return instruction ? [{ teacherName: rule.teacherName.trim() || '任课教师', instruction }] : [];
  });

  const head = rules.length === 0
    ? defaultProjectClassificationInstruction
    : [
      '你是文韵智途的项目归属裁决器。本班各任课教师配置了各自的归类口径，'
      + '请选用最贴合学生这个问题的那一条来裁决归属；问题跨口径时取最主要的一条：',
      ...rules.map((rule) => `【${rule.teacherName}】\n${rule.instruction}`),
    ].join('\n\n');

  return [head, `以下是必须遵守的输出协议：${projectClassificationProtocol}`].join('\n\n');
}

// ─── 布鲁姆判定输出解析 ──────────────────────────────────────────────────────

export type BloomClassificationAnswer = { level: 1 | 2 | 3 | 4 | 5 | 6; reason: string };

// 解析布鲁姆判定的输出：第一行是 1-6 的单个数字，第二行是理由（可空，超长截断）。
// 行首允许少量非数字前缀（如"第4层"）；数字后紧跟数字视为编号序列而非层级，判解析失败。
export function parseBloomClassificationAnswer(text: string): BloomClassificationAnswer | null {
  const [rawLevel = '', ...rest] = text.trim().split('\n');
  const match = rawLevel.match(/^\D*([1-6])(?!\d)/);
  if (!match) return null;
  return { level: Number(match[1]) as BloomClassificationAnswer['level'], reason: rest.join('\n').trim().slice(0, 120) };
}
