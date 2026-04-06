# 开源复用模块映射 v1

状态：工作稿  
适用范围：`classical-chinese-workbench` 当前三端实现  
上位约束：以 `docs/PRODUCT_SOURCE_OF_TRUTH.md`、`docs/prd_decision_v1.md`、`docs/demo_scope_v1.md` 为准

## 1. 结论

当前不建议直接 fork 一个完整开源产品作为主壳。
更合适的方式是保留现有仓库分层，然后按模块复用成熟开源项目的页面结构、交互方式和局部组件。

当前仓库主干：

- 前端：`Next.js app router + student / teacher / admin workspace`
- 后端：`FastAPI + LangGraph + skills registry + MCP bridge + retrieval`
- 治理与外接：`Langfuse / Grok Search / UltraRAG / export`

复用策略：

- 学生端：优先借学习工作台和资料流
- 教师端：优先借 review workflow 和 challenge 配置结构
- 管理员端：优先借 trace、capability control、data workspace
- 后端：优先借 tool/runtime integration 模式，不替换主运行时

## 2. 复用原则

### 2.1 允许

- 模块级复用
- 小范围 fork-and-modify
- 借页面骨架、信息架构、状态表达
- 借后端 integration pattern、provider registry、tool bridge 思路

### 2.2 不建议

- 整站照搬
- 把第三方产品外壳直接作为主产品
- 为了复用前端而替换当前后端主运行时
- 把通用 AI 平台首页直接伪装成学校产品首页

## 3. 三端候选映射

### 3.1 学生端

主要目标：

- 从“聊天页”升级为“学习工作台”
- 强化资料上传、引用、RAG、Bloom 提示、挑战入口

建议参考：

- `DeepStudent`：学习工作台布局和资料-任务联动
- `AnythingLLM`：资料侧栏、上传区、引用卡片、workspace 感
- `Open WebUI`：能力开关和工具入口表达

落点：

- `frontend/components/dashboard/StudentWorkspace.tsx`
- `frontend/app/question/page.tsx`
- `frontend/app/challenge/page.tsx`
- `backend/app/file_extract.py`
- `backend/app/graph/retrieve.py`

建议优先补的模块：

- `ResourceDock`
- `CitationCard`
- `UploadQueue`
- 学生页右侧常驻状态区

### 3.2 教师端

主要目标：

- 把教师端做成 review 和干预工作台，而不是课程站
- 明确 review 状态机和 challenge 配置流程

建议参考：

- `Moodle`：marking workflow / review state machine
- `TAO Community Edition`：challenge authoring 和测评结构
- `Open edX`：教师工作台分区方式

落点：

- `frontend/components/dashboard/TeacherWorkspace.tsx`
- `frontend/app/teacher/review/page.tsx`
- `backend/app/main.py`
- `backend/app/exporter.py`

建议优先补的模块：

- review queue
- learner trajectory drill-down
- challenge authoring workspace
- review 状态标签和流转动作

### 3.3 管理员端

主要目标：

- 把管理员端分成 capability control、trace、data workspace 三块
- 让能力配置不只是静态页面，而能映射到 runtime

建议参考：

- `Langfuse`：trace summary、run detail、timeline、eval 视图
- `Open WebUI`：provider / tool / capability control
- `AnythingLLM`：skills / tools / workspace settings
- `Label Studio`：样本列表、详情、标注工作台
- `Argilla`：偏好数据与反馈数据结构

落点：

- `frontend/components/dashboard/AdminSkillsWorkspace.tsx`
- `frontend/components/dashboard/AdminTraceWorkspace.tsx`
- `frontend/components/dashboard/AdminTemplatesWorkspace.tsx`
- `backend/app/mcp/`
- `backend/app/langfuse_client.py`
- `backend/app/main.py`

建议优先补的模块：

- provider health 和 tool registry
- MCP / Grok / UltraRAG 能力开关
- trace detail panel
- data workspace

## 4. 现有代码映射

### 4.1 前端

- `StudentWorkspace.tsx`：学生主工作台
- `TeacherWorkspace.tsx`：教师 review 工作台
- `AdminSkillsWorkspace.tsx`：管理员 capability control
- `AdminTraceWorkspace.tsx`：管理员 trace 工作台
- `AdminTemplatesWorkspace.tsx`：管理员模板与配置入口
- `frontend/lib/api.ts`：前后端接口收口
- `frontend/lib/types.ts` / `frontend/lib/validators.ts`：前端类型和校验边界

### 4.2 后端

- `backend/app/graph/*`：LangGraph 编排主干
- `backend/app/pipeline.py`：任务执行与 trace 串联
- `backend/app/main.py`：管理端与运行端 API 收口
- `backend/app/skills/*`：skills 定义和注册
- `backend/app/mcp/*`：provider registry、runtime bridge、tool integration
- `backend/app/graph/retrieve.py`：检索与 embedding / UltraRAG 路径
- `backend/app/file_extract.py`：文件提取
- `backend/app/exporter.py`：导出
- `backend/app/langfuse_client.py`：trace / observability

## 5. 建议的任务顺序

1. 学生端资源工作台
2. 管理员 capability workspace
3. MCP runtime bridge
4. 教师 review state machine
5. 管理员 data workspace

## 6. 参考项目

- [DeepStudent](https://github.com/helixnow/deep-student)
- [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm)
- [Open WebUI](https://github.com/open-webui/open-webui)
- [Moodle Assignment settings](https://docs.moodle.org/en/Assignment_settings)
- [Open edX Educators](https://docs.openedx.org/en/latest/educators/index.html)
- [TAO Community Edition](https://www.taotesting.com/products/community-edition/)
- [Langfuse](https://github.com/langfuse/langfuse)
- [Label Studio](https://github.com/HumanSignal/label-studio)
- [Argilla](https://github.com/argilla-io/argilla)
- [LangChain MCP Adapters](https://github.com/langchain-ai/langchain-mcp-adapters)
