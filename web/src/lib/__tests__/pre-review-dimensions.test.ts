import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildIssueLabelSchema,
  loadReviewDimensions,
  matchDimensionKey,
  mergeReviewDimensions,
  renderDimensionsPromptFragment,
  type PreReviewDimension,
  type ReviewDimensionSource,
} from '../pre-review-dimensions.ts';

type SupabaseArg = Parameters<typeof loadReviewDimensions>[0];

function dimension(overrides: Partial<ReviewDimensionSource> & Pick<ReviewDimensionSource, 'labelKey'>): ReviewDimensionSource {
  return {
    displayName: overrides.labelKey,
    criteria: `${overrides.labelKey} 判定说明`,
    promptFragment: '',
    defaultSeverity: 'medium',
    sortOrder: 100,
    enabled: true,
    origin: 'platform',
    ...overrides,
  };
}

/** 只实现用到的那两个链式方法：from().select().or().order() 收敛成一个 thenable。 */
function fakeSupabase(result: { data: unknown; error: { message: string } | null }): SupabaseArg {
  const chain = {
    select: () => chain,
    or: () => chain,
    order: () => Promise.resolve(result),
  };
  return { from: () => chain } as unknown as SupabaseArg;
}

test('本校同键维度覆盖平台默认，而不是追加一条', () => {
  const merged = mergeReviewDimensions([
    dimension({ labelKey: 'concept_error', displayName: '概念错误', sortOrder: 10 }),
    dimension({ labelKey: 'concept_error', displayName: '概念讲错', origin: 'school', sortOrder: 10 }),
    dimension({ labelKey: 'factual_error', displayName: '事实错误', sortOrder: 30 }),
  ]);

  assert.equal(merged.length, 2, '同键覆盖后不应出现两条');
  assert.equal(merged[0].displayName, '概念讲错');
  assert.equal(merged[0].origin, 'school');
  assert.equal(merged[1].labelKey, 'factual_error');
});

test('本校停用某维度会把它从生效清单里挤掉', () => {
  const merged = mergeReviewDimensions([
    dimension({ labelKey: 'concept_error', sortOrder: 10 }),
    dimension({ labelKey: 'concept_error', origin: 'school', enabled: false }),
    dimension({ labelKey: 'guidance_issue', sortOrder: 60 }),
  ]);

  assert.deepEqual(merged.map((item) => item.labelKey), ['guidance_issue']);
});

test('本校独有的稳定键是追加进来的', () => {
  const merged = mergeReviewDimensions([
    dimension({ labelKey: 'concept_error', sortOrder: 10 }),
    dimension({ labelKey: 'unit_dimension_error', origin: 'school', sortOrder: 15 }),
  ]);

  assert.deepEqual(merged.map((item) => item.labelKey), ['concept_error', 'unit_dimension_error']);
});

test('读表失败降级成「没有维度 + 自由标签」，不抛错也不返回半份数据', async () => {
  const result = await loadReviewDimensions(fakeSupabase({ data: null, error: { message: 'boom' } }), 'school-1');

  assert.equal(result.degraded, true);
  assert.deepEqual(result.dimensions, []);
  assert.equal(renderDimensionsPromptFragment(result.dimensions), '', '没有维度时提示词片段必须是空串，让调用方走兜底');
  assert.equal(buildIssueLabelSchema(result.dimensions).parse('模型自己写的说法'), '模型自己写的说法', '读不到维度时标签必须是自由文本');
});

test('维度为空时 zod 不约束取值，有维度时把标签钉在稳定键上', () => {
  const dimensions: PreReviewDimension[] = mergeReviewDimensions([
    dimension({ labelKey: 'concept_error', sortOrder: 10 }),
    dimension({ labelKey: 'misaligned', sortOrder: 50 }),
  ]);
  const schema = buildIssueLabelSchema(dimensions);

  assert.equal(schema.parse('concept_error'), 'concept_error');
  assert.equal(schema.safeParse('依据不足').success, false, '不在清单里的标签必须被 schema 判非法');
});

test('提示词片段逐条给出稳定键、显示名与判定说明', () => {
  const fragment = renderDimensionsPromptFragment([
    dimension({ labelKey: 'concept_error', displayName: '概念错误', promptFragment: '讲错概念或术语。', criteria: '长说明' }),
  ]);

  assert.match(fragment, /- concept_error（概念错误）：讲错概念或术语。/);
  assert.doesNotMatch(fragment, /长说明/, '给了给模型的说明时不再重复租户的长说明');
});

test('没有 prompt_fragment 时退回判定说明', () => {
  const fragment = renderDimensionsPromptFragment([dimension({ labelKey: 'concept_error', displayName: '概念错误', criteria: '把定义讲错' })]);

  assert.match(fragment, /concept_error（概念错误）：把定义讲错/);
});

test('旧标签按稳定键或显示名归类，认不出来返回 null', () => {
  const dimensions = mergeReviewDimensions([
    dimension({ labelKey: 'concept_error', displayName: '概念错误' }),
    dimension({ labelKey: 'evidence_misuse', displayName: '依据误用' }),
  ]);

  assert.equal(matchDimensionKey('concept_error', dimensions), 'concept_error');
  assert.equal(matchDimensionKey(' 依据误用 ', dimensions), 'evidence_misuse');
  assert.equal(matchDimensionKey('依据不足', dimensions), null);
  assert.equal(matchDimensionKey('', dimensions), null);
});

test('租户维度按稳定键读出来并按 sort_order 排序', async () => {
  const result = await loadReviewDimensions(fakeSupabase({
    data: [
      { school_id: null, label_key: 'factual_error', display_name: '事实错误', criteria: 'c', default_severity: 'high', prompt_fragment: 'p', sort_order: 30, enabled: true },
      { school_id: 'school-1', label_key: 'concept_error', display_name: '概念讲错', criteria: 'c2', default_severity: 'low', prompt_fragment: '', sort_order: 10, enabled: true },
    ],
    error: null,
  }), 'school-1');

  assert.equal(result.degraded, false);
  assert.deepEqual(result.dimensions.map((item) => item.labelKey), ['concept_error', 'factual_error']);
  assert.equal(result.dimensions[0].displayName, '概念讲错');
  assert.equal(result.dimensions[0].defaultSeverity, 'low');
});
