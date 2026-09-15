import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildProjectClassificationInstruction,
  defaultProjectClassificationInstruction,
  matchKnownProjectTitle,
  normalizeConcreteProjectTitle,
  parseClassificationAnswer,
} from '../student-chat-prompts.ts';

// ─── 回归：协议外拒绝语曾被当成真实篇目，建成垃圾项目 ────────────────────────

test('normalizeConcreteProjectTitle：拒绝语一律判无法归属', () => {
  for (const rejection of ['NULL', 'null', '无法归属', '无法确定', '无法判断', '无', '没有', '不确定', '未知', '与古诗文无关', '无具体篇目', '无法识别', '不属于任何篇目']) {
    assert.equal(normalizeConcreteProjectTitle(rejection), null, `${rejection} 不应被当作篇目标题`);
  }
});

test('parseClassificationAnswer：模型用自然语言拒绝时不产标题', () => {
  assert.deepEqual(parseClassificationAnswer('无法归属'), { title: null, author: null });
  assert.deepEqual(parseClassificationAnswer('NULL'), { title: null, author: null });
});

test('normalizeConcreteProjectTitle：真实篇目不受影响', () => {
  assert.equal(normalizeConcreteProjectTitle('《赤壁赋》'), '赤壁赋');
  assert.equal(normalizeConcreteProjectTitle('静夜思'), '静夜思');
  // 「无关」只在整行就是拒绝语时才拦；篇目名里含「无」不会被误杀。
  assert.equal(normalizeConcreteProjectTitle('无锡小记'), '无锡小记');
});

// ─── 回归：多篇目时曾按标题长度挑，忽略学生先说哪个 ──────────────────────────

test('matchKnownProjectTitle：取最早出现的篇目，而非最长的', () => {
  const known = ['春望', '静夜思'];
  assert.equal(matchKnownProjectTitle('《春望》和《静夜思》比较一下', known), '春望');
  assert.equal(matchKnownProjectTitle('《静夜思》和《春望》比较一下', known), '静夜思');
});

test('matchKnownProjectTitle：同位置取更具体的标题', () => {
  const known = ['念奴娇', '念奴娇·赤壁怀古'];
  assert.equal(matchKnownProjectTitle('念奴娇·赤壁怀古上阕怎么理解', known), '念奴娇·赤壁怀古');
});

test('matchKnownProjectTitle：未命中返回 null', () => {
  assert.equal(matchKnownProjectTitle('今天天气不错', ['春望']), null);
  // 单字标题不参与匹配，避免噪音。
  assert.equal(matchKnownProjectTitle('这个人是谁', ['人']), null);
});

// ─── 归类提示词抽象：教师规则不破坏输出协议 ──────────────────────────────────

test('buildProjectClassificationInstruction：无教师规则时用内置规则，且只拼一次协议', () => {
  const text = buildProjectClassificationInstruction();
  assert.ok(text.includes(defaultProjectClassificationInstruction));
  const protocolCount = text.split('无法归属时只输出一行 NULL').length - 1;
  assert.equal(protocolCount, 1, '输出协议不应重复拼接');
});

test('buildProjectClassificationInstruction：教师规则覆盖内置，协议仍由系统强制带上', () => {
  const text = buildProjectClassificationInstruction({ teacherRule: '本班按数学知识点归类。' });
  assert.ok(text.startsWith('本班按数学知识点归类。'));
  assert.ok(!text.includes('你是文韵智途的篇目归属裁决器'), '教师规则应覆盖内置规则');
  assert.ok(text.includes('无法归属时只输出一行 NULL'), '协议必须保留');
});

test('buildProjectClassificationInstruction：带目录时附上可选归属路径', () => {
  const text = buildProjectClassificationInstruction({ catalogPaths: ['语文 / 高一 / 文言文'] });
  assert.ok(text.includes('语文 / 高一 / 文言文'));
});
