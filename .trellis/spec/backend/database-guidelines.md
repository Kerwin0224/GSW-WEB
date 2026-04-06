# Database Guidelines

---

## SQLite — 结构化存储

- 数据库文件：`data/db.sqlite`
- 连接管理：`app/db.py` 统一创建连接，使用 `sqlite3`，不引入 ORM
- 所有表在 `app/db.py` 的 `init_db()` 或后续 migration 中创建
- 写操作必须使用参数化查询（`?` 占位符），禁止字符串拼接 SQL

### v1 核心表

| 表名 | 说明 |
|------|------|
| `users` | admin / teacher / student 账号 |
| `projects` | 学习项目 |
| `sessions` | 任务会话 |
| `result_objects` | 结构化结果对象 |
| `evidence_events` | 证据事件（含 bloom_level、error_type 等）|
| `challenge_attempts` | 挑战升级记录 |
| `teacher_feedback` | 教师建议 |

字段定义见 `spec/domain/data-models.md`，以该文件为准。

### Forbidden Patterns

- 禁止在 router 层直接执行 SQL，必须封装为函数
- 禁止不带 `WHERE` 的 `UPDATE` / `DELETE`
- 禁止存储明文密码或敏感个人信息
- 禁止用 `grade_span` 代替 `owner_id` / `teacher_id` 等真实关系字段
- `evidence_refs` 字段必须在结果对象写入时同时写入，不得事后补填

---

## ChromaDB — 向量存储

- 数据目录：`data/chroma/`
- Collection 名：`slm_docs`
- Embedding 模型：`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`（本地，离线）
- 检索时必须按 `content_type` 和 `project_id` 过滤，不做全库检索
- Chunk 大小：512 tokens，overlap 64 tokens

### Forbidden Patterns

- 禁止把超长原文整段存入 ChromaDB，必须先分块
- 禁止在生成时跳过检索步骤直接喂全文给模型
