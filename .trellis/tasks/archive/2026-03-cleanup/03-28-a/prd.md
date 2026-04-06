# 模块 A：内容识别与基础枚举

## 目标

实现 COMPASS 管线第一步 `Fground`，识别用户输入的内容类型、任务类型和基础角色上下文，并完成 v1 主管线的基础枚举与数据库初始化。

## 交付内容

### 1. `app/config.py`

- `MODEL_PATH = "models/GSW-Qwen3-4B-20251205-q4_k_m.gguf"`
- `DB_PATH = "data/db.sqlite"`
- `CHROMA_DIR = "data/chroma"`
- `EXPORTS_DIR = "exports"`

### 2. `app/graph/state.py`

定义 `PipelineState` TypedDict，至少覆盖：

- `raw_input`
- `content_type`：`poem / classical_prose / question_set / unknown`
- `task_type`：`lesson_outline / question_analysis / guided_explain`
- `role`：`student / teacher / admin`
- `age_stage` 或与之等价的后端推断字段
- `context_mode`：`full / lite`
- `bloom_level`
- `validation_passed`
- `error_code`
- `result_object`
- `evidence_refs`

### 3. `app/graph/grounding.py`

实现 `grounding_node(state: PipelineState) -> PipelineState`：

- 识别 `content_type`
- 识别 `task_type`，模糊时默认 `guided_explain`
- 识别年龄阶段（后端推断，前端不暴露年级下拉）
- 当 `content_type == unknown` 时设置 `error_code = ERR_UNRECOGNIZED_CONTENT`

### 4. `app/db.py`

实现 `init_db()`，初始化 v1 所需核心表。

### 5. `app/main.py`

- lifespan 中调用 `init_db()`
- 暴露 `GET /health -> {"status": "ok"}`

## v1 边界

- `practice_gen / review_card / learning_summary` 不属于 v1 默认任务，不应出现在模块 A 的正式枚举和默认路由中
- `context_mode = lite` 不能再由 `review_card` 驱动，应由后续路由和任务规则决定

## 验收标准

- `from app.graph.grounding import grounding_node` 导入正常
- `from app.db import init_db; init_db()` 能成功创建 `data/db.sqlite`
- `uvicorn --app-dir backend app.main:app --port 8000` 启动后 `GET /health` 返回 `{"status": "ok"}`
- “床前明月光” 能识别为 `content_type=poem`
- “帮我出一道题” 这类模糊输入默认 `task_type=guided_explain`
