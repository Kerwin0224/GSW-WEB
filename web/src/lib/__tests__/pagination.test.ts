import assert from 'node:assert/strict';
import { test } from 'node:test';

import { firstParam, parsePageParam } from '../pagination.ts';

test('parsePageParam：非法输入一律回落到第 1 页', () => {
  assert.equal(parsePageParam(undefined), 1);
  assert.equal(parsePageParam(''), 1);
  assert.equal(parsePageParam('0'), 1);
  assert.equal(parsePageParam('-3'), 1);
  assert.equal(parsePageParam('abc'), 1);
  assert.equal(parsePageParam('1.5'), 1);
  assert.equal(parsePageParam('Infinity'), 1);
});

test('parsePageParam：合法页码原样返回，数组取首个', () => {
  assert.equal(parsePageParam('1'), 1);
  assert.equal(parsePageParam('7'), 7);
  assert.equal(parsePageParam(['3', '9']), 3);
});

test('parsePageParam：超长串不 panic，回落到第 1 页', () => {
  assert.equal(parsePageParam('9'.repeat(400)), 1);
});

test('firstParam：数组取首项，普通值原样返回', () => {
  assert.equal(firstParam('value'), 'value');
  assert.equal(firstParam(['first', 'second']), 'first');
  assert.equal(firstParam(undefined), undefined);
});
