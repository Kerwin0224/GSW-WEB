import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

/**
 * 产品硬约束（CONTEXT.md）：
 *   "教师 **学习记录核实** 不显示'学生已删除但仍待核实'的记录，
 *    避免教师处理学生已移除的学习过程。"
 *
 *   "后续 **挑战** 应基于 **项目** 维度，结合学生在该项目下过往
 *    **会话** 中提出的问题设计攀升路径；挑战生成不等待教师核实，
 *    但必须排除 **日常会话归档** 与已删除会话。"
 *
 * 所以 web/src 下对 public.conversations 的任何 SELECT、
 * 或对 conversation_messages 的 conversations!inner(...) 内联 join，
 * 都必须带上 deleted_at = null 过滤，否则会把学生软删的会话带回来。
 *
 * 白名单（合规例外，需在下面 whitelistSuffixes 登记）：
 *   - lib/dataset-export.ts：管理员导出按 CONTEXT.md "已形成导出样本的后台数据仍保留"
 *     保留历史，与会话删除状态解耦。
 *   - app/api/admin/datasets/export/route.ts：同上，同属管理员导出路径。
 *   - app/api/student/conversations/route.ts 与 app/api/teacher/conversations/route.ts：
 *     删除路径自身需要读取 deleted_at 字段以判断状态，select('id,deleted_at') 是正确语义。
 *   - __tests__/ 下自身。
 *
 * 测试只做正则级 AST 近似扫描，不 mock Supabase：任何链式调用里出现
 *   .from('conversations')                 而 20 行内没有 .is('deleted_at', null)
 *   .from('conversation_messages')         带有 conversations!inner(...)
 *                                          但同一 select 调用链内
 *                                          没有 .is('conversations.deleted_at', null)
 * 都会 fail。
 */

const srcRoot = resolve(new URL('../..', import.meta.url).pathname);
const whitelistSuffixes = [
  'lib/dataset-export.ts',
  'app/api/admin/datasets/export/route.ts',
  'app/api/student/conversations/route.ts',
  'app/api/teacher/conversations/route.ts',
  'lib/__tests__/conversations-deleted-at-guard.test.ts',
];

function listTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...listTsFiles(full));
    } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

function isWhitelisted(filePath: string): boolean {
  const rel = relative(srcRoot, filePath).replaceAll('\\', '/');
  return whitelistSuffixes.some((suffix) => rel === suffix || rel.endsWith(`/${suffix}`));
}

type ChainReport = { file: string; lineNumber: number; excerpt: string };

/**
 * 粗暴但足够的链式调用切片器：从每个命中点向前向后各取若干行，
 * 视作该查询链的上下文。Supabase 查询基本都在 20 行以内。
 */
function contextAround(source: string, index: number): { text: string; lineNumber: number } {
  const lines = source.split('\n');
  let offset = 0;
  let hitLine = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (offset + lines[i].length >= index) {
      hitLine = i;
      break;
    }
    offset += lines[i].length + 1;
  }
  const start = Math.max(0, hitLine - 3);
  const end = Math.min(lines.length, hitLine + 20);
  return { text: lines.slice(start, end).join('\n'), lineNumber: hitLine + 1 };
}

function findDirectConversationsQueriesMissingGuard(file: string, source: string): ChainReport[] {
  const reports: ChainReport[] = [];
  const directFromRegex = /\.from\(['"]conversations['"]\)/g;
  let match: RegExpExecArray | null;
  while ((match = directFromRegex.exec(source)) !== null) {
    const { text, lineNumber } = contextAround(source, match.index);
    const hasGuard = /\.is\(['"]deleted_at['"],\s*null\)/.test(text);
    if (!hasGuard) {
      reports.push({ file, lineNumber, excerpt: text });
    }
  }
  return reports;
}

function findInlineJoinsMissingGuard(file: string, source: string): ChainReport[] {
  const reports: ChainReport[] = [];
  const innerJoinRegex = /conversations!inner\(/g;
  let match: RegExpExecArray | null;
  while ((match = innerJoinRegex.exec(source)) !== null) {
    const { text, lineNumber } = contextAround(source, match.index);
    const hasInnerGuard = /\.is\(['"]conversations\.deleted_at['"],\s*null\)/.test(text);
    if (!hasInnerGuard) {
      reports.push({ file, lineNumber, excerpt: text });
    }
  }
  return reports;
}

test('all src code that queries public.conversations filters by deleted_at null', () => {
  const files = listTsFiles(srcRoot).filter((file) => !isWhitelisted(file));
  const violations: ChainReport[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    violations.push(...findDirectConversationsQueriesMissingGuard(file, source));
    violations.push(...findInlineJoinsMissingGuard(file, source));
  }

  if (violations.length > 0) {
    const report = violations
      .map((v) => `- ${relative(srcRoot, v.file)}:${v.lineNumber}\n${v.excerpt.split('\n').map((line) => `    ${line}`).join('\n')}`)
      .join('\n\n');
    assert.fail(`Found ${violations.length} SELECT against conversations without deleted_at guard:\n\n${report}\n\n产品硬约束：学生软删的会话不能出现在学生/教师业务查询里；若是合规例外，请把文件加到 whitelistSuffixes 并在 CONTEXT.md 登记理由。`);
  }
});
