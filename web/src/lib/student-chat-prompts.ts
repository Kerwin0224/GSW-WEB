/**
 * student-chat-prompts.ts
 *
 * 学生会话回答的 system prompt 构建。纯函数，不依赖数据库、AI SDK 或网络请求，
 * 可直接单元测试。
 *
 * 归类与布鲁姆判定的纯函数层在 classification-prompts.ts；
 * 项目标题合法性规则在 project-title.ts。
 *
 * 定位：不假设学科。这个工作台服务各学科各年级，学生提问聚焦什么就讲什么，
 * 教学骨架（先解决问题、再引导理解、每轮最多一个追问）与学科无关。
 */

/**
 * 租户预设通道：与 teacher-chat-prompts 的 `ctx.presetInstruction?.trim() ||` 同形，
 * 但**追加**而不替换。学生这段提示词里带着容器归属与「不要替教师宣布结果」的不变量，
 * 让租户预设整段顶掉它，等于把不变量交给租户开关；挑战出题与评阅同理。
 * 预设缺省或空白时，提示词与从前逐字一致。
 */
function tenantInstructionBlock(presetInstruction: string | null | undefined): string {
  const instruction = presetInstruction?.trim();
  if (!instruction) return '';
  return `【本学校/本空间的教学要求】\n${instruction}\n\n`;
}

export type StudentSystemPromptContext =
  /** 会话已归入具体项目 */
  | { kind: 'project'; projectTitle: string; attachmentPrompt?: string; presetInstruction?: string | null }
  /** 全局空白入口，项目归属正在后台识别 */
  | { kind: 'classifying'; attachmentPrompt?: string; presetInstruction?: string | null }
  /** 日常会话归档：无归属，无识别 */
  | { kind: 'archive'; attachmentPrompt?: string; presetInstruction?: string | null };

/**
 * 构建学生会话的 AI 系统提示词。
 *
 * 纯函数，不依赖数据库或 AI 调用，可直接单元测试。
 * 三种状态对应 CONTEXT.md 里定义的三种会话容器：
 *   - project：已归属项目
 *   - classifying：全局空白入口首问，归属识别进行中
 *   - archive：日常会话归档
 */
export function buildStudentSystemPrompt(ctx: StudentSystemPromptContext): string {
  const tenant = tenantInstructionBlock(ctx.presetInstruction);
  const attachment = ctx.attachmentPrompt ?? '';
  // 三种容器共用的教学骨架与禁止项：措辞保持一份，容器差异只体现在归属说明上。
  const teachingStance =
    '回答时先直接解决学生问题，再结合必要的依据（原文、定义、条件、步骤等）引导理解，不要只给结论。'
    + '保持启发式，不替学生完成全部思考；每轮最多提出 1 个自然追问。';

  switch (ctx.kind) {
    case 'project':
      return (
        tenant +
        `你是文韵智途的 AI 教学助手。当前会话已归入《${ctx.projectTitle}》项目；` +
        '归属只表示会话沉淀容器，不限制你在回答中比较或引用其他被学生提到的内容，也不要建议迁移或改派会话。' +
        teachingStance +
        '不要把会话说成挑战，不要声称已完成教师核实，不要承诺布鲁姆认知水平已被确认，不要提及 SFT/DPO 或后台数据流程。' +
        attachment
      );

    case 'classifying':
      return (
        tenant +
        '你是文韵智途的 AI 教学助手。当前会话来自全局空白入口，项目归属正在后台识别；' +
        '你的回答不等待归属结果，也不要自称已经归入某个项目。' +
        teachingStance +
        '若问题涉及多个主题，可以围绕学生的核心问题做必要比较。' +
        '不要声称会话已完成归属、教师核实或布鲁姆认知水平确认，不要提及 SFT/DPO 或后台数据流程。' +
        attachment
      );

    case 'archive':
      return (
        tenant +
        '你是文韵智途的 AI 教学助手。当前会话暂存于日常会话归档；' +
        '该会话不会迁入项目，也不会生成布鲁姆认知路径或挑战依据。' +
        '若学生提到具体学习主题，只在本会话内基于该主题帮助学习，不要承诺本会话会补归属或迁移；' +
        '学生若要进入项目，需要离开当前归档会话后从项目或全局空白入口新开会话。' +
        teachingStance +
        '不要声称已完成教师核实，不要提及 SFT/DPO 或后台数据流程。' +
        attachment
      );
  }
}
