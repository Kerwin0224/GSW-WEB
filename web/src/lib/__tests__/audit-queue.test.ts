import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildAuditQueueGroups,
  findNextPendingSessionId,
  flattenAuditSessions,
  hasTeacherDecision,
  latestTeacherDecision,
  type AuditQueueEntry,
  type AuditQueueSession,
  type TeacherDecisionRow,
} from '../audit-queue.ts';

function decisionRow(overrides: { teacher_action?: string; quality?: string | null; status?: string } & Partial<TeacherDecisionRow>): TeacherDecisionRow {
  const { teacher_action: action, quality = null, status = 'approved', ...rest } = overrides;
  return {
    kind: 'metadata',
    status,
    quality,
    metadata: action ? { teacher_action: action } : {},
    ...rest,
  };
}

function session(conversationId: string, overrides: Partial<AuditQueueSession> = {}): AuditQueueSession {
  return {
    conversationId,
    sessionLabel: conversationId,
    updatedAt: '2026-09-16T10:00:00.000Z',
    finalized: false,
    assistantCount: 2,
    locked: false,
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

// ─── 训练数据只收教师处置过的回答 ───────────────────────────────────────────
//
// 10 轮长对话里只有第 3 轮被修订过时，旧实现会把其余 9 条**从未被读���**的回答
// 写成 accurate 训练样本，且提交后不可修订——错误被永久固化。
// 「没改过」不等于「看过且认可」：判据必须是教师留下过显式处置记录。

test('hasTeacherDecision：只有确认或修订记录才算处置过', () => {
  assert.equal(hasTeacherDecision([decisionRow({ teacher_action: 'message_confirmed' })]), true);
  assert.equal(hasTeacherDecision([decisionRow({ teacher_action: 'revision_draft' })]), true);
  // 历史数据：确认结论只落在 quality 上，没有 teacher_action。
  assert.equal(hasTeacherDecision([decisionRow({ quality: 'confirmed' })]), true);
});

test('hasTeacherDecision：预审记录不算教师处置', () => {
  // AI 预审是 AI 写的记录，教师没看过。把它算成处置，等于让模型替教师下结论。
  assert.equal(hasTeacherDecision([decisionRow({ teacher_action: 'conversation_pre_review' })]), false);
  assert.equal(hasTeacherDecision([decisionRow({ teacher_action: 'conversation_finalized' })]), false);
  assert.equal(hasTeacherDecision([]), false);
});

test('hasTeacherDecision：未批准的处置记录不算数', () => {
  // 草稿态的记录不能当凭据，否则「写了但没批准」也会把样本放进去。
  assert.equal(hasTeacherDecision([decisionRow({ teacher_action: 'message_confirmed', status: 'draft' })]), false);
  assert.equal(hasTeacherDecision([decisionRow({ teacher_action: 'message_confirmed', status: 'exported' })]), true);
});

test('latestTeacherDecision：取较新的一条带回维度与评语', () => {
  const latest = latestTeacherDecision([
    decisionRow({ teacher_action: 'message_confirmed', dimension_key: 'old', teacher_comment: '旧评语', updated_at: '2026-01-01T00:00:00.000Z' }),
    decisionRow({ teacher_action: 'revision_draft', dimension_key: 'new', teacher_comment: '新评语', updated_at: '2026-02-01T00:00:00.000Z' }),
  ]);
  assert.equal(latest?.dimension_key, 'new');
  assert.equal(latest?.teacher_comment, '新评语');
  // 处置记录存在但没写维度/评语时，返回 undefined 而不是编一条空评语出来。
  assert.equal(latestTeacherDecision([decisionRow({ teacher_action: 'message_confirmed' })]), undefined);
});
