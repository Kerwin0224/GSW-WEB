# 删除旧产品路径并收口为 web

## Goal

彻底删除旧产品代码路径，让 `web/` 成为仓库唯一产品实现和运行入口，并保持已完成的 school-account-only 登录方向，不恢复任何 email 登录、`find_login_email`、`jose` 或 `cwb_token` 路径。

## What I already know

- 用户明确要求：删除旧代码路径，并将迁移期目录收口为最终 `web/` 产品目录。
- 写范围包括 legacy `frontend/`、legacy `backend/`、仅描述旧实现的旧 PRD/OMC 残留（例如 `PRD`、`.omc/`，需确认是旧栈残留或未跟踪后删除）。
- 不删除 `web/`、`.trellis/`、`AGENTS.md`、仍有价值的 docs 规范；只清理旧实现引用和迁移期命名。
- 根级配置/文档中不应再把 `frontend/` 或 `backend/` 描述为产品入口。
- 当前任务不得提交 git commit。

## Assumptions (temporary)

- `frontend/` 和 `backend/` 是旧产品代码，可整体删除。
- 根级配置和文档如仅用于旧路径启动，应更新到 `web/` 或删除旧引用。
- `.omc/` 和根 `PRD` 若仅服务旧实现，可删除。

## Open Questions

- 无阻塞问题；按用户最新明确要求执行。

## Requirements

- 删除 legacy `frontend/`。
- 删除 legacy `backend/`。
- 删除确认属于旧实现残留的 `PRD`、`.omc/` 等旧栈产物。
- 清理根级配置/文档中的旧入口引用和迁移期命名，使 `web/` 成为唯一产品运行入口。
- 保持 school-account-only 登录变更：不得恢复 email 登录、`find_login_email`、`jose`、`cwb_token`。
- 修复因删除旧路径导致的构建/导入/脚本引用断裂。
- 不提交。

## Acceptance Criteria

- [ ] `frontend/` 不再存在。
- [ ] `backend/` 不再存在。
- [ ] 根文档/配置不再把旧 `frontend/` 或 `backend/` 作为产品入口。
- [ ] `web/` 仍可执行 lint/typecheck/build 的可验证子集。
- [x] 搜索确认无 email 登录、`find_login_email`、`jose`、`cwb_token` 复活。

## Definition of Done

- 删除/修改路径已汇总。
- 运行验证命令并记录结果。
- 遗留风险明确。
- 不执行 git commit。

## Out of Scope

- 不重写 `web/` 的产品功能，除非删除旧路径导致直接引用断裂。
- 不删除 Trellis/AGENTS/docs 中仍有规范价值的内容。
- 不处理无关未提交改动。

## Technical Notes

- 遵守 `/Users/kerwin/.cc-switch/skills/pua/SKILL.md` 与 Tesla 方法论。
- 遵守 `web/AGENTS.md`：修改 Next.js 相关代码前需读取相关 `node_modules/next/dist/docs/` 指南；本任务优先删除旧路径和入口引用，若触及 Next.js 代码再读具体指南。


## Completion Evidence

- Deleted legacy paths: `frontend/`, `backend/`, `.omc/`, root `PRD`.
- Updated root docs/config/scripts/GitHub guidance to make `web/` the sole product entry.
- Validation run:
  - `test ! -e frontend && test ! -e backend && test ! -e .omc && test ! -e PRD` ✅
  - `grep -RIn ... web/src` for deleted legacy auth/API/runtime patterns ✅ no hits
  - `cd web && npm run lint` ✅
  - `cd web && npm run build` ✅
- Note: `jose` remains only as a transitive package-lock dependency through `shadcn -> @modelcontextprotocol/sdk`, not as application auth code.
