import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

// 核实面板没有组件测试设施（仓库只有 node:test + 纯函数/源码契约两种），
// 所以这里用「读源码做不变量断言」守住两条真正会静默坏掉的交互契约。
const workbenchRoot = resolve(new URL('..', import.meta.url).pathname, '../components/workbench/audit');
const auditPagePath = resolve(new URL('..', import.meta.url).pathname, '../app/teacher/audit/page.tsx');

test('remounts the finalize form when the selected conversation changes', () => {
  const source = readFileSync(resolve(workbenchRoot, 'audit-session-view.tsx'), 'utf8');

  const invocation = source.match(/<FinalizeAction[^>]+>/)?.[0] ?? '';

  assert.match(invocation, /key=\{session\.conversationId\}/);
});

test('核实页从 URL 读选中会话，而不是客户端 state', () => {
  const source = readFileSync(auditPagePath, 'utf8');

  // 深链是既定契约：教师看板的「需优先核实」卡片与 e2e 脚本都靠 ?session= 直接落到具体会话。
  // 丢掉这个参数，点击就退回「落在未选中的列表页」，而页面不会报任何错。
  assert.match(source, /params\?\.session/, '应读取 session searchParam');
  assert.match(source, /getTeacherAuditSession/, '应按会话 id 单独取详情');
});

test('队列列表不取消息正文', () => {
  const source = readFileSync(resolve(new URL('..', import.meta.url).pathname, '../lib/data/teacher.ts'), 'utf8');

  const queueBody = source.split('export async function getTeacherAuditQueue')[1]?.split('export async function getTeacherAuditSession')[0] ?? '';
  assert.ok(queueBody, '应能定位队列函数体');
  // 列表只需要「这条会话有几条 AI 回答」；一旦这里出现 content，
  // 说明列表又长成了详情查询，整页会话的正文会被塞进 RSC payload。
  assert.doesNotMatch(queueBody, /select\('[^']*\bcontent\b/, '队列列表不应查询消息正文');
});
