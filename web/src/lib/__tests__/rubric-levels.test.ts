import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BLOOM_LEVEL_INFO } from '../bloom-levels.ts';
import {
  consecutiveAchievedLevel,
  getRubricLevels,
  highestAchievedLevel,
  PLATFORM_RUBRIC_LEVELS,
} from '../rubric-levels.ts';

type SupabaseArg = Parameters<typeof getRubricLevels>[0];

function fakeSupabase(result: { data: unknown; error: { message: string } | null }): SupabaseArg {
  const chain = {
    select: () => chain,
    or: () => chain,
    order: () => Promise.resolve(result),
  };
  return { from: () => chain } as unknown as SupabaseArg;
}

test('平台默认回落值与 bloom-levels 的六层同名同序', () => {
  assert.deepEqual(PLATFORM_RUBRIC_LEVELS.map((level) => level.levelKey), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
  assert.deepEqual(PLATFORM_RUBRIC_LEVELS.map((level) => level.ordinal), [1, 2, 3, 4, 5, 6]);
  for (const level of PLATFORM_RUBRIC_LEVELS) {
    assert.equal(level.name, BLOOM_LEVEL_INFO[level.ordinal as 1].name);
    assert.equal(level.requiresPrevious, level.ordinal > 1);
  }
});

test('已通过集合的 max：跳层合法，L3 与 L5 通过就是 L5', () => {
  const achieved = new Set([3, 5]);

  assert.equal(highestAchievedLevel(achieved)?.levelKey, 'L5');
  assert.equal(consecutiveAchievedLevel(achieved), undefined, '连续前缀遇断层即停，L1 未通过时前缀为空');
});

test('连续前缀：逐级通过时与 max 一致，断层时停在断层前', () => {
  const sequential = new Set([1, 2, 3]);
  assert.equal(highestAchievedLevel(sequential)?.levelKey, 'L3');
  assert.equal(consecutiveAchievedLevel(sequential)?.levelKey, 'L3');

  const gapped = new Set([1, 2, 4]);
  assert.equal(highestAchievedLevel(gapped)?.levelKey, 'L4');
  assert.equal(consecutiveAchievedLevel(gapped)?.levelKey, 'L2');
});

test('没有通过记录时两种算法都返回空', () => {
  assert.equal(highestAchievedLevel(new Set()), undefined);
  assert.equal(consecutiveAchievedLevel(new Set()), undefined);
});

test('空间级 > 学校级 > 平台默认，同键覆盖', async () => {
  const levels = await getRubricLevels(fakeSupabase({
    data: [
      { school_id: null, space_id: null, level_key: 'L1', ordinal: 1, name: '记忆', operation: 'o1', hint: null, requires_previous: false, enabled: true },
      { school_id: null, space_id: null, level_key: 'L2', ordinal: 2, name: '理解', operation: 'o2', hint: null, requires_previous: true, enabled: true },
      { school_id: 'school-1', space_id: null, level_key: 'L1', ordinal: 1, name: '识记', operation: 's1', hint: null, requires_previous: false, enabled: true },
      { school_id: 'school-1', space_id: 'space-1', level_key: 'L1', ordinal: 1, name: '再现', operation: 'sp1', hint: null, requires_previous: false, enabled: true },
    ],
    error: null,
  }), 'space-1', 'school-1');

  assert.equal(levels.length, 2);
  assert.equal(levels[0].name, '再现', '空间级压过学校级与平台默认');
  assert.equal(levels[0].origin, 'space');
  assert.equal(levels[1].name, '理解', '空间没配的层仍用平台默认');
});

test('层级表读不到时回落平台默认，不让挑战确认链路断在这里', async () => {
  const levels = await getRubricLevels(fakeSupabase({ data: null, error: { message: 'boom' } }), 'space-1', 'school-1');

  assert.deepEqual(levels, PLATFORM_RUBRIC_LEVELS);
});

test('读得到但全被停用时也回落平台默认，不返回空阶梯', async () => {
  const levels = await getRubricLevels(fakeSupabase({
    data: [{ school_id: 'school-1', space_id: null, level_key: 'L1', ordinal: 1, name: 'x', operation: 'o', hint: null, requires_previous: false, enabled: false }],
    error: null,
  }), null, 'school-1');

  assert.deepEqual(levels, PLATFORM_RUBRIC_LEVELS);
});
