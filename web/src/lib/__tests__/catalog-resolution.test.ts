import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveCatalogIdForTitle } from '../catalog-path.ts';

const nodes = [
  { id: 'n1', path: '语文' },
  { id: 'n2', path: '语文 / 高一' },
  { id: 'n3', path: '语文 / 高一 / 文言文' },
  { id: 'n4', path: '语文 / 高一 / 文言文 / 赤壁赋' },
  { id: 'n5', path: '数学 / 初一 / 函数' },
];

test('resolveCatalogIdForTitle：命中任一层即可归属', () => {
  assert.equal(resolveCatalogIdForTitle('赤壁赋', nodes), 'n4');
  assert.equal(resolveCatalogIdForTitle('函数', nodes), 'n5');
});

test('resolveCatalogIdForTitle：取最具体的节点（最长路径优先）', () => {
  // "文言文" 同时命中 n3 与 n4（n4 末层包含它），应选更具体的 n3 本身，
  // 而不是把整个篇目名当层级。此处二者都含该层，取最长路径。
  assert.equal(resolveCatalogIdForTitle('文言文', nodes), 'n4');
});

test('resolveCatalogIdForTitle：大小写与空白不敏感', () => {
  assert.equal(resolveCatalogIdForTitle('  赤壁赋  ', nodes), 'n4');
});

test('resolveCatalogIdForTitle：匹配不上返回 null（不阻塞建项目）', () => {
  assert.equal(resolveCatalogIdForTitle('不存在的篇目', nodes), null);
  assert.equal(resolveCatalogIdForTitle('', nodes), null);
  assert.equal(resolveCatalogIdForTitle('赤壁赋', []), null);
});
