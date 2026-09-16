/**
 * project-title.ts
 *
 * 「什么算一个具体项目名」的唯一真源。
 *
 * 这条规则被三处共用，此前各自抄了一份、且已经漂移：
 *   - 归类器解析模型输出（classification-prompts.ts）
 *   - 学生手动建项目（data/student-projects.ts）
 *   - 附件会话回执（app/api/attachments/route.ts，抄的副本漏了拒绝语检测）
 * 副本的代价不是重复本身，是漂移之后没人知道哪份才是对的。
 *
 * 纯函数、无 'server-only'、无网络，可直接单元测试（沿用仓库既有的纯逻辑/副作用分层约定）。
 */

/** 系统占位名：它们看起来像标题，但只代表「还没定」，绝不能被建成项目。 */
const nonConcreteProjectTitles = new Set([
  '自动识别中的篇目', '未定篇目', '待自动归属', '待归属篇目',
  '未知篇目', '未识别篇目', '默认篇目', '示例篇目', '篇目标题',
  '篇目项目', '日常会话归档', '附件会话',
]);

/**
 * 拒绝语识别。模型经常不守「无法归属时只输出 NULL」的协议，改说自然语言
 * （"无法归属""无具体篇目"…）。这些必须判为无法归属，否则会被当作真实标题
 * 建成垃圾项目——这是归类链路里最隐蔽的一类脏数据。
 */
const rejectionPattern = /^(?:null|无|没有|无法|不能|不确定|未知|无关|与.{0,12}无关|无(?:法)?(?:归属|判断|确定|识别|匹配|具体\d*篇目)|不(?:属于|是|在).{0,12}篇目)$/iu;

/**
 * 归一化一个候选项目标题：去书名号与空白、拒绝占位名与表达「无法归属」的拒绝语。
 * 超长（>80）也判非法——它几乎必然是模型把整段话当标题吐了出来。
 */
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
 * 首行是否可信为一行标题：小模型不守协议时会把整段回答当首行输出，
 * 散文特征（句读）或超长都不可信，必须拒绝，否则会把整句话建成垃圾项目。
 */
export function looksLikeTitleLine(value: string): boolean {
  return value.length <= 40 && !/[。！？；，、…]/.test(value);
}
