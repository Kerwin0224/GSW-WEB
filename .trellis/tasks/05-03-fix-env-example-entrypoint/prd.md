# 修正环境示例文件入口断点

## 背景
旧 `frontend/`/`backend/` 已删除，README Quick Start 让用户在 `web` 内执行 `cp .env.local.example .env.local`，但 `web/.env.local.example` 被 `web/.gitignore` 的 `.env*` 忽略且未被 git 跟踪。根 `.env.example` 是 tracked。

## 要求
- 只做最小修改。
- 偏好方案 1：README 在 `cd web` 后使用 tracked 根 `.env.example`：`cp ../.env.example .env.local`。
- 避免新增前端 env example 重复源。
- 不提交，不回滚任何其他改动。
- 完成后运行：`grep -n "env.local.example\|\.env.example" README.md web/.gitignore .gitignore` 并报告。
