import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  BLOOM_LEVELS,
  BLOOM_LEVELS_DESC,
  BLOOM_LEVEL_INFO,
  bloomLevelTaskLine,
  formatBloomLevelCriteria,
  isBloomLevel,
  toBloomLevel,
} from '../bloom-levels.ts';

test('六层齐备且编号连续', () => {
  assert.deepEqual([...BLOOM_LEVELS], [1, 2, 3, 4, 5, 6]);
  for (const level of BLOOM_LEVELS) {
    assert.equal(BLOOM_LEVEL_INFO[level].level, level);
    assert.ok(BLOOM_LEVEL_INFO[level].name.length > 0);
    assert.ok(BLOOM_LEVEL_INFO[level].operation.length > 0);
  }
});

test('降序常量与升序相反（界面从上往下是六层塔）', () => {
  assert.deepEqual(BLOOM_LEVELS_DESC, [6, 5, 4, 3, 2, 1]);
});

test('isBloomLevel / toBloomLevel 宽进严出', () => {
  assert.equal(isBloomLevel(3), true);
  assert.equal(isBloomLevel(0), false);
  assert.equal(isBloomLevel(7), false);
  assert.equal(isBloomLevel('3'), false);
  assert.equal(isBloomLevel(null), false);
  assert.equal(toBloomLevel(5), 5);
  assert.equal(toBloomLevel(null), undefined);
  assert.equal(toBloomLevel(99), undefined);
});

test('bloomLevelTaskLine 未知层级退回通用要求', () => {
  assert.ok(bloomLevelTaskLine(1).includes('找出'));
  assert.ok(bloomLevelTaskLine(6).includes('仿写'));
  assert.ok(bloomLevelTaskLine(0).includes('清楚、具体'));
  assert.ok(bloomLevelTaskLine(99).includes('清楚、具体'));
});

test('formatBloomLevelCriteria 渲染成「N 名称：操作」六行', () => {
  const lines = formatBloomLevelCriteria().split('\n');
  assert.equal(lines.length, 6);
  assert.ok(lines[0].startsWith('1 记忆：'));
  assert.ok(lines[5].startsWith('6 创造：'));
});

// ─── 抽象的口径：层级只描述认知操作，不描述操作对象 ──────────────────────────
//
// 此前六层被分别写了四遍，每遍都夹带学科内容（「记忆=背诵诗句」「分析=意象关系」），
// 数学班的 L1 会被告知去背诵诗句。这些断言守住「不假设学科」这条线。

test('六层文案不含任何学科内容', () => {
  const forbidden = ['古诗文', '文言文', '诗句', '意象', '篇目', '作者', '背诵'];
  for (const level of BLOOM_LEVELS) {
    const info = BLOOM_LEVEL_INFO[level];
    for (const word of forbidden) {
      assert.ok(!info.operation.includes(word), `L${level} operation 不应出现「${word}」`);
      assert.ok(!info.hint.includes(word), `L${level} hint 不应出现「${word}」`);
    }
  }
});

test('同一层级的操作描述在两处提示词语境下都读得通', () => {
  // 判定口径是「N 名称：操作」，出题要求是「当前层级任务重点：操作」——
  // operation 必须是不带主语的动词短语，两种拼法都不出现悬空的主语或「能」。
  for (const level of BLOOM_LEVELS) {
    const operation = BLOOM_LEVEL_INFO[level].operation;
    assert.ok(!operation.startsWith('能'), `L${level} operation 不应以「能」开头`);
    assert.ok(!operation.startsWith('让学生'), `L${level} operation 不应自带主语`);
  }
});

// ─── 契约：六层只能有一份定义 ────────────────────────────────────────────────

test('提示词与界面都从 bloom-levels 派生，不再各自写死六层', () => {
  // new URL('..') 从 __tests__/x.test.ts 上溯一级就是 src/lib/。
  const libRoot = new URL('..', import.meta.url).pathname;
  const sources = {
    'classification-prompts.ts': readFileSync(resolve(libRoot, 'classification-prompts.ts'), 'utf8'),
    'challenge-prompts.ts': readFileSync(resolve(libRoot, 'challenge-prompts.ts'), 'utf8'),
  };

  for (const [name, source] of Object.entries(sources)) {
    assert.match(source, /from '\.\/bloom-levels\.ts'/, `${name} 应从 bloom-levels 导入层级定义`);
  }
  // 出题要求与判定口径都来自唯一真源，不再有本地的 switch/case 或手抄清单。
  assert.doesNotMatch(sources['challenge-prompts.ts'], /case 1:/, 'challenge-prompts 不应再自带六层 switch');
  assert.doesNotMatch(sources['classification-prompts.ts'], /1 记忆=/, 'classification-prompts 不应再手抄六层清单');
});
