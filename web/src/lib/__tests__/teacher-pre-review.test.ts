import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isPreReviewResultChecked,
  normalizePreReviewResults,
} from '../teacher-pre-review.ts';

const messages = [
  { id: 'assistant-1', content: '诗人先写月光，再引出乡愁。' },
  { id: 'assistant-2', content: '这里可以从“月光→霜→举头→低头”的顺序理解。' },
];

test('normalizes one result per assistant message and keeps empty checked results', () => {
  const results = normalizePreReviewResults(messages, [
    {
      messageId: 'assistant-1',
      issues: [{ quote: '先写月光', label: '表达可能过度简化', severity: 'low' }],
    },
    { messageId: 'assistant-2', issues: [] },
  ]);

  assert.equal(results.length, 2);
  assert.equal(results[0]?.status, 'checked');
  assert.equal(results[0]?.issues.length, 1);
  assert.equal(results[1]?.status, 'checked');
  assert.deepEqual(results[1]?.issues, []);
});

test('does not count missing model results as covered', () => {
  const results = normalizePreReviewResults(messages, [
    { messageId: 'assistant-1', issues: [] },
  ]);

  assert.equal(results[0]?.status, 'checked');
  assert.equal(results[1]?.status, 'missing_result');
  assert.equal(isPreReviewResultChecked({ messageId: 'assistant-2', status: 'missing_result', checked: false }), false);
});

test('drops invalid quote issues without losing checked coverage', () => {
  const results = normalizePreReviewResults(messages, [
    {
      messageId: 'assistant-1',
      issues: [{ quote: '不存在的片段', label: '无法定位', severity: 'high' }],
    },
    { messageId: 'assistant-2', issues: [] },
  ]);

  assert.equal(results[0]?.status, 'checked');
  assert.equal(results[0]?.rawIssueCount, 1);
  assert.equal(results[0]?.ignoredIssueCount, 1);
  assert.deepEqual(results[0]?.issues, []);
});

test('preserves checked issue coverage for every assistant in long conversations', () => {
  const longMessages = Array.from({ length: 5 }, (_, index) => ({
    id: `assistant-${index + 1}`,
    content: `第 ${index + 1} 条回答：片段A 片段B 片段C 片段D。`,
  }));
  const results = normalizePreReviewResults(
    longMessages,
    longMessages.map((message) => ({
      messageId: message.id,
      issues: ['片段A', '片段B', '片段C', '片段D'].map((quote, issueIndex) => ({
        quote,
        label: `疑点 ${issueIndex + 1}`,
        severity: 'medium',
      })),
    })),
  );

  assert.equal(results.length, 5);
  assert.deepEqual(results.map((result) => result.status), ['checked', 'checked', 'checked', 'checked', 'checked']);
  assert.equal(results.flatMap((result) => result.issues).length, 20);
});
