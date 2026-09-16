import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildStudentSystemPrompt } from '../student-chat-prompts.ts';

// 归类/布鲁姆提示词与解析在 classification-prompts.test.ts；
// 标题合法性规则在 project-title.test.ts。本文件只管学生回答的 system prompt。

// ─── project ctx ─────────────────────────────────────────────────────────────

test('project prompt contains the project title', () => {
  const result = buildStudentSystemPrompt({ kind: 'project', projectTitle: '静夜思' });
  assert.ok(result.includes('《静夜思》'), 'should embed the project title');
});

test('project prompt identifies as teaching assistant', () => {
  const result = buildStudentSystemPrompt({ kind: 'project', projectTitle: '静夜思' });
  assert.ok(result.includes('AI 教学助手'), 'should identify role');
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

// ─── classifying ctx ─────────────────────────────────────────────────────────

test('classifying prompt signals that attribution is in progress', () => {
  const result = buildStudentSystemPrompt({ kind: 'classifying' });
  assert.ok(result.includes('项目归属正在后台识别'), 'should indicate pending classification');
});

test('classifying prompt must not claim a project has been assigned', () => {
  const result = buildStudentSystemPrompt({ kind: 'classifying' });
  assert.ok(result.includes('不要自称已经归入某个项目'), 'should forbid premature project claim');
});

// ─── archive ctx ─────────────────────────────────────────────────────────────

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

// ─── attachment prompt splicing ──────────────────────────────────────────────

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

// ─── 定位：学生侧回答提示词不假设学科 ────────────────────────────────────────
//
// 这个工作台服务各学科各年级。回答骨架（先解决问题、再引导理解、每轮一个追问）
// 与学科无关；一旦写死「古诗文」，数学班会得到讲解意象与情感脉络的回答。

test('三种容器的回答提示词都不假设学科', () => {
  const prompts = [
    buildStudentSystemPrompt({ kind: 'project', projectTitle: '一次函数' }),
    buildStudentSystemPrompt({ kind: 'classifying' }),
    buildStudentSystemPrompt({ kind: 'archive' }),
  ];
  for (const prompt of prompts) {
    for (const forbidden of ['古诗文', '文言文', '情感脉络', '关键字词']) {
      assert.ok(!prompt.includes(forbidden), `回答提示词不应出现「${forbidden}」`);
    }
  }
});

test('三种容器都保留启发式教学骨架', () => {
  for (const ctx of [{ kind: 'project', projectTitle: '一次函数' } as const, { kind: 'classifying' } as const, { kind: 'archive' } as const]) {
    const prompt = buildStudentSystemPrompt(ctx);
    assert.ok(prompt.includes('先直接解决学生问题'), 'should keep solve-first stance');
    assert.ok(prompt.includes('每轮最多提出 1 个自然追问'), 'should keep the single-follow-up rule');
  }
});
