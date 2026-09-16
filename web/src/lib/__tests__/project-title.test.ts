import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  looksLikeTitleLine,
  normalizeConcreteProjectTitle,
  normalizeProjectAuthor,
} from '../project-title.ts';

// ─── 归一化 ──────────────────────────────────────────────────────────────────

test('normalizeConcreteProjectTitle：去书名号与空白', () => {
  assert.equal(normalizeConcreteProjectTitle('《静夜思》'), '静夜思');
  assert.equal(normalizeConcreteProjectTitle('  水调歌头  '), '水调歌头');
});

test('normalizeConcreteProjectTitle：占位名一律拒绝', () => {
  for (const placeholder of ['日常会话归档', '未定篇目', '附件会话', '篇目项目']) {
    assert.equal(normalizeConcreteProjectTitle(placeholder), null, `${placeholder} 是占位名`);
  }
});

test('normalizeConcreteProjectTitle：空值与超长拒绝', () => {
  assert.equal(normalizeConcreteProjectTitle(''), null);
  assert.equal(normalizeConcreteProjectTitle(null), null);
  assert.equal(normalizeConcreteProjectTitle(undefined), null);
  assert.equal(normalizeConcreteProjectTitle('甲'.repeat(81)), null);
});

// ─── 回归：协议外拒绝语曾被当成真实标题，建成垃圾项目 ────────────────────────

test('normalizeConcreteProjectTitle：拒绝语一律判无法归属', () => {
  for (const rejection of ['NULL', 'null', '无法归属', '无法确定', '无法判断', '无', '没有', '不确定', '未知', '与古诗文无关', '无具体篇目', '无法识别', '不属于任何篇目']) {
    assert.equal(normalizeConcreteProjectTitle(rejection), null, `${rejection} 不应被当作标题`);
  }
});

test('normalizeConcreteProjectTitle：真实标题不受影响', () => {
  assert.equal(normalizeConcreteProjectTitle('《赤壁赋》'), '赤壁赋');
  assert.equal(normalizeConcreteProjectTitle('一次函数'), '一次函数');
  // 「无关」只在整行就是拒绝语时才拦；标题里含「无」不会被误杀。
  assert.equal(normalizeConcreteProjectTitle('无锡小记'), '无锡小记');
});

test('normalizeProjectAuthor：去空白，空值归一为 null', () => {
  assert.equal(normalizeProjectAuthor('  李白  '), '李白');
  assert.equal(normalizeProjectAuthor(''), null);
  assert.equal(normalizeProjectAuthor(null), null);
});

test('looksLikeTitleLine：句读或超长视为散文，不可信为标题', () => {
  assert.equal(looksLikeTitleLine('出塞'), true);
  assert.equal(looksLikeTitleLine('这句诗运用了互文的手法。'), false);
  assert.equal(looksLikeTitleLine('甲'.repeat(41)), false);
});

// ─── 契约：这条规则只能有一份实现 ────────────────────────────────────────────
//
// 附件路由此前抄了一份副本，漏了 rejectionPattern——「无法归属」在那条路径上会被
// 当成真实标题建成项目。副本的代价不是重复本身，是漂移之后没人知道哪份才对。

test('附件路由复用同一份标题规则，不再自带副本', () => {
  const attachmentsPath = resolve(new URL('..', import.meta.url).pathname, '../app/api/attachments/route.ts');
  const source = readFileSync(attachmentsPath, 'utf8');

  assert.match(source, /import \{[^}]*normalizeConcreteProjectTitle[^}]*\} from '@\/lib\/project-title'/, '应导入共享的标题规则');
  assert.doesNotMatch(source, /const nonConcreteProjectTitles/, '不应再自带占位名副本');
  assert.doesNotMatch(source, /function normalizeConcreteProjectTitle/, '不应再自带归一化副本');
});
