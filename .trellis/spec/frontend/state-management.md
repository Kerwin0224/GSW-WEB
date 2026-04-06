# State Management

---

## 原则

- 服务端状态（项目列表、会话历史、结果对象）使用 `SWR`
- 本地 UI 状态（联网开关、面板展开、导出弹窗）使用 `useState`
- 全局共享状态（角色、当前会话、当前项目）使用 React Context 或轻量 store
- 不引入 Redux 等重量级状态库

## 全局状态最小集合

```tsx
interface AppState {
  role: 'student' | 'teacher' | 'admin'
  webSearchEnabled: boolean
  currentSessionId: string | null
  activeProjectId: string | null
}
```

## 重要约束

- 年龄阶段 / 年级段由后端意图识别推断，前端不维护可编辑的 `gradeSpan`
- 角色切换只用于权限视图渲染；真实权限以后端 token 为准
- 所有错误返回统一为 `{ error, message, fallback? }`
