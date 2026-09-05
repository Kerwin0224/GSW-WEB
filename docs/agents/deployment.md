# 部署与后端工作流（GitHub → Vercel / Supabase）

GitHub 是唯一 hub：代码和 schema 都从提交流出，Vercel 和 Supabase 只对 GitHub 做反应，任何一方都不脱离 Git 单独改。

## 硬性约束

- **全免费档**：不升级任何付费计划，不开启 Supabase Branching / Marketplace 集成（已评估过，见 git 历史）。遇到可能触发计费的操作（升级计划、付费 add-on、超配额）先停下告知用户。
- **`web/supabase/migrations/00000000000000_baseline_schema.sql` 只读**：它是 2026-09 从云端 dump 的真实 DDL（旧的清单式 baseline 已废弃，云端迁移历史已 repair 对齐为该 baseline）。schema 变更一律新增迁移文件。
- **Vercel 预览部署连的是生产数据库**：预览环境只做只读/轻量验证，密集写操作的测试放本地。
- **云端平台行为以官方文档为准**：Vercel / Supabase / GitHub 的控制台入口、API 端点、CLI 用法，动手前用 `find-docs` skill 查当前文档；这三家改版频繁，凭训练记忆下结论会踩坑。

## 日常流程

### 改 schema（新表、新列、新 RPC、新策略）

在 `web/` 下：

1. `supabase migration new <名称>`，在生成的空文件里写 SQL。
2. `supabase db reset` —— 完成标准：命令零报错跑完（等于本地从零重放全部迁移 + 种子数据）。
3. `supabase gen types typescript --local > src/lib/supabase/database.types.ts`。
4. 迁移文件随功能代码一起 commit、push 到 main。完成标准：Action `supabase-db-push` 的 run 结论为 success（`gh run list --workflow=supabase-db-push.yml`）；失败时按日志提示用 `supabase migration repair` 对齐历史。

注意：pgcrypto 函数在 `extensions` schema 下，SQL 里写 `extensions.crypt(...)` 而非 `crypt(...)`。

### 造数据

| 数据类型 | 去处 |
|---|---|
| 每个环境都该有的演示数据 | `web/supabase/seed.sql`（`db reset` 自动执行；演示账号密码 `demo1234`） |
| 生产一次性数据 | Supabase Studio 的 SQL Editor，执行后把 SQL 留档进仓库 |
| 可重复生成的批量数据 | `web/scripts/` 下写 node 脚本 |

生产库只允许插数据；schema 变更走迁移。

### 新功能

1. 开分支 → 写迁移 + 代码 → `db reset` 本地验证。
2. push 分支 → Vercel 自动出预览部署（链接见 PR 或 Vercel dashboard）。
3. merge main → Vercel 自动更新生产，CI 自动推送迁移。迁移先于新代码生效（当前都是加列加表，向后兼容）。

## 已固化的自动化（现状清单）

| 项 | 值 |
|---|---|
| Vercel 项目 | `gsw-web`，Root Directory=`web`，main 分支=生产 |
| 生产域名 | https://gsw-web-kerwin01130224-1532s-projects.vercel.app |
| Supabase 项目 ref | `fxlfjwlwvsnjbgxmjtog` |
| 迁移 CI | `.github/workflows/supabase-db-push.yml`（migrations 变更触发，支持 workflow_dispatch 手动跑） |
| GitHub secrets | `SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD` |
| Vercel 环境变量（手动管理） | `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`CWB_AUTH_SECRET` |

## 工具 / 凭据缺失时的补救

| 缺什么 | 怎么补 |
|---|---|
| supabase CLI | `npm i -g supabase` |
| CLI 未登录 | 用户到 supabase.com/dashboard/account/tokens 生成 token → `supabase login --token <token>` |
| 未 link | `supabase link --project-ref fxlfjwlwvsnjbgxmjtog`（需先登录） |
| `db reset` 起不来 | 需要 Docker Desktop 在运行；先 `supabase start` |
| GitHub secret 缺失 | `gh secret set <NAME> --repo Kerwin0224/GSW-WEB`；DB 密码无处可查时用管理 API 重置：`PATCH https://api.supabase.com/v1/projects/<ref>/database/password`（带 access token，生成随机新密码，直接管道进 `gh secret set`，全程不回显） |
| Vercel 环境变量缺失 | `vercel env add <KEY> <environment>`，值可从 `web/.env.local` 导入（脚本只输出变量名，不回显值） |

补救完成后，把新的存放位置或轮换方式更新回本表，保持它是唯一事实来源。
