# Frontend Quality Guidelines

> 前端代码质量标准。

---

## Forbidden Patterns

| 禁止 | 原因 |
|------|------|
| 组件里直接 fetch | 放到 hooks/ |
| 使用 `any` | 用具体类型或 `unknown` |
| `@ts-ignore` | 修根本类型问题 |
| 内联 style 做布局 | 用 Tailwind |
| 直接修改 `components/ui/` 里的 shadcn 组件 | 会被 shadcn CLI 覆盖；改在业务组件层封装 |
| 在非 Hook/组件里调用 Hook | 违反 Rules of Hooks |

---

## Required Patterns

- 所有 API 调用经过 `lib/api.ts`
- 服务端数据用 SWR 管理，不手动 `useState` 存服务端数据
- 动态 className 用 `cn()` 而非字符串拼接
- API 响应在边界处用 Zod 校验

---

## Testing Requirements

- v1 最低要求：关键 Hook（`useTask`、`useExport`）有单元测试（mock `lib/api.ts`）
- 复杂组件（`TaskPanel`、`ReviewPanel`）有渲染测试
- 不测 shadcn/ui 基础组件

---

## Code Review Checklist

- [ ] 数据获取是否在 Hook 里，组件只做渲染？
- [ ] 有没有用 `any` 或 `@ts-ignore`？
- [ ] 有没有直接修改 `components/ui/`？
- [ ] 新 API 响应类型是否加到 `lib/types.ts`？
- [ ] 写操作后有没有 `mutate` 刷新 SWR 缓存？
