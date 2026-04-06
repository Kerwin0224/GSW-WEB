# 模块 B：路线选择与提示词模板

## 目标

把 `grounding` 的识别结果变成可执行的结构化路由决策，并为后续生成阶段准备稳定模板入口。

## 交付内容

- `content_type × task_type × role` 的合法性判断
- 结构化流程与普通对话流程的分流
- `context_mode` 决策
- 模板注册与模板加载机制
- v2 保留任务的显式拒绝或降级

## 验收

1. `lesson_outline / question_analysis / guided_explain` 能正确分流。
2. `practice_gen / review_card / learning_summary` 不会进入 v1 正式链路。
3. 学生请求完整答案时会回退到提示梯度规则。
