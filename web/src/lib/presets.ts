/**
 * Prompt 预设的用途词表。
 *
 * 放在纯模块而不是 'use server' 的 actions 文件里：'use server' 只能导出 async 函数，
 * 而这份词表要被页面、客户端表单和 server action 三边共用。
 *
 * 用途决定这段文字被拼到哪一段提示词的**前面**：
 * 学生会话、挑战出题、挑战评阅、AI 预审此前 100% 硬编码在代码里，租户改不了；
 * 加上它们之后，租户写的是内容，平台协议（层级判定、不可信内容沙盒、输出格式）仍然由系统强制拼接。
 */

export const PRESET_PURPOSES = [
  { value: 'chat', label: '备课问答' },
  { value: 'project_classification', label: '项目归类规则' },
  { value: 'student_chat', label: '学生会话' },
  { value: 'challenge_generation', label: '挑战出题' },
  { value: 'challenge_evaluation', label: '挑战评阅' },
  { value: 'pre_review', label: 'AI 预审' },
] as const;

export type PresetPurpose = (typeof PRESET_PURPOSES)[number]['value'];

const PURPOSE_VALUES: readonly string[] = PRESET_PURPOSES.map((purpose) => purpose.value);

export function isPresetPurpose(value: string): value is PresetPurpose {
  return PURPOSE_VALUES.includes(value);
}

export function presetPurposeLabel(purpose: string): string {
  return PRESET_PURPOSES.find((item) => item.value === purpose)?.label ?? purpose;
}
