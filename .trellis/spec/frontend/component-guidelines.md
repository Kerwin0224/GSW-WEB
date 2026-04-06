# Component Guidelines

---

## Component Rules

- 每个组件单一职责，不超过 150 行
- Props 必须有 TypeScript 类型定义
- 结果展示区必须处理六种状态：`loading / error / empty / result / review_pending / exported`
- 不在组件内直接调用 fetch，通过 `lib/api.ts` 或 custom hook

## 页面状态处理模板

```tsx
if (status === 'loading') return <Skeleton />
if (status === 'error') return <ErrorCard error={error} />
if (status === 'empty') return <EmptyGuide />
if (status === 'review_pending') return <ResultCard result={result} badge="待复核" exportDisabled />
if (status === 'exported') return <ResultCard result={result} badge="已导出" />
return <ResultCard result={result} />
```

## Bloom 阶段展示

中文展示名在 `lib/constants.ts` 中统一映射，组件内只引用常量，不硬编码字符串：

```ts
// lib/constants.ts
export const BLOOM_LABELS: Record<string, string> = {
  remember: '初识',
  understand: '理解',
  apply: '掌握',
  analyze: '深析',
  evaluate: '鉴赏',
  create: '融会',
}
```

## Forbidden Patterns

- 禁止修改 `components/ui/` 下的 shadcn 源文件
- 禁止在组件内硬编码 API URL
- 禁止跳过任何一种页面状态的处理
