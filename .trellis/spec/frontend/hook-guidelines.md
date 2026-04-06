# Hook Guidelines

> 前端 Hook 规范。

---

## Naming Conventions

- 所有自定义 Hook 以 `use` 开头：`useTask`、`useProject`、`useExport`
- 文件名与 Hook 名一致：`useTask.ts`

---

## Custom Hook Patterns

```ts
// hooks/useTask.ts
export function useTask() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle")
  const [result, setResult] = useState<ResultObject | null>(null)

  async function runTask(input: TaskInput) {
    setStatus("running")
    try {
      const res = await api.post("/api/tasks/run", input)
      setResult(res.data)
      setStatus("done")
    } catch {
      setStatus("error")
    }
  }

  return { status, result, runTask }
}
```

---

## Data Fetching

- 使用 **SWR** 做服务端数据缓存（项目列表、会话历史）
- 一次性操作（提交任务、导出）用 `useState` + `async function`，不用 SWR
- API 调用统一走 `lib/api.ts` 封装，不在 Hook 里直接写 `fetch`

```ts
// Good
import { api } from "@/lib/api"
const res = await api.post("/api/tasks/run", input)

// Bad
const res = await fetch("/api/tasks/run", { method: "POST", body: JSON.stringify(input) })
```

---

## Common Mistakes

- Hook 里直接操作 DOM — 用 `useRef` + `useEffect`
- 在非 Hook/组件 的普通函数里调用 Hook — 违反 Rules of Hooks
- SWR key 用不稳定的对象 — 用字符串或 `null`（禁用时）
