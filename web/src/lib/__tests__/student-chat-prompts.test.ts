import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStudentSystemPrompt,
  matchKnownProjectTitle,
  normalizeConcreteProjectTitle,
  normalizeProjectAuthor,
  parseClassificationAnswer,
  parseBloomClassificationAnswer,
} from '../student-chat-prompts.ts';

// ─── normalizeConcreteProjectTitle ────────────────────────────────────────────

test('normalizeConcreteProjectTitle strips book-title marks', () => {
  assert.equal(normalizeConcreteProjectTitle('《静夜思》'), '静夜思');
});

test('normalizeConcreteProjectTitle trims whitespace', () => {
  assert.equal(normalizeConcreteProjectTitle('  水调歌头  '), '水调歌头');
});

test('normalizeConcreteProjectTitle rejects placeholder titles', () => {
  assert.equal(normalizeConcreteProjectTitle('日常会话归档'), null);
  assert.equal(normalizeConcreteProjectTitle('未定篇目'), null);
});

test('normalizeConcreteProjectTitle rejects empty string', () => {
  assert.equal(normalizeConcreteProjectTitle(''), null);
  assert.equal(normalizeConcreteProjectTitle(null), null);
  assert.equal(normalizeConcreteProjectTitle(undefined), null);
});

test('normalizeConcreteProjectTitle rejects titles longer than 80 chars', () => {
  assert.equal(normalizeConcreteProjectTitle('甲'.repeat(81)), null);
});

// ─── normalizeProjectAuthor ───────────────────────────────────────────────────

test('normalizeProjectAuthor returns trimmed string', () => {
  assert.equal(normalizeProjectAuthor('  李白  '), '李白');
});

test('normalizeProjectAuthor returns null for empty input', () => {
  assert.equal(normalizeProjectAuthor(''), null);
  assert.equal(normalizeProjectAuthor(null), null);
});

// ─── buildStudentSystemPrompt — project ctx ───────────────────────────────────

test('project prompt contains the project title', () => {
  const result = buildStudentSystemPrompt({ kind: 'project', projectTitle: '静夜思' });
  assert.ok(result.includes('《静夜思》'), 'should embed the project title');
});

test('project prompt identifies as teaching assistant', () => {
  const result = buildStudentSystemPrompt({ kind: 'project', projectTitle: '静夜思' });
  assert.ok(result.includes('古诗文 AI 教学助手'), 'should identify role');
});

test('project prompt must not mention challenges or teacher review', () => {
  const result = buildStudentSystemPrompt({ kind: 'project', projectTitle: '水调歌头' });
  assert.ok(result.includes('不要把会话说成挑战'), 'should forbid mentioning challenges');
  assert.ok(result.includes('不要声称已完成教师核实'), 'should forbid claiming teacher review');
});

test('project prompt must not mention SFT/DPO', () => {
  const result = buildStudentSystemPrompt({ kind: 'project', projectTitle: '水调歌头' });
  assert.ok(result.includes('SFT/DPO'), 'should mention SFT/DPO as forbidden topic');
});

test('project prompt appends attachmentPrompt when provided', () => {
  const result = buildStudentSystemPrompt({
    kind: 'project',
    projectTitle: '静夜思',
    attachmentPrompt: '\n\n<untrusted>附件内容</untrusted>',
  });
  assert.ok(result.endsWith('<untrusted>附件内容</untrusted>'), 'attachment prompt should be at the end');
});

// ─── buildStudentSystemPrompt — classifying ctx ───────────────────────────────

test('classifying prompt signals that attribution is in progress', () => {
  const result = buildStudentSystemPrompt({ kind: 'classifying' });
  assert.ok(result.includes('篇目归属正在后台识别'), 'should indicate pending classification');
});

test('classifying prompt must not claim a project has been assigned', () => {
  const result = buildStudentSystemPrompt({ kind: 'classifying' });
  assert.ok(result.includes('不要自称已经归入某个项目'), 'should forbid premature project claim');
});

// ─── buildStudentSystemPrompt — archive ctx ───────────────────────────────────

test('archive prompt explains the daily archive container', () => {
  const result = buildStudentSystemPrompt({ kind: 'archive' });
  assert.ok(result.includes('日常会话归档'), 'should name the archive container');
});

test('archive prompt instructs model not to promise relocation to project', () => {
  const result = buildStudentSystemPrompt({ kind: 'archive' });
  assert.ok(result.includes('不要承诺本会话会补归属或迁移'), 'should forbid relocation promise');
});

test('archive prompt must not mention bloom path generation', () => {
  const result = buildStudentSystemPrompt({ kind: 'archive' });
  assert.ok(result.includes('布鲁姆认知路径'), 'should mention bloom path as not applicable');
});

// ─── attachment prompt splicing ───────────────────────────────────────────────

test('all ctx kinds accept empty attachmentPrompt without trailing noise', () => {
  for (const kind of ['project', 'classifying', 'archive'] as const) {
    const ctx = kind === 'project'
      ? { kind, projectTitle: '长恨歌' }
      : { kind };
    const withEmpty = buildStudentSystemPrompt({ ...ctx, attachmentPrompt: '' });
    const withOmitted = buildStudentSystemPrompt(ctx);
    assert.equal(withEmpty, withOmitted, `empty attachmentPrompt should equal omitted for kind=${kind}`);
  }
});

// ─── model verdict parsing (plain-text contract, no book-mark rule) ──────────

