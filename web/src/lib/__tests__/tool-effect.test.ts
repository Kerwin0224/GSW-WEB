import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyToolEffect, TOOL_EFFECT_LABEL } from '../tool-effect.ts';

test('写操作模式先于只读模式判定', () => {
  // save_search_result 这类名字里同时有 read 和 save；先命中哪个决定了结论对不对。
  assert.equal(classifyToolEffect('save_search_result'), 'write');
  assert.equal(classifyToolEffect('create_document'), 'write');
  assert.equal(classifyToolEffect('delete_file'), 'write');
  assert.equal(classifyToolEffect('web_search'), 'read');
  assert.equal(classifyToolEffect('fetch_page'), 'read');
});

test('认不出来的工具不冒充只读', () => {
  // 把可能写数据的工具标成只读，比说「不知道」危险得多。
  assert.equal(classifyToolEffect('mystery_42'), 'unknown');
  assert.equal(TOOL_EFFECT_LABEL[classifyToolEffect('mystery_42')], '未识别');
});
