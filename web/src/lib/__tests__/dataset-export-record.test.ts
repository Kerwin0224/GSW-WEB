/**
 * 数据集导出纯函数层的单测（此前该文件测试为空壳，仅靠依赖真实环境的 e2e 兜底）。
 * 覆盖：latest 去重、scope 过滤、上下文回放与降级、SFT/DPO 转换的空值拒绝。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildPromptMessages,
  keepLatestApprovedExports,
  keepLatestBySourceMessage,
  toDpoRecord,
  toSftRecord,
  type DatasetContext,
  type ExportableAuditRow,
  type TranscriptMessageLike,
} from '../dataset-export-record.ts';

function makeRow(overrides: Partial<ExportableAuditRow>): ExportableAuditRow {
  return {
    id: 'row-1',
    source_message_id: 'msg-1',
    status: 'approved',
    prompt: '什么是互文？',
    original_answer: '原回答',
    corrected_answer: null,
    chosen_answer: null,
    rejected_answer: null,
    class_id: null,
    auditor_id: 'teacher-1',
    source_conversation_id: 'conv-1',
    metadata: { conversation_action: 'conversation_finalized' },
    created_at: '2026-09-11T10:00:00Z',
    updated_at: '2026-09-11T10:00:00Z',
    kind: 'sft',
    ...overrides,
  };
}

test('keepLatestBySourceMessage 保留同一消息的最新一条并按时间倒序', () => {
  const older = makeRow({ id: 'old', source_message_id: 'm1', created_at: '2026-09-10T00:00:00Z', updated_at: '2026-09-10T00:00:00Z' });
  const newer = makeRow({ id: 'new', source_message_id: 'm1', created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z' });
  const orphan = makeRow({ id: 'orphan', source_message_id: null, created_at: '2026-09-09T00:00:00Z' });
  const result = keepLatestBySourceMessage([older, newer, orphan]);
  assert.deepEqual(result.map((row) => row.id), ['new']);
});

test('keepLatestApprovedExports 在 unexported 范围排除已导出记录', () => {
  const approved = makeRow({ id: 'a', source_message_id: 'm1', status: 'approved' });
  const exported = makeRow({ id: 'e', source_message_id: 'm2', status: 'exported' });
  const draft = makeRow({ id: 'd', source_message_id: 'm3', status: 'approved', metadata: { teacher_action: 'confirmed' } });
  assert.deepEqual(keepLatestApprovedExports([approved, exported], 'unexported').map((row) => row.id), ['a']);
  assert.deepEqual(keepLatestApprovedExports([approved, exported], 'all').map((row) => row.id), ['a', 'e']);
  // 非会话级 finalize（metadata 缺 conversation_action）不是可导出样本
  assert.deepEqual(keepLatestApprovedExports([draft], 'all'), []);
});

function makeContext(overrides: {
  record?: Partial<ExportableAuditRow>;
  transcript?: TranscriptMessageLike[];
}): DatasetContext {
  return {
    record: makeRow({ ...(overrides.record ?? {}) }),
    conversation: {
      id: 'conv-1',
      owner_id: 'a0000000-0000-0000-0000-000000000011',
      project_id: 'proj-1',
      title: null,
      text_projects: [{ title: '静夜思' }],
    },
    transcript: overrides.transcript ?? [],
  };
}

test('buildPromptMessages 回放 source 消息之前的完整上下文', () => {
  const transcript: TranscriptMessageLike[] = [
    { id: 'u1', conversation_id: 'conv-1', role: 'user', content: '静夜思是谁写的？', created_at: '2026-09-11T09:00:00Z' },
    { id: 'a1', conversation_id: 'conv-1', role: 'assistant', content: '李白。', created_at: '2026-09-11T09:00:10Z' },
    { id: 'u2', conversation_id: 'conv-1', role: 'user', content: '什么是互文？', created_at: '2026-09-11T09:01:00Z' },
  ];
  const context = makeContext({ record: { source_message_id: 'u2' }, transcript });
  const messages = buildPromptMessages(context);
  assert.deepEqual(messages, [
    { role: 'user', content: '静夜思是谁写的？' },
    { role: 'assistant', content: '李白。' },
  ]);
});

test('buildPromptMessages 在 transcript 缺失时回退到 record.prompt 而不是产出空样本', () => {
  const context = makeContext({ record: { source_message_id: 'u2' }, transcript: [] });
  assert.deepEqual(buildPromptMessages(context), [{ role: 'user', content: '什么是互文？' }]);
});

test('toSftRecord 没有 assistant 内容时拒绝生成', () => {
  const context = makeContext({ record: { original_answer: null, corrected_answer: null } });
  assert.equal(toSftRecord(context), null);
});

test('toSftRecord 把上下文与 assistant 拼成完整样本', () => {
  const transcript: TranscriptMessageLike[] = [
    { id: 'u1', conversation_id: 'conv-1', role: 'user', content: '什么是互文？', created_at: '2026-09-11T09:00:00Z' },
  ];
  const context = makeContext({ record: { source_message_id: 'u1', corrected_answer: '互文是……' }, transcript });
  const record = toSftRecord(context);
  assert.ok(record);
  assert.deepEqual(record.messages, [
    { role: 'user', content: '什么是互文？' },
    { role: 'assistant', content: '互文是……' },
  ]);
  assert.equal(record.metadata.projectTitle, '静夜思');
  assert.equal(record.metadata.studentAnonId, 'student_a0000000');
});

test('toDpoRecord 缺 chosen 或 rejected 时拒绝生成', () => {
  assert.equal(toDpoRecord(makeContext({ record: { chosen_answer: null } })), null);
  assert.equal(toDpoRecord(makeContext({ record: { rejected_answer: '' } })), null);
});

test('toDpoRecord 生成 prompt 与偏好对', () => {
  const transcript: TranscriptMessageLike[] = [
    { id: 'u1', conversation_id: 'conv-1', role: 'user', content: '什么是互文？', created_at: '2026-09-11T09:00:00Z' },
  ];
  const context = makeContext({ record: { source_message_id: 'u1', chosen_answer: '好答案', rejected_answer: '差答案' }, transcript });
  const record = toDpoRecord(context);
  assert.ok(record);
  assert.equal(record.prompt, '什么是互文？');
  assert.equal(record.chosen, '好答案');
  assert.equal(record.rejected, '差答案');
  assert.equal(record.metadata.chosenAnswerId, 'u1:chosen');
});
