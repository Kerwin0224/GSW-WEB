/**
 * student-chat-prompts.ts
 *
 * 学生会话的纯函数层：系统提示词构建 + 篇目标题/作者规范化。
 *
 * 不依赖数据库、AI SDK 或网络请求，可直接单元测试。
 * 副作用性 AI 分类调用（篇目归属裁决、布鲁姆认知路径判定）
 * 已移至 student-chat-classifiers.ts。
 */

// ─── 篇目标题规范化 ──────────────────────────────────────────────────────────

const nonConcreteProjectTitles = new Set([
  '自动识别中的篇目', '未定篇目', '待自动归属', '待归属篇目',
  '未知篇目', '未识别篇目', '默认篇目', '示例篇目', '篇目标题',
  '篇目项目', '日常会话归档',
]);

/**
 * 拒绝语识别。模型经常不守"无法归属时只输出 NULL"的协议，改说自然语言
 * （"无法归属""无具体篇目"…）。这些必须判为无法归属，否则会被当作真实标题
 * 建成垃圾项目——这是归类链路里最隐蔽的一类脏数据。
 */
const rejectionPattern = /^(?:null|无|没有|无法|不能|不确定|未知|无关|与.{0,12}无关|无(?:法)?(?:归属|判断|确定|识别|匹配|具体\d*篇目)|不(?:属于|是|在).{0,12}篇目)$/iu;

export function normalizeConcreteProjectTitle(value?: string | null): string | null {
  const title = value?.trim().replace(/^《(.+)》$/, '$1').trim();
  if (!title || title.length > 80) return null;
  if (nonConcreteProjectTitles.has(title)) return null;
  // 协议里的 NULL 及自然语言拒绝语都不是标题。
  if (rejectionPattern.test(title)) return null;
  return title;
}

export function normalizeProjectAuthor(value?: string | null): string | null {
  const author = value?.trim();
  return author ? author : null;
}

/**
 * 在问题里找出学生提到的已知篇目。
 * 取**最早出现**的那个：学生先说哪个，哪个才是本轮要学的主篇目
 * （"《春望》和《静夜思》比较"= 以《春望》为主，与先说哪篇无关的排序是错的）。
 * 同一位置再取更长的标题，因为它更具体（"念奴娇·赤壁怀古" 优先于 "念奴娇"）。
 */
export function matchKnownProjectTitle(question: string, knownTitles: readonly string[]): string | null {
  const haystack = question.replace(/[《》\s]/g, '');
  if (!haystack) return null;
  let best: { title: string; index: number } | null = null;
  for (const raw of knownTitles) {
    const title = normalizeConcreteProjectTitle(raw);
    if (!title || title.length < 2) continue;
    const index = haystack.indexOf(title);
    if (index < 0) continue;
    if (!best || index < best.index || (index === best.index && title.length > best.title.length)) {
      best = { title, index };
    }
  }
  return best?.title ?? null;
}

// 首行是否可信为一行标题：小模型不守协议时会把整段回答当首行输出，
// 散文特征（句读）或超长都不可信，必须拒绝，否则会把整句话建成垃圾项目。
function looksLikeTitleLine(value: string): boolean {
  return value.length <= 40 && !/[。！？；，、…]/.test(value);
}

// 解析模型直判的输出：第一行篇目标题（或 NULL），第二行作者（可空）。
// 标题走归一化（去书名号、拒占位词）。首行不像标题时，从全文的书名号里捞主篇目
// （如"这句出自王昌龄的《出塞》，……"→ 出塞）；全文无书名号则判无法归属。
export function parseClassificationAnswer(text: string): { title: string; author: string | null } | { title: null; author: null } {
  const [rawFirst = '', rawAuthor] = text.trim().split('\n');
  const rawTitle = rawFirst.replace(/^(?:篇目|标题)\s*[:：]\s*/u, '');
  const title = normalizeConcreteProjectTitle(rawTitle);
  if (title && title.toUpperCase() !== 'NULL' && looksLikeTitleLine(rawTitle)) {
    return { title, author: normalizeProjectAuthor(rawAuthor) };
  }
  for (const match of text.matchAll(/《([^《》]{1,40})》/g)) {
    const salvaged = normalizeConcreteProjectTitle(match[1]);
    if (salvaged) return { title: salvaged, author: null };
  }
  return { title: null, author: null };
}

