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

export function normalizeConcreteProjectTitle(value?: string | null): string | null {
  const title = value?.trim().replace(/^《(.+)》$/, '$1').trim();
  if (!title || title.length > 80) return null;
  if (nonConcreteProjectTitles.has(title)) return null;
  return title;
}

export function normalizeProjectAuthor(value?: string | null): string | null {
  const author = value?.trim();
  return author ? author : null;
}

// 书名号是"学生明确提到篇目"的确定性信号，不需要模型裁决：
// 命中即零延迟归档（首问当轮就进项目），模型分类只兜底没有书名号的泛问。
const explicitBookTitlePattern = /《([^《》\n]{1,40})》/;

export function extractExplicitProjectTitle(question: string): string | null {
  return normalizeConcreteProjectTitle(explicitBookTitlePattern.exec(question)?.[1] ?? null);
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
