import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeToolPart } from '../tool-call-view.ts';

// MCP 工具的名字是运行时才知道的（后台配什么 Server 就有什么工具），
// 所以「这是什么动作」只能按名字猜。这里守住猜测的边界：认得出来的说清楚，认不出来不瞎猜。

test('联网搜索类工具按名字识别，并给出查询词', () => {
  const view = describeToolPart({
    type: 'dynamic-tool',
    toolName: 'web_search',
    toolCallId: 'c1',
    state: 'input-available',
    input: { query: '赤壁赋 创作背景' },
  });

  assert.equal(view?.actionLabel, '正在联网搜索');
  assert.equal(view?.detail, '赤壁赋 创作背景');
  assert.equal(view?.state, 'running');
});

test('中文与常见第三方搜索工具名都归到联网搜索', () => {
  for (const name of ['联网搜索', 'tavily_search', 'brave_web_search', 'google_search', 'exa_search']) {
    assert.equal(describeToolPart({ type: 'dynamic-tool', toolName: name, state: 'input-available' })?.actionLabel, '正在联网搜索', name);
  }
});

test('读取网页与通用工具各自成类，不误判成搜索', () => {
  assert.equal(describeToolPart({ type: 'dynamic-tool', toolName: 'fetch_url', state: 'input-available' })?.actionLabel, '正在读取网页');
  assert.equal(describeToolPart({ type: 'dynamic-tool', toolName: 'some_internal_tool', state: 'input-available' })?.actionLabel, '正在调用工具');
});

test('状态决定措辞：进行中 / 已完成 / 失败', () => {
  const base = { type: 'dynamic-tool', toolName: 'web_search' } as const;
  assert.equal(describeToolPart({ ...base, state: 'input-streaming' })?.state, 'running');
  assert.equal(describeToolPart({ ...base, state: 'output-available' })?.actionLabel, '已联网搜索');
  assert.equal(describeToolPart({ ...base, state: 'output-error', errorText: '连接超时' })?.actionLabel, '联网搜索失败');
  assert.equal(describeToolPart({ ...base, state: 'output-error', errorText: '连接超时' })?.errorText, '连接超时');
});

test('静态工具从 type 里取名字', () => {
  const view = describeToolPart({ type: 'tool-web_search', toolCallId: 'c2', state: 'output-available' });

  assert.equal(view?.toolName, 'web_search');
  assert.equal(view?.actionLabel, '已联网搜索');
});

test('取不到常见字段时把入参压成一行，而不是空着', () => {
  const view = describeToolPart({ type: 'dynamic-tool', toolName: 'web_search', state: 'input-available', input: { weird_key: 'v' } });

  assert.equal(view?.detail, '{"weird_key":"v"}');
});

test('超长查询词与换行被压平截断', () => {
  const view = describeToolPart({ type: 'dynamic-tool', toolName: 'web_search', state: 'input-available', input: { query: `第一行\n第二行${'甲'.repeat(200)}` } });

  assert.ok(view?.detail && view.detail.length <= 121, '应截断到 120 字 + 省略号');
  assert.ok(!view?.detail?.includes('\n'), '应压成一行');
});

test('非工具 part 返回 null，调用方据此跳过', () => {
  assert.equal(describeToolPart({ type: 'text', text: 'x' }), null);
  assert.equal(describeToolPart({ type: 'data-student-bloom', data: {} }), null);
  assert.equal(describeToolPart(null), null);
  assert.equal(describeToolPart({ type: 'dynamic-tool' }), null);
});
