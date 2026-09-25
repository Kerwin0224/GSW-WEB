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
// 归类能力的核心就是提示词。教师在**空间主题**里写自己的归类口径（spaces.theme），
// 这里把「默认口径」和「空间口径」组装成最终 system instruction。
// 输出协议无论用哪套规则都由系统强制拼接，教师改口径不会破坏解析。

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
 * 把老师提供的**语义部分**与平台的**结构化返回协议**组装成最终 system instruction。
 *
 * 这是本模块唯一的组装点，也是那两部分的接缝所在：
 *
 *   语义部分（老师写）——「本班/本空间按什么分类」，随学科和老师而变，系统不解释它。
 *   协议部分（平台定）——两行输出的格式与「无法归属输出 NULL」的约定，恒定不变。
 *
 * 分成两段而不是一段散文，是为了让「老师改口径」这件事在结构上**没有能力**碰到协议：
 * 老师提供的是内容，格式由系统在末尾强制拼接。解析端（parseClassificationAnswer +
 * project-title.ts 的归一化）只依赖协议，不依赖任何老师写的字。
 *
 * 为什么不用 generateObject 之类的结构化输出把协议变成 schema：所接模型网关只正常服务
 * SSE，非流式 JSON 会直接抛错（2026-09-11 归类事故根因），问答本身也走流式。
 * 协议只能留在提示词里，因此更需要在这里被隔离住。
 *
 * 多条口径时（学生属于多个空间）把全部并列带出，由模型按问题选用——不替模型选。
 */
export function buildProjectClassificationInstruction(options: {
  /** 老师提供的归类口径；为空表示用内置默认。 */
  criteria?: readonly { label: string; instruction: string }[];
} = {}): string {
  const criteria = (options.criteria ?? []).flatMap((criterion) => {
    const instruction = criterion.instruction.trim();
    return instruction ? [{ label: criterion.label.trim() || '学习空间', instruction }] : [];
  });

  // ── 语义部分 ──
  const semantics = criteria.length === 0
    ? defaultProjectClassificationInstruction
    : [
      '你是文韵智途的项目归属裁决器。学生所在的各学习空间各有一套归类口径，'
      + '请选用最贴合学生这个问题的那一套来裁决归属；问题跨口径时取最主要的一套：',
      ...criteria.map((criterion) => `【${criterion.label}】\n${criterion.instruction}`),
    ].join('\n\n');

  // ── 协议部分（无论用内置口径还是老师口径，都走同一条拼接路径）──
  const protocol = `以下是必须遵守的输出协议：${projectClassificationProtocol}`;

  return [semantics, protocol].join('\n\n');
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
