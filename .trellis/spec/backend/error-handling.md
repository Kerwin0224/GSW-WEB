# Error Handling

---

## 核心原则

- 不静默失败：所有失败必须写入运行日志
- 有降级路径：每个失败场景都有明确的回退动作（见下表）
- 不阻断用户：降级后仍给用户可用的结果，而不是空白页

## 降级策略表

| 场景 | 系统动作 | 结果 |
|------|----------|------|
| 无原文且任务要求原文 | 阻断，提示用户补充 | 不生成 |
| 检索失败 | 标记 `evidence_insufficient` | 降级为低置信草稿 |
| 模型超时 | 自动重试一次 | 再失败回退简版模板 |
| 输出不符合 schema | 重试一次 | 再失败不保存正式结果，记日志 |
| 导出失败 | 重试一次 | 再失败导出 `.txt` 纯文本 |
| Lite 模式失败 | 回退 Full 模式 | 继续执行 |
| 联网失败 | 回退本地 | 强制标注「联网失败，已切换本地模式」|
| 证据不足 + 高置信结论 | 禁止生成，请求教师复核 | 标记 `review_required` |

## Pipeline 错误码

| 错误码 | 含义 |
|--------|------|
| `ERR_UNRECOGNIZED_CONTENT` | 无法识别内容类型 |
| `ERR_MISSING_SOURCE_TEXT` | 任务需要原文但未提供 |
| `ERR_RETRIEVAL_FAILED` | ChromaDB 检索失败 |
| `ERR_GENERATION_TIMEOUT` | 模型生成超时 |
| `ERR_SCHEMA_VALIDATION` | 输出不符合 schema |
| `ERR_EXPORT_FAILED` | 导出失败 |
| `ERR_EVIDENCE_INSUFFICIENT` | 证据不足 |

## FastAPI 异常处理

- 使用 `@app.exception_handler` 统一捕获，返回结构化 JSON
- 格式：`{"error": "ERR_CODE", "message": "...", "fallback": "..."}`
- 500 错误不暴露 traceback 给前端，写入日志文件
