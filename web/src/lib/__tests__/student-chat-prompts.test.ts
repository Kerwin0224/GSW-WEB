import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStudentSystemPrompt,
  extractExplicitProjectTitle,
  normalizeConcreteProjectTitle,
  normalizeProjectAuthor,
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

// ─── explicit book-title fast path ───────────────────────────────────────────

test('extractExplicitProjectTitle returns the first book-marked title', () => {
  assert.equal(extractExplicitProjectTitle('《静夜思》的"疑"是什么意思？'), '静夜思');
  assert.equal(extractExplicitProjectTitle('帮我理解《念奴娇·赤壁怀古》上阕'), '念奴娇·赤壁怀古');
  assert.equal(extractExplicitProjectTitle('《出师表》和《桃花源记》哪篇更难？'), '出师表');
});

test('extractExplicitProjectTitle rejects non-titles and empty marks', () => {
  assert.equal(extractExplicitProjectTitle('没有书名号的泛泛之问'), null);
  assert.equal(extractExplicitProjectTitle('《》里什么都没有'), null);
  assert.equal(extractExplicitProjectTitle('《日常会话归档》这种占位词不算篇目'), null);
});
