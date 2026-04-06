# Logging Guidelines

> 本项目日志规范。

---

## Library

使用 Python 标准库 `logging`，通过 `app/config.py` 统一配置 level 和 format。

---

## Log Levels

| Level | 使用场景 |
|-------|----------|
| `DEBUG` | LangGraph node 输入/输出 state（仅开发环境） |
| `INFO` | pipeline 启动/完成、导出操作、用户登录、管理员配置变更 |
| `WARNING` | 路由降级、证据不足、FLQC 校验部分字段缺失 |
| `ERROR` | 模型加载失败、DB 写入失败、未预期异常 |

---

## What to Log

- pipeline 每个阶段的耗时：`grounding / routing / retrieve / generate / validate`
- FLQC 校验结果（pass/fail + 缺失字段列表）
- 挑战升级结果（from_level / to_level / score / review_needed）
- 导出操作（session_id、格式、导出人角色）
- 管理员操作（模板版本变更、MCP 配置更新、skill 热重载）
- 模型推理异常（错误类型，不含用户输入全文）

---

## What NOT to Log

- 用户输入的原始全文
- 任何包含姓名、学号、初始密码的字段
- LLM 生成的完整输出（存 DB，不写日志）

---

## Log Format

```
[LEVEL] [module] [session_id] message extra_fields_as_kv
```
