# Type Safety

> 前端类型安全规范。

---

## Type Organization

- 全局共享类型放在 `lib/types.ts`，必须与后端 schema 和 domain spec 对齐
- 组件本地 Props 类型紧邻组件定义
- API 响应统一在边界处用 Zod 校验

```ts
export type ContentType = "poem" | "classical_prose" | "question_set" | "unknown"
export type TaskType = "lesson_outline" | "question_analysis" | "guided_explain"
export type Role = "student" | "teacher" | "admin"
export type BloomLevel =
  | "remember"
  | "understand"
  | "apply"
  | "analyze"
  | "evaluate"
  | "create"

export type LessonOutlineResult = {
  result_type: "lesson_outline"
  title: string
  teaching_goals: string[]
  key_points: string[]
  difficult_points: string[]
  activity_flow: { step: string; description: string }[]
  evidence_refs: string[]
}

export type QuestionAnalysisResult = {
  result_type: "question_analysis"
  title: string
  question_text: string
  analysis_steps: string[]
  hint_ladder: {
    hint_1: string
    hint_2: string
    hint_3: string
    answer: string
  }
  evidence_refs: string[]
}

export type GuidedExplainResult = {
  result_type: "guided_explain"
  title: string
  current_hint_level: "hint_1" | "hint_2" | "hint_3" | "answer"
  hint_content: string
  evidence_refs: string[]
}
```

---

## Forbidden Patterns

- 禁止继续沿用 `poetry / wenyan / outline / explanation / exercise / qa` 这类旧枚举
- 禁止使用 `any`
- 禁止 `@ts-ignore`
- 禁止对 API 响应做无校验强转
