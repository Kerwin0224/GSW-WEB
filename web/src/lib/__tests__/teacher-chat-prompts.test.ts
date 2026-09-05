import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTeacherSystemPrompt } from '../teacher-chat-prompts.ts';

test('uses default teaching-assistant role description when no preset is provided', () => {
  const result = buildTeacherSystemPrompt({});
  assert.ok(result.includes('教师问答助手'), 'should use default role');
  assert.ok(result.includes('备课'), 'should mention lesson prep');
  assert.ok(result.includes('临时教学判断'), 'should mention ad-hoc teaching decisions');
});

test('preset instruction overrides the default role description', () => {
  const result = buildTeacherSystemPrompt({ presetInstruction: '你是专注文言文语法讲解的助手。' });
  assert.equal(result, '你是专注文言文语法讲解的助手。');
  assert.ok(!result.includes('教师问答助手'), 'should not contain default role when preset is given');
});

test('null preset falls back to default role description', () => {
  const result = buildTeacherSystemPrompt({ presetInstruction: null });
  assert.ok(result.includes('教师问答助手'), 'null preset should use default');
});

test('empty string preset falls back to default role description', () => {
  const result = buildTeacherSystemPrompt({ presetInstruction: '' });
  assert.ok(result.includes('教师问答助手'), 'empty string preset should use default');
});

test('attachment prompt is appended after the base system prompt', () => {
  const attachment = '\n\n<untrusted_attachments>文档内容</untrusted_attachments>';
  const result = buildTeacherSystemPrompt({ attachmentPrompt: attachment });
  assert.ok(result.endsWith(attachment), 'attachment should be at the end');
  assert.ok(result.startsWith('你是文韵智途的教师问答助手'), 'base prompt should still be first');
});

test('preset + attachment are combined in the correct order', () => {
  const result = buildTeacherSystemPrompt({
    presetInstruction: '你是文言文语法专家。',
    attachmentPrompt: '\n\n附件',
  });
  assert.equal(result, '你是文言文语法专家。\n\n附件');
});

test('omitting attachmentPrompt produces no trailing noise', () => {
  const withOmitted = buildTeacherSystemPrompt({});
  const withEmpty = buildTeacherSystemPrompt({ attachmentPrompt: '' });
  assert.equal(withOmitted, withEmpty);
});
