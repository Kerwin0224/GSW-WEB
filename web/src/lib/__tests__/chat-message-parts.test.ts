import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canonicalizeUiMessageParts, toPersistedAssistantParts } from '../chat-message-parts.ts';

test('uses message content as the canonical rendered text when stored parts are stale', () => {
  const parts = canonicalizeUiMessageParts('教师修订后的正确回答。', [
    { type: 'text', text: '旧的错误回答。' },
    { type: 'data-teacher-revision', data: { revised: true } },
  ]);

  assert.deepEqual(parts, [
    { type: 'text', text: '教师修订后的正确回答。' },
    { type: 'data-teacher-revision', data: { revised: true } },
  ]);
});

test('creates a text part from content when no parts are stored', () => {
  assert.deepEqual(canonicalizeUiMessageParts('学生原始提问。', null), [
    { type: 'text', text: '学生原始提问。' },
  ]);
});

test('collapses old text chunks while preserving non-text status parts', () => {
  const parts = canonicalizeUiMessageParts('最终审核文本。', [
    { type: 'text', text: '旧文本 A' },
    { type: 'tool-call', toolCallId: 'call-1' },
    { type: 'text', text: '旧文本 B' },
  ]);

  assert.deepEqual(parts, [
    { type: 'text', text: '最终审核文本。' },
    { type: 'tool-call', toolCallId: 'call-1' },
  ]);
});

// ─── 落库裁剪：只存渲染得到的东西 ────────────────────────────────────────────
//
// 落库的 parts 决定刷新后学生还能看到什么、教师核实时能看到什么依据。
// 工具的真实返回值不渲染，存了只是把表撑大（一次联网搜索可能几十 KB）。

test('toPersistedAssistantParts 保留正文与工具调用，丢弃流内 data 事件', () => {
  const parts = toPersistedAssistantParts([
    { type: 'text', text: '答案正文' },
    { type: 'data-student-bloom', data: { messageId: 'm1', state: 'classified', level: 3 } },
    {
      type: 'dynamic-tool',
      toolName: 'web_search',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { query: '赤壁赋 创作背景' },
      output: { results: [{ title: 'x', url: 'https://example.test' }] },
    },
  ]);

  assert.deepEqual(parts, [
    { type: 'text', text: '答案正文' },
    {
      type: 'dynamic-tool',
      toolName: 'web_search',
      toolCallId: 'call-1',
      state: 'output-available',
      input: { query: '赤壁赋 创作背景' },
    },
  ]);
  // output 不落库：界面不渲染它。
  assert.ok(!JSON.stringify(parts).includes('example.test'));
});

test('toPersistedAssistantParts 保留静态工具名（写在 type 里）与失败原因', () => {
  const parts = toPersistedAssistantParts([
    { type: 'tool-web_search', toolCallId: 'call-2', state: 'output-error', input: { query: 'q' }, errorText: '连接超时' },
  ]);

  assert.deepEqual(parts, [
    { type: 'tool-web_search', toolCallId: 'call-2', state: 'output-error', input: { query: 'q' }, errorText: '连接超时' },
  ]);
});

test('toPersistedAssistantParts 丢弃空正文与非工具无名 part', () => {
  assert.deepEqual(toPersistedAssistantParts([{ type: 'text', text: '' }, { type: 'dynamic-tool', state: 'input-available' }]), []);
  assert.deepEqual(toPersistedAssistantParts('not-an-array'), []);
});