test('parseClassificationAnswer reads title and author lines', () => {
  assert.deepEqual(parseClassificationAnswer('赤壁赋\n苏轼'), { title: '赤壁赋', author: '苏轼' });
  assert.deepEqual(parseClassificationAnswer('登高\n'), { title: '登高', author: null });
  assert.deepEqual(parseClassificationAnswer('念奴娇·赤壁怀古\n苏轼\n多余行忽略'), { title: '念奴娇·赤壁怀古', author: '苏轼' });
});

test('parseClassificationAnswer treats NULL and placeholders as unclassified', () => {
  assert.deepEqual(parseClassificationAnswer('NULL'), { title: null, author: null });
  assert.deepEqual(parseClassificationAnswer('null'), { title: null, author: null });
  assert.deepEqual(parseClassificationAnswer('日常会话归档'), { title: null, author: null });
  assert.deepEqual(parseClassificationAnswer(''), { title: null, author: null });
  assert.deepEqual(parseClassificationAnswer('《登高》\n杜甫'), { title: '登高', author: '杜甫' });
});

// ─── known-title fast path (no book marks required) ──────────────────────────

test('matchKnownProjectTitle hits owner titles without book marks', () => {
  const titles = ['静夜思', '登鹳雀楼', '送东阳马生序', '出师表'];
  assert.equal(matchKnownProjectTitle('出师表的作者是谁', titles), '出师表');
  assert.equal(matchKnownProjectTitle('登高这首诗讲什么', ['登高', '静夜思']), '登高');
  assert.equal(matchKnownProjectTitle('《静夜思》的疑是什么意思', titles), '静夜思');
});

test('matchKnownProjectTitle prefers the longest title', () => {
  assert.equal(matchKnownProjectTitle('送东阳马生序怎么背', ['送东阳马生序', '马生']), '送东阳马生序');
});

test('matchKnownProjectTitle returns null without a hit', () => {
  const titles = ['静夜思', '出师表'];
  assert.equal(matchKnownProjectTitle('赤壁赋的背景是什么', titles), null);
  assert.equal(matchKnownProjectTitle('古诗文怎么学', titles), null);
  assert.equal(matchKnownProjectTitle('', titles), null);
  assert.equal(matchKnownProjectTitle('静夜思写得真好', []), null);
});

test('matchKnownProjectTitle ignores placeholder titles', () => {
  assert.equal(matchKnownProjectTitle('日常会话归档在哪里', ['日常会话归档', '静夜思']), null);
});

// ─── parseBloomClassificationAnswer ──────────────────────────────────────────

test('parseBloomClassificationAnswer reads level and reason from two lines', () => {
  assert.deepEqual(parseBloomClassificationAnswer('4\n需要比较叙事诗与抒情诗的特征'), {
    level: 4,
    reason: '需要比较叙事诗与抒情诗的特征',
  });
});

test('parseBloomClassificationAnswer allows a level-only answer', () => {
  assert.deepEqual(parseBloomClassificationAnswer('2'), { level: 2, reason: '' });
});

test('parseBloomClassificationAnswer tolerates a non-digit prefix', () => {
  assert.deepEqual(parseBloomClassificationAnswer('第4层\n拆解结构'), { level: 4, reason: '拆解结构' });
  assert.deepEqual(parseBloomClassificationAnswer('层级：6\n生成仿写'), { level: 6, reason: '生成仿写' });
});

test('parseBloomClassificationAnswer rejects multi-digit sequences', () => {
  assert.equal(parseBloomClassificationAnswer('2026\n年度总结'), null);
  assert.equal(parseBloomClassificationAnswer('12\n两个层级'), null);
});

test('parseBloomClassificationAnswer rejects out-of-range and non-numeric levels', () => {
  assert.equal(parseBloomClassificationAnswer('7\n超出范围'), null);
  assert.equal(parseBloomClassificationAnswer('0\n低于范围'), null);
  assert.equal(parseBloomClassificationAnswer('层级未知\n无法判断'), null);
  assert.equal(parseBloomClassificationAnswer(''), null);
});

test('parseBloomClassificationAnswer truncates a long reason to 120 chars', () => {
  const parsed = parseBloomClassificationAnswer(`3\n${'理'.repeat(200)}`);
  assert.ok(parsed);
  assert.equal(parsed.reason.length, 120);
});

test('parseClassificationAnswer salvages the main title from book marks in prose', () => {
  // 小模型不守两行协议、把整段回答当首行输出时的生产失败形态（秦时明月汉时关案）。
  const prose = '这句诗运用了互文的修辞手法。它出自王昌龄的《出塞》，前两句是秦时明月汉时关。';
  assert.deepEqual(parseClassificationAnswer(prose), { title: '出塞', author: null });
});

test('parseClassificationAnswer still refuses prose without any book-marked title', () => {
  assert.deepEqual(parseClassificationAnswer('这句诗运用了比喻和夸张的修辞手法，表达了戍边将士的思乡之情。'), { title: null, author: null });
});

test('parseClassificationAnswer refuses prose-only first lines instead of building a garbage project', () => {
  const prose = '这句诗运用了互文的修辞手法。它出自王昌龄的《出塞》，前两句是秦时明月汉时关。';
  assert.deepEqual(parseClassificationAnswer(prose), { title: '出塞', author: null });
  assert.deepEqual(parseClassificationAnswer('这句诗运用了比喻的修辞手法。'), { title: null, author: null });
});

test('parseClassificationAnswer accepts a title line with a label prefix', () => {
  assert.deepEqual(parseClassificationAnswer('篇目：出塞\n王昌龄'), { title: '出塞', author: '王昌龄' });
});
