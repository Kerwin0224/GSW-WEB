# V1 可直接执行后端交付

## 目标

将现有 PRD v1.0 与 `.trellis/spec/domain/*.md` 收口为一个可直接执行的后端交付任务，目标是后续 Trellis 代理无需再补需求，即可按任务实现一个可启动、可登录、可跑主链路、可导出的 FastAPI + SQLite + ChromaDB V1 系统。

## 边界

- 这次只定义 **后端可直接执行交付**，不要求同时把 `frontend/` 也推进到可用状态
- 严格遵守 v1 边界：正式结构化结果对象仍以 `lesson_outline`、`question_analysis`、`guided_explain` 为准，但本子任务主验收优先收口学生学习闭环与教师干预主链路，`lesson_outline` 不作为第一优先级阻塞项
- 不把 `practice_sheet`、`review_card`、`learning_summary` 接入默认任务流、导出或验收
- 年龄阶段由系统推断，不能把“小学 / 初中 / 高中”做成新的产品范围拆分任务
- 联网搜索属于 v1 可选能力，但默认关闭；仅作为显式补充能力，不纳入本次后端主验收

## 要解决的问题

1. 当前实现层与 spec 存在脱节：部分路由、schema、数据表仍保留旧枚举或半成品流程
2. 当前系统缺少一条从认证到生成再到保存与导出的完整后端主链路
3. 当前父任务 `03-30-v1-complete-app` 偏完整应用总交付，容易把前端、后台、管理能力和后端主链路混在一起，导致执行代理无法快速落地

## 交付内容

### 1. V1 枚举与正式任务收口
- grounding / routing / models / generate 只保留 v1 正式任务默认入口
- `content_type × task_type × role` 必须严格受 `content-task-matrix.md` 约束
- v2 保留能力显式隔离，不进入默认保存、导出和验收

### 2. 数据模型与持久化对齐
- `users`、`projects`、`sessions`、`result_objects`、`evidence_events`、`challenge_attempts`、`teacher_feedback` 与 `data-models.md` 对齐
- 兼容旧 SQLite 表结构的最小迁移或补列策略
- 所有写入使用参数化查询

### 3. 认证与账号 API
- `POST /auth/login`
- `GET /me`
- `POST /users/students`
- teacher/admin 与 student 的权限边界严格符合 spec
- remember me 与 token 时效符合 `auth-and-accounts.md`

### 4. 完整后端主管线
- grounding → routing → retrieve → generate → validate → persist
- 每一步都有结构化状态与错误码
- evidence/event 能完整记录输入、检索、生成、校验、导出等关键节点

### 5. 可直接调用的业务 API
- `POST /tasks/run`
- `GET /sessions`
- `GET /sessions/{session_id}`
- `GET /results/{result_id}`
- 必要的受限查询接口（按角色过滤）

### 6. 导出能力
- `question_analysis` Word 导出
- session export（至少含 JSON；Word 如 spec 允许则接入）
- `lesson_outline` 导出可保留接口与对象兼容，但不作为第一优先级阻塞项
- `draft` 结果不得导出

### 7. 开发态冷启动可用性
- 启动即自动 `init_db()`
- 本地开发环境下可初始化演示 admin/teacher 账号
- `uvicorn --app-dir backend app.main:app --port 8000` 后可在 Swagger 中直接演示完整链路

## 验收标准

- [ ] 后端 fresh install 后可启动，不依赖前端即可演示
- [ ] teacher/admin 能登录并创建 student
- [ ] student 能发起 `guided_explain`，teacher 能发起 `question_analysis`
- [ ] 教师干预主链路可用：至少支持复核结果、修正学生层级或给学生建议中的核心接口
- [ ] 结构化结果会经过 FLQC 校验后再保存
- [ ] `result_objects.evidence_refs` 非空时才能成为 `ready`
- [ ] `question_analysis` 或 session export 至少一条导出链路成功
- [ ] `lesson_outline` 若保留实现，不得阻塞本子任务通过
- [ ] 非法角色/任务组合会被拒绝
- [ ] v2 保留能力不会误进入默认后端验收

## 代码与规格关注点

### 重点代码范围
- `app/main.py`
- `app/auth.py`
- `app/db.py`
- `app/models.py`
- `app/pipeline.py`
- `app/exporter.py`
- `app/graph/*.py`
- `app/skills/*.py`

### 重点规格范围
- `.trellis/spec/domain/product-scope.md`
- `.trellis/spec/domain/auth-and-accounts.md`
- `.trellis/spec/domain/pipeline.md`
- `.trellis/spec/domain/content-task-matrix.md`
- `.trellis/spec/domain/result-objects.md`
- `.trellis/spec/domain/data-models.md`
- `.trellis/spec/domain/export-spec.md`

## 不在本任务直接验收范围

- `frontend/` 页面完整交互
- 管理后台的 trace / MCP / 模板管理 UI
- 全班掌握度矩阵的完整前端展示
- 更高阶运营后台与多校区能力

## 备注

这个子任务用于把父任务拆成一个“后续代理可以直接执行的后端主交付入口”。完成后，其他子任务仍可继续保留，但后续实现代理优先以本子任务作为后端落地主线。