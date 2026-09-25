始终用中文回答我的问题！

项目所用的技术栈，若技术栈发生偏移应该告知开发者详细情况与改进方案：
前端 + 全栈框架：Next.js（App Router）+ TypeScript + Tailwind + shadcn/ui
后端 + 数据库 + Auth：Supabase
AI 能力层：Vercel AI SDK
部署：Vercel

使用 find-docs 这个 SKILL 来查询上述技术栈的官方文档，而不是凭借模型不可靠的知识库！

## 技术栈治理

**版本策略**：技术栈一律取"生态当前可用的最新版"。升级前先查目标版本与工具链的 peer 约束（`npm view <pkg> peerDependencies`），跨大版本升级后依次用 `npx tsc --noEmit`、`npm run lint`、`npm test` 验证，构建由 Vercel 预览部署兜底（前端禁止本地跑 build/dev）。

**已知版本天花板**（环境里查不出的约束，防止被误"修复"）：

- `typescript` 锁定 ^6.0 桥接线：typescript-eslint 要等 TS 7.1 的稳定程序化 API 才支持 TS 7（typescript-eslint#10940）。支持落地后升 `typescript@^7` 并重跑验证。
- ESLint 采用组合式配置（见 `web/eslint.config.mjs` 头注释），不引入 `eslint-config-next`。

**依赖审计**：每个依赖必须能在源码里找到真实引用（`rg -l "<包名>" src scripts`），零引用直接移除；shadcn 生成的模板组件无人使用时，连同其专属依赖一起删。

## 交付门禁

- **分支**：`main` 是生产分支；本项目默认在本地完成门禁后直接提交并 push `main`。高风险变更可以临时使用分支和 PR 做复核；禁止 force push 和删除分支。
- **提交前**：在 `web/` 执行 `npm ci`、`npm test`、`npm run lint`、`npx tsc --noEmit`；不把本地 `npm run dev` 或本地 production build 当验证，真实 build 由 Vercel 负责。
- **迁移**：schema 只新增 `web/supabase/migrations/<timestamp>_*.sql`，不修改 baseline，不直接改远端 Dashboard/Table Editor；push 前做 `supabase db push --dry-run`，生产由 `supabase-db-push` workflow 执行。
- **兼容性**：迁移先扩展、后使用、再清理；删除列、收紧 policy、破坏性 RLS 变更拆到后续版本，保证旧代码与新 schema 可短期共存。
- **生产顺序**：`main` push 会同时触发 Vercel 生产部署和 `supabase-db-push`；两者按 expand-compatible 约束并发，迁移失败不自动 down，使用新的 forward migration 修复。
- **环境隔离**：Vercel Preview 优先使用第二个 Free Supabase 项目；若保持单项目，Preview 只做只读或事务回滚验证，不在生产库执行业务写入。
- **回滚边界**：Vercel 回滚只回滚应用代码；Supabase schema、RLS、grant 和数据用新的 forward migration/补偿修复处理。
- **正式项目**：Vercel 生产项目唯一使用 `gsw-web`，Root Directory=`web`、Framework=Next.js；`classical-chinese-workbench` 是错误空壳项目，不得作为发布目标。

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **GSW-WEB** (3060 symbols, 7468 relationships, 263 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact analysis before editing.** Use `impact({target: "symbolName", direction: "upstream"})` (MCP) or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .` (CLI fallback); report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/GSW-WEB/context` | Codebase overview, check index freshness |
| `gitnexus://repo/GSW-WEB/clusters` | All functional areas |
| `gitnexus://repo/GSW-WEB/processes` | All execution flows |
| `gitnexus://repo/GSW-WEB/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## 发布与环境指针

**发布/迁移/预览/回滚**：先读 `docs/agents/deployment.md`；需要核对 Vercel、Supabase、GitHub、Next.js 官方能力时，再读 `docs/agents/deployment-workflow-research.md`。
