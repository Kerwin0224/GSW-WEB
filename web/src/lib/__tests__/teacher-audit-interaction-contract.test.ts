import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { AUDIT_QUEUE_VIEWS, auditQueueView, buildAuditHref } from '../../components/workbench/audit/presentation.ts';

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

test('最终提交的失败原因必须渲染在确认弹窗内部', () => {
  const source = readFileSync(resolve(workbenchRoot, 'audit-actions.tsx'), 'utf8');

  const dialog = source.slice(source.indexOf('<Dialog open={confirmOpen}'), source.indexOf('</Dialog>'));

  assert.ok(dialog, '应能找到确认弹窗');
  // 失败时弹窗保持打开，而 FormStatus 此前渲染在弹窗「外面」——
  // 教师看到的是一个被遮住的提示，等于失败没有在操作现场可见。
  assert.match(dialog, /<FormStatus state=\{state\} \/>/, '状态提示必须在弹窗内');
  assert.match(dialog, /action=\{action\}/, '表单必须在弹窗内，失败才能就地反馈');
  assert.match(dialog, /disabled=\{pending/, '提交中必须禁用确认按钮');
  // 成功才关；失败留在原地。
  assert.match(source, /if \(state\.ok && state\.message\) setConfirmOpen\(false\)/, '只有成功才关闭弹窗');
});

test('核实队列是真实的两态视图，当前态高亮且链接带上该态', () => {
  const nav = readFileSync(resolve(workbenchRoot, 'audit-queue-nav.tsx'), 'utf8');

  // 旧实现是一条藏在列表底部的文字链接，且指向的 all 查询并不只列已提交会话。
  assert.doesNotMatch(nav, /查看已提交的记录|只看待核实/, '不应再有底部文字链接式的伪切换');
  assert.match(nav, /aria-current=\{active \? 'page' : undefined\}/, '当前视图必须可读地高亮');
  assert.match(nav, /buildAuditHref\(\{ status: item\.value \}\)/, '切换链接必须带目标视图');
  // 只钉「链接必须带上当前视图」，不钉参数字面量：筛选参数现在也一起透传，
  // 把视图和字面量绑一起会在加筛选时误报，而视图透传这个不变量并没坏。
  assert.match(nav, /buildAuditHref\(\{[^}]*status: view, page: target[^}]*\}\)/, '分页必须保持当前视图与筛选');
  // 会话深链同理，否则从已提交视图点开会话再翻页会跳回待核实。
  assert.match(nav, /buildAuditHref\(\{[^}]*status: view, page: queue\.page, session: session\.conversationId[^}]*\}\)/, '会话深链必须带上当前视图与筛选');
  assert.doesNotMatch(nav, /queue\.status ===/, '视图一律取自 URL 解析值，不再直接用服务端 status');
});

test('窄屏下核实页是「队列 ↔ 详情」二选一，且有明确的返回队列出口', () => {
  const workspace = readFileSync(resolve(workbenchRoot, 'audit-workspace.tsx'), 'utf8');
  const shell = readFileSync(resolve(new URL('..', import.meta.url).pathname, '../components/workbench/chat-workspace.tsx'), 'utf8');

  assert.match(workspace, /mobileSelectionActive=\{Boolean\(session\)\}/, '选中会话时窄屏应进入详情态');
  assert.match(workspace, /backToQueueLabel=/, '详情态必须提供返回队列的文案');
  assert.match(shell, /detailOnly && 'hidden lg:block'/, '详情态窄屏必须隐藏队列');
  assert.match(shell, /detailOnly \? 'flex' : 'hidden lg:flex'/, '未选中时窄屏只显示队列');
  assert.match(shell, /sticky bottom-0/, '窄屏动作条必须 sticky，否则长会话里够不着提交按钮');
});

test('两栏二选一必须 opt-in：没传 mobileSelectionActive 的调用方保持原样', () => {
  const shell = readFileSync(resolve(new URL('..', import.meta.url).pathname, '../components/workbench/chat-workspace.tsx'), 'utf8');

  // 学生端不传这个 prop。若把它默认成 false，窄屏下 detailOnly 恒为假，
  // section 会套上 `hidden lg:flex` —— 学生的聊天主区在手机上直接消失。
  assert.match(shell, /const paneMode = mobileSelectionActive !== undefined;/, '未传该 prop 时必须走非 pane 分支');
  assert.match(shell, /paneMode \? \(detailOnly \? 'flex' : 'hidden lg:flex'\) : 'flex'/, '非 pane 模式必须保持 flex（纵向堆叠）');
  assert.doesNotMatch(shell, /mobileSelectionActive = false/, '不能用 false 作为默认值来表达「未启用」');
});

test('视图与 URL 互为闭环：认得出的值原样带回去，认不出的回落到待核实', () => {
  // 旧实现在 status==='all' 时才写进 URL，于是「已提交」视图的分页会把它洗回 all，
  // 而 all 在服务端根本不过滤——标签与结果长期对不上。
  for (const { value } of AUDIT_QUEUE_VIEWS) {
    const href = buildAuditHref({ status: value, page: 3, session: 'conv-1' });
    const params = new URL(href, 'http://x').searchParams;
    assert.equal(auditQueueView(params.get('status') ?? undefined), value, `${value} 应能原样往返`);
    assert.equal(params.get('page'), '3');
    assert.equal(params.get('session'), 'conv-1');
  }

  // 待核实是默认视图，链接里不该出现 status，免得把默认写成显式。
  assert.equal(buildAuditHref({ status: 'pending' }), '/teacher/audit');
  assert.equal(buildAuditHref({ status: 'finalized' }), '/teacher/audit?status=finalized');

  // 旧链接与手输的垃圾值都必须落到待核实，绝不能静默变成「全部」。
  assert.equal(auditQueueView('all'), 'pending', '旧 all 链接应回落到待核实');
  assert.equal(auditQueueView(undefined), 'pending');
  assert.equal(auditQueueView(''), 'pending');
  assert.equal(auditQueueView("pending'; drop table"), 'pending');
});
