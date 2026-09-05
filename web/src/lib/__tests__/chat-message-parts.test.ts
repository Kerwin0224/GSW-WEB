import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canonicalizeUiMessageParts } from '../chat-message-parts.ts';

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
