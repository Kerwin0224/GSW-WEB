/**
 * teacher-chat-prompts.ts
 *
 * 教师问答的 AI 系统提示词构建。
 *
 * 纯函数，不依赖数据库或 HTTP 请求，可直接单元测试。
 * 教师问答只服务备课、讲解设计、课堂追问、学生误区处理和临时教学判断
 * （CONTEXT.md "教师问答"定义）——这个约束体现在默认角色描述里。
 */

export type TeacherSystemPromptContext = {
  /**
   * Prompt 预设的系统指令。
   * - 存在时，完全覆盖默认角色描述（教师自定义了具体用途）。
   * - 不存在时，使用默认的教师问答角色描述。
   */
  presetInstruction?: string | null;
  /**
   * 附件检索片段的上下文提示（已含沙盒标签和安全提示词）。
   * - 有附件时，拼接在系统提示词末尾。
   * - 无附件时，传入空字符串或省略。
   */
  attachmentPrompt?: string;
};

/**
 * 构建教师问答的 AI 系统提示词。
 *
 * 纯函数，不依赖数据库或 AI 调用。
 *
 * 行为：
 *   - 有 Prompt 预设时，presetInstruction 作为系统指令主体
 *   - 无预设时，使用默认教师问答角色描述
 *   - 附件上下文始终追加到末尾（已由调用方格式化）
 */
export function buildTeacherSystemPrompt(ctx: TeacherSystemPromptContext): string {
  const base =
    ctx.presetInstruction?.trim() ||
    '你是文韵智途的教师问答助手，面向备课、讲解设计、课堂追问、学生误区处理和临时教学判断提供帮助。';
  const attachment = ctx.attachmentPrompt ?? '';
  return `${base}${attachment}`;
}
