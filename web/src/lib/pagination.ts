/**
 * 分页参数的纯解析函数。放在 .ts（无 JSX）里，便于 node --test 直接单测
 * ——此前它和 Pagination 组件同在一个 .tsx，JSX 会让 strip-types 解析失败。
 */

/** 从 searchParams 取首个值。 */
export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** 从 searchParams 解析页码，非法值一律回落到第 1 页。 */
export function parsePageParam(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(firstParam(value) ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