export type BloomClassificationAnswer = { level: 1 | 2 | 3 | 4 | 5 | 6; reason: string };

// 解析布鲁姆判定的输出：第一行是 1-6 的单个数字，第二行是理由（可空，超长截断）。
// 行首允许少量非数字前缀（如"第4层"）；数字后紧跟数字视为编号序列而非层级，判解析失败。
export function parseBloomClassificationAnswer(text: string): BloomClassificationAnswer | null {
  const [rawLevel = '', ...rest] = text.trim().split('\n');
  const match = rawLevel.match(/^\D*([1-6])(?!\d)/);
  if (!match) return null;
  return { level: Number(match[1]) as BloomClassificationAnswer['level'], reason: rest.join('\n').trim().slice(0, 120) };
}

// ─── 分类器提示词（可被教师配置覆盖）────────────────────────────────────────
//
// 归类能力的核心就是提示词。这里把内置提示词抽成纯函数返回值，
// 使它能作为“数据”传入分类器：教师在后台写一套自己的归类规则，
// 就覆盖这里的默认值。分类器与路由都不再硬编码任何提示词文本。

/** 输出协议。无论用内置规则还是教师规则，这一段落都由系统强制拼接。 */
const projectClassificationProtocol =
  '输出格式必须严格遵守：只输出两行，第一行只写项目标题本身（不加书名号、不写出处说明、不写完整句子），'
  + '第二行是作者或出处（能确定才填，否则空着）；无法归属时只输出一行 NULL。';

/** 内置归类规则（教师未配置时使用）。不含输出协议——协议统一由下方函数拼接。 */
export const defaultProjectClassificationInstruction =
  '你是文韵智途的篇目归属裁决器。只为全局空白入口首问判断会话沉淀容器，不决定 AI 回答范围。只能返回真实学习项目的标题。学生是否加书名号只是书写习惯，与能否归属无关："赤壁赋的背景是什么"归赤壁赋，"登高这首诗讲什么"归登高，"静夜思里疑是什么意思"归静夜思，"念奴娇上阕怎么理解"归念奴娇·赤壁怀古。首问提到多个篇目时，以学生本轮真正要学习的主旨裁决一个主篇目，不要直接判无法归属。只要问题聚焦于某个具体篇目或某位作者的作品，就给出对应标题；只有问题与学习完全无关时才判无法归属。禁止输出占位标题。';

export const defaultBloomClassificationInstruction =
  '你是文韵智途的布鲁姆认知路径判定器。只根据学生本轮问题的真实学习意图，判断把这个问题真正学懂所需要达到的最高充分层次；每个问题只记录一个层级。不要参考 AI 回答、教师修订、挑战结果、项目最高层级或学生语气篇幅；这不是挑战确认，也不是项目级布鲁姆认知分布。选择能够完整覆盖问题要求的最低层级，避免高估；若一个问题同时包含多个认知动作，取真正必需的最高动作。1 记忆=找出、背诵、指出人物/景物/字词/原句等文本事实；2 理解=翻译、解释、概括诗句文意或情感；3 应用=把文意、方法或情感迁移到相似新情境；4 分析=比较、拆分结构关系、意象关系、情感递进或写法作用；5 评价=提出判断并用文本依据支持；6 创造=仿写、改写、补写或生成新的贴合文本的表达。只输出以下两行，不要多余文字：第一行是 1 到 6 中的单个数字，第二行是一句不超过 120 字的理由。';

/**
 * 把教师配置的归类规则组装成最终 system instruction。
 *
 * 每师每班一条：一个班可能有多位任课教师（语文/数学/英语），各写各的学科口径。
 * 规则文本自带学科说明，由模型按问题所属学科选用对应一条——
 * 因此这里把全部规则并列带出，而不是替模型选。
 *
 * 输出协议由系统强制拼接（内置规则也走同一路径），教师改规则不会破坏解析协议。
 */
