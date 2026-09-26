import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

/**
 * 文案定位守卫：产品是面向多租户学校的通用 SaaS，任何界面文案都不能把它
 * 窄化成某一门学科的工具，也不能把「教师核实」说成「审核 / 审计」——
 * 后者会让教师误解为后台审核（CONTEXT.md：学习记录核实的 _Avoid_ 清单）。
 *
 * 一次把登录页 H1 写成「古文学习工作台」，就是这条规则要拦的事。
 */

/**
 * 具体学科词。只允许出现在「学科字段本身」和「教师自己写的归类口径」里。
 * 不收「物理 / 历史 / 地理」：它们在产品文案里首先是"物理删除""导出历史"
 * "地理位置"，按学科词判会满屏误报；这三门课的窄化风险由人工审查兜。
 */
const SUBJECT_WORDS = ['古文', '古诗', '诗文', '文言', '语文', '诗句', '汉字', '默写', '诗词', '数学', '英语', '化学', '生物'];

/** 禁用术语：面向教师的语言是「学习记录核实」「AI 预审」。 */
const BANNED_TERMS = ['审核', '审计', '批改', '打标'];

/** 无数据来源的承诺与伪状态。 */
const BANNED_PROMISES = ['掌握率', '就绪即健康', '实时状态', '精准提升', '智能诊断'];

/**
 * 逐条豁免，每条都要写清理由——豁免本身就是决定，得让人能审。
 * 提示词里禁止模型使用「批改 / 打标」是正确的用法，界面里出现才是错。
 */
const ALLOWED: { file: string; hit: string; reason: string }[] = [
  { file: 'lib/data/teacher-actions.ts', hit: '批改', reason: 'AI 预审提示词里明确禁止模型替教师批改' },
  { file: 'lib/data/teacher-actions.ts', hit: '打标', reason: '同上：禁止模型替教师打标' },
  { file: 'components/workbench/user-import-dialog.tsx', hit: '数学', reason: 'CSV 模板示例里 subject 列的取值，示范格式而不是定位' },
];

const srcDir = resolve(new URL('.', import.meta.url).pathname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx|css)$/.test(entry) ? [full] : [];
  });
}

/**
 * 去掉注释再判定：注释里解释「为什么必须学科中立」是允许的，
 * 例如 bloom-levels.ts 记录着「数学班的 L1 不该被告知去背诵诗句」。
 * `//` 只在没有前置冒号时才算注释，免得把 https:// 截断。
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 学科词只在这两种语境里合法：字段本身叫 subject，或教师写的归类口径。 */
function isSubjectFieldLine(line: string, file: string): boolean {
  if (line.includes('subject')) return true;
  return file.endsWith('space-panel.tsx') && line.includes('归类');
}

function isAllowed(rel: string, hit: string): boolean {
  return ALLOWED.some((entry) => entry.file === rel && entry.hit === hit);
}

const files = sourceFiles(srcDir);
const offenders: { file: string; line: number; text: string; hit: string }[] = [];

for (const file of files) {
  const rel = relative(srcDir, file);
  stripComments(readFileSync(file, 'utf8'))
    .split('\n')
    .forEach((line, index) => {
      for (const hit of [...SUBJECT_WORDS, ...BANNED_TERMS, ...BANNED_PROMISES]) {
        if (!line.includes(hit)) continue;
        if (SUBJECT_WORDS.includes(hit) && isSubjectFieldLine(line, rel)) continue;
        if (isAllowed(rel, hit)) continue;
        offenders.push({ file: rel, line: index + 1, text: line.trim().slice(0, 80), hit });
      }
    });
}

test('界面文案不得把产品窄化成单科工具，也不得用审核/审计指代教师核实', () => {
  assert.deepEqual(offenders, [], `以下文案违反定位口径，请改成通用表述或领域术语：\n${offenders.map((o) => `  ${o.file}:${o.line} 「${o.hit}」 ${o.text}`).join('\n')}`);
});

test('守卫本身有效：能扫到源码且规则集非空', () => {
  assert.ok(files.length > 50, `应扫到全量源码，实际 ${files.length} 个文件`);
  assert.ok(SUBJECT_WORDS.length > 0 && BANNED_TERMS.length > 0);
});
