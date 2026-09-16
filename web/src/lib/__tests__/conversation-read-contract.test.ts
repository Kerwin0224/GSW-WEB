import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * 「谁能读一个会话」这条规则只写在 SQL 里，没有应用层兜底 ——
 * 一旦它在某张表的策略里漂移，不会有类型错误、不会有别的测试失败、界面上一切正常，
 * 只是某一类人多看到了不该看的东西。
 *
 * 这条洞已经真实发生过一次：20260912130000 把 conversations 的读策略按校收敛了，
 * 但 conversation_messages 的读策略没被同批重写，带着旧的全局 is_admin() 留了下来，
 * 于是任一公司的 org_admin 能读到全平台所有公司的会话消息。
 *
 * 修法不是「再抄一份带谓词的」，而是把规则收成 can_read_conversation() 一个函数、
 * 两张表的读策略都指向它。下面第二条断言钉的就是这个不变式：
 * **父表与子表必须读同一份定义**，不一致本身就是要拦住的状态。
 */

import { allMigrationsText, newestFunctionBody, newestPolicy } from './migration-source.ts';

/** 从策略体里取出它调用的判定函数名（本仓的谓词一律走 public.xxx(...) helper）。 */
function predicateCalls(policySql: string): string[] {
  return [...policySql.matchAll(/public\.(can_read_\w+|is_\w+|teacher_can_access_class|can_admin\w*)\s*\(/g)].map((match) => match[1]);
}

test('会话读规则是唯一真源，且三路授权齐全', () => {
  const sql = newestFunctionBody('can_read_conversation');

  assert.match(sql, /security definer/, '必须 definer：它要在 conversations 自己的策略里被调用，invoker 会与策略闭合成环');
  assert.match(sql, /c\.owner_id = public\.current_app_user_id\(\)/, '学生必须能读自己的会话');
  assert.match(sql, /public\.can_admin_class\(c\.class_id\)/, '管理员的读权限必须按班收敛（内含学校边界）');
  assert.match(sql, /public\.teacher_can_access_class\(c\.class_id\)/, '任课教师必须能读，否则核实链断掉');
  assert.doesNotMatch(sql, /\bis_admin\b/, '裸 is_admin() 是全域放行，会话读一旦用它就是跨租户洞');
});

test('父表与子表的读策略指向同一个函数（这条不一致过一次）', () => {
  const messages = newestPolicy('messages_conversation_scope');
  const conversations = newestPolicy('conversations_read');

  assert.match(messages, /public\.can_read_conversation\(conversation_id\)/);
  assert.match(conversations, /public\.can_read_conversation\(id\)/);
  assert.deepEqual(
    predicateCalls(messages),
    predicateCalls(conversations),
    '两张表必须读同一份定义；各自内联一份就是下次漂移的起点',
  );

  // 回归围栏：这条策略的历史形态里有裸 is_admin()。
  assert.doesNotMatch(messages, /\bis_admin\b/, 'org_admin 曾因此能读全平台会话消息');
  assert.doesNotMatch(conversations, /\bis_admin\b/);
});

test('会话相关策略全部不再使用裸 is_admin()', () => {
  // 父子两张表 + 成员表：多租户重写覆盖过的那些策略，一个都不许回退。
  for (const policy of ['conversations_owner_all', 'memberships_member_select', 'messages_owner_insert', 'messages_teacher_update']) {
    assert.doesNotMatch(newestPolicy(policy), /\bis_admin\b/, `${policy} 不应再出现裸 is_admin()`);
  }
});

test('旧策略名不残留（并存等于没收窄）', () => {
  assert.match(allMigrationsText(), /drop policy if exists "conversations_teacher_read"/, '教师读策略已被 can_read_conversation 取代，必须 drop 掉旧名');
});

test('判定函数对 anon 可执行（运行角色就是 anon）', () => {
  assert.match(
    allMigrationsText(),
    /grant execute on function public\.can_read_conversation\(uuid\) to anon/,
    '策略以调用者身份求值：少了 anon 的 EXECUTE，整张表 42501',
  );
});

test('检索 RPC 不再抄一份管理员规则', () => {
  const sql = newestFunctionBody('match_document_chunks');
  assert.match(sql, /public\.can_admin_profile\(dc\.owner_id\)/, '应与 document_chunks 的策略同一口径');
  assert.doesNotMatch(sql, /\bis_admin\b/);
});
