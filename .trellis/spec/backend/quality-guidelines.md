# Backend Quality Guidelines

---

## Forbidden Patterns

- 禁止假设 `262144` 上下文可稳定喂全量原文
- 禁止模型输出直接写入数据库（必须经过 schema 校验）
- 禁止在 router 层执行模型推理或 SQL
- 禁止临时拼接提示词字符串，必须从模板文件加载
- 禁止跳过 `evidence_refs` 字段保存结果对象
- 禁止用简单密码实现角色切换（admin 权限必须有独立鉴权）
- 禁止联网结果覆盖本地证据结论

## Required Patterns

- 每个 LangGraph 节点是纯函数，输入输出都是 `PipelineState`
- 每次生成必须写入 `evidence_events`
- 结果对象保存前必须通过 Pydantic schema 校验
- 提示词从 `skills/` 对应模板加载，不在节点内硬编码
- 所有运行指标（耗时、格式通过率、重试率）必须打点

## Code Style

- Python 3.10+，使用 `match/case` 处理枚举分支
- 类型注解必须完整（函数参数和返回值）
- 异步函数使用 `async/await`，不混用同步阻塞调用
- 文件不超过 300 行，超过则拆分
