import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildAuditQueueGroups,
  findNextPendingSessionId,
  flattenAuditSessions,
  type AuditQueueEntry,
  type AuditQueueSession,
} from '../audit-queue.ts';

function session(conversationId: string, overrides: Partial<AuditQueueSession> = {}): AuditQueueSession {
  return {
    conversationId,
    sessionLabel: conversationId,
    updatedAt: '2026-09-16T10:00:00.000Z',
    finalized: false,
    assistantCount: 2,
    riskAssistantCount: 0,
    issueCount: 0,
    issueLabels: [],
    preReviewState: 'not_run',
    preReviewCoveredMessageCount: 0,
    ...overrides,
  };
}

function entry(overrides: Partial<AuditQueueEntry> & { conversationId: string }): AuditQueueEntry {
  const { conversationId, ...rest } = overrides;
  return {
    classId: 'class-a',
    classLabel: '高一（1）班',
    studentName: '学生甲',
    projectName: '赤壁赋',
    session: session(conversationId),
    ...rest,
  };
}

test('buildAuditQueueGroups：收成 班级 → 学生 → 项目 → 会话', () => {
  const groups = buildAuditQueueGroups([
    entry({ conversationId: 'c1' }),
    entry({ conversationId: 'c2' }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].classLabel, '高一（1）班');
  assert.equal(groups[0].students.length, 1);
  assert.equal(groups[0].students[0].projects.length, 1);
  assert.deepEqual(groups[0].students[0].projects[0].sessions.map((s) => s.conversationId), ['c1', 'c2']);
});

test('buildAuditQueueGroups：同名学生分属不同班级时不会被合并', () => {
  const groups = buildAuditQueueGroups([
    entry({ conversationId: 'c1', classId: 'class-a', classLabel: 'A 班' }),
    entry({ conversationId: 'c2', classId: 'class-b', classLabel: 'B 班' }),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.classLabel), ['A 班', 'B 班']);
});

test('buildAuditQueueGroups：同一班级下不同学生/项目各自成节点', () => {
  const groups = buildAuditQueueGroups([
    entry({ conversationId: 'c1' }),
    entry({ conversationId: 'c2', studentName: '学生乙' }),
    entry({ conversationId: 'c3', projectName: '静夜思' }),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].students.map((student) => student.studentName), ['学生甲', '学生乙']);
  assert.deepEqual(groups[0].students[0].projects.map((project) => project.projectName), ['赤壁赋', '静夜思']);
});

test('buildAuditQueueGroups：保持入参顺序（调用方已按 updated_at desc 取数）', () => {
  const groups = buildAuditQueueGroups([
    entry({ conversationId: 'newer' }),
    entry({ conversationId: 'older' }),
  ]);

  // 不重排——排序是查询的事，这里重排会让「第 1 页/第 2 页」的边界看起来是乱的。
  assert.deepEqual(flattenAuditSessions(groups).map((s) => s.conversationId), ['newer', 'older']);
});

test('buildAuditQueueGroups：无班级时用班级名兜底分组，不丢会话', () => {
  const groups = buildAuditQueueGroups([entry({ conversationId: 'c1', classId: null, classLabel: '未命名班级' })]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].classId, null);
  assert.equal(flattenAuditSessions(groups).length, 1);
});

test('findNextPendingSessionId：跳过已提交的，走到最后返回 undefined', () => {
  const groups = buildAuditQueueGroups([
    entry({ conversationId: 'c1' }),
    entry({ conversationId: 'c2', session: session('c2', { finalized: true }) }),
    entry({ conversationId: 'c3' }),
  ]);

  assert.equal(findNextPendingSessionId(groups, 'c1'), 'c3');
  assert.equal(findNextPendingSessionId(groups, 'c3'), undefined);
  assert.equal(findNextPendingSessionId(groups, '不在队列里'), undefined);
});