export function buildProjectClassificationInstruction(options: {
  /** 本班各任课教师配置的归类规则；为空表示用内置默认。 */
  teacherRules?: readonly { teacherName: string; instruction: string }[];
  /** 本校目录路径（如 "语文 / 高一 / 文言文"），帮助模型对齐本校归属口径。 */
  catalogPaths?: readonly string[];
} = {}): string {
  const rules = (options.teacherRules ?? []).flatMap((rule) => {
    const instruction = rule.instruction.trim();
    return instruction ? [{ teacherName: rule.teacherName.trim() || '任课教师', instruction }] : [];
  });

  const head = rules.length === 0
    ? defaultProjectClassificationInstruction
    : [
      '你是文韵智途的项目归属裁决器。本班各科教师配置了各自的归类口径，'
      + '请按学生问题所属的学科，选用对应那一条来裁决归属；问题跨学科时取最主要的一门：',
      ...rules.map((rule) => `【${rule.teacherName}】\n${rule.instruction}`),
    ].join('\n\n');

  const parts = [head, `以下是必须遵守的输出协议：${projectClassificationProtocol}`];
  if (options.catalogPaths?.length) {
    parts.push(`本校可选归属路径（尽量归到已存在的路径节点上）：\n${options.catalogPaths.map((path) => `- ${path}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

// ─── 系统提示词构建 ───────────────────────────────────────────────────────────

export type StudentSystemPromptContext =
  /** 会话已归入具体篇目 */
  | { kind: 'project'; projectTitle: string; attachmentPrompt?: string }
  /** 全局空白入口，篇目识别正在后台进行 */
  | { kind: 'classifying'; attachmentPrompt?: string }
  /** 日常会话归档：无篇目，无识别 */
  | { kind: 'archive'; attachmentPrompt?: string };

/**
 * 构建学生会话的 AI 系统提示词。
 *
 * 纯函数，不依赖数据库或 AI 调用，可直接单元测试。
 * 三种状态对应 CONTEXT.md 里定义的三种会话容器：
 *   - project：已归属篇目项目
 *   - classifying：全局空白入口首问，篇目识别进行中
 *   - archive：日常会话归档
 */
export function buildStudentSystemPrompt(ctx: StudentSystemPromptContext): string {
  const attachment = ctx.attachmentPrompt ?? '';

  switch (ctx.kind) {
    case 'project':
      return (
        `你是文韵智途的古诗文 AI 教学助手。当前会话已归入《${ctx.projectTitle}》项目；` +
        '归属只表示会话沉淀容器，不限制你在回答中比较或引用其他被学生提到的篇目，也不要建议迁移或改派会话。' +
        '回答时先直接解决学生问题，再结合必要的原文依据、关键字词、句意、情感脉络或表达手法引导理解。' +
        '保持启发式，不替学生完成全部思考；每轮最多提出 1 个自然追问。' +
        '不要把会话说成挑战，不要声称已完成教师核实，不要承诺布鲁姆认知水平已被确认，不要提及 SFT/DPO 或后台数据流程。' +
        attachment
      );

    case 'classifying':
      return (
        '你是文韵智途的古诗文 AI 教学助手。当前会话来自全局空白入口，篇目归属正在后台识别；' +
        '你的回答不等待归属结果，也不要自称已经归入某个项目。' +
        '先直接回应学生问题，再结合必要的原文依据、关键字词、句意、情感脉络或表达手法引导理解；' +
        '若问题涉及多个篇目，可以围绕学生的核心问题做必要比较。每轮最多提出 1 个自然追问。' +
        '不要声称会话已完成篇目归属、教师核实或布鲁姆认知水平确认，不要提及 SFT/DPO 或后台数据流程。' +
        attachment
      );

    case 'archive':
      return (
        '你是文韵智途的古诗文 AI 教学助手。当前会话暂存于日常会话归档；' +
        '该会话不会迁入篇目项目，也不会生成布鲁姆认知路径或挑战依据。' +
        '若学生提到具体篇目，只在本会话内基于该篇目帮助学习，不要承诺本会话会补归属或迁移；' +
        '学生若要进入篇目项目，需要离开当前归档会话后从项目或全局空白入口新开会话。' +
        '先直接回应问题，再结合必要的原文依据、关键字词、句意、情感脉络或表达手法引导理解；' +
        '每轮最多提出 1 个自然追问。' +
        '不要声称已完成教师核实，不要提及 SFT/DPO 或后台数据流程。' +
        attachment
      );
  }
}
