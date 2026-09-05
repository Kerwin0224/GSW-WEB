import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

/**
 * 产品硬约束（CONTEXT.md）：
 *   “教师修订回答只影响学生侧显示的回答正文，以及会话级最终提交时生成的
 *     SFT/DPO 内容；不影响布鲁姆认知路径，也不要求改变挑战生成提示词。”
 *
 * 即：教师写入 public.conversation_messages 的 UPDATE 只能动 content / parts
 * 两列，绝不能顺手写 bloom_state / bloom_level / model_id / role 等等。
 *
 * `conversation_messages` 的 RLS 在列级别没有强约束（参见
 * 20260510120200_tighten_messages_update_policy.sql 上下文的评估），所以
 * 必须靠这条应用层不变量守护 —— 任何后续的 server action 新加 .update(...)
 * 引入非白名单列都会触发这条失败。
 *
 * 我们不用 mock 调用真实 server action，只做 AST 级别的文本不变量检查。
 */

const allowedColumns = new Set(['content', 'parts']);

const teacherActionsPath = resolve(new URL('..', import.meta.url).pathname, 'data/teacher-actions.ts');
const source = readFileSync(teacherActionsPath, 'utf8');

/**
 * 提取所有形如
 *   supabase.from('conversation_messages').update({ a, b: ... }) ...
 * 或者链式
 *   from('conversation_messages')
 *     .update({
 *       content: ...,
 *       parts: ...,
 *     })
 * 的调用点，返回每个点的 update 对象 literal 的字段名集合。
 */
function extractConversationMessagesUpdateCalls(src: string): string[][] {
  const results: string[][] = [];
  const marker = "from('conversation_messages')";
  let cursor = 0;
  while (true) {
    const hit = src.indexOf(marker, cursor);
    if (hit === -1) break;
    cursor = hit + marker.length;

    // 从这个 marker 往后找同一链里的 .update( — 只在进入下一个独立语句前查找
    const updateIdx = src.indexOf('.update(', cursor);
    if (updateIdx === -1) continue;
    // 排除 .update({...}) 在另一个语句里的情形：.from 和 .update 之间不应出现分号
    const between = src.slice(cursor, updateIdx);
    if (between.includes(';\n')) continue;

    // 定位 update( 的匹配 ) 与内部对象 literal
    const openParen = updateIdx + '.update('.length;
    const openBrace = src.indexOf('{', openParen);
    if (openBrace === -1) continue;
    // 简单花括号平衡解析
    let depth = 0;
    let end = -1;
    for (let i = openBrace; i < src.length; i += 1) {
      const ch = src[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue;

    const literal = src.slice(openBrace + 1, end);
    const keys = Array.from(literal.matchAll(/(?:^|[,\s])([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g))
      .map((match) => match[1]);
    results.push(keys);
  }
  return results;
}

test('teacher-actions only updates content/parts on conversation_messages', () => {
  const calls = extractConversationMessagesUpdateCalls(source);
  assert.ok(calls.length >= 2, `expected at least 2 conversation_messages.update() call sites (reviseLearningRecord + finalizeLearningConversation), found ${calls.length}`);

  for (const keys of calls) {
    // 允许空对象（不太可能出现）或仅白名单字段
    for (const key of keys) {
      assert.ok(
        allowedColumns.has(key),
        `teacher-actions.ts tried to update conversation_messages column "${key}". 产品边界：教师路径只能改 content / parts。若新增合法写列请先更新 CONTEXT.md 与本测试用例。`,
      );
    }
    // 至少命中一次修订双写（content + parts 同写，才能保证学生侧 UI 与 DB 一致）
    assert.ok(keys.includes('content'), `a conversation_messages.update() in teacher-actions is missing "content": keys=${keys.join(', ')}`);
    assert.ok(keys.includes('parts'), `a conversation_messages.update() in teacher-actions is missing "parts": keys=${keys.join(', ')}`);
  }
});
