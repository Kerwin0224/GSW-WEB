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

## Git 工作流（与 Vercel 配合）

main = 生产分支，改动按风险分流：

| 改动类型 | 流程 |
|---|---|
| 文档、注释、单文件小修 | 直接 commit 到 main 并 push；生产部署即构建验证，异常时 Vercel 控制台 Instant Rollback 回退 |
| 依赖升级、schema 迁移、多文件重构 | 短命分支 + PR：Vercel 预览验证构建（预览 **仅由 PR 触发**，项目 Preview Deployments 设为 Only PRs，只推分支不触发），预览 READY 后 merge，生产自动更新 |

注意：预览部署域有 Vercel SSO 保护，外部 curl 探活只能在生产域做；预览的 READY 状态即构建验证。

## 上线流程（固定三段，按顺序执行）

**第一段：提交前自动门禁（agent 在本地完成，不过全不提交）**

| 门禁 | 命令 |
|---|---|
| 测试 | `npm test` |
| 类型 | `npx tsc --noEmit` |
| lint | `npm run lint`（0 error，历史 warning 不新增） |
| 迁移重放 | `supabase db reset`（有迁移时必跑） |
| 变更图 | GitNexus `detect_changes({scope:"all"})`，不是 clean 不提交 |

**第二段：预览人工验证（PR READY 后，验证清单给到用户）**

预览连生产库且有 SSO，AI 网关真实链路与交互手感无法自动化，必须登录用户照清单点一遍。清单要求具体到动作和期望结果（例：空白入口问 X → 应归入《Y》）。注意：同一分支反复推送时预览 URL 不变，需强制刷新。

**第三段：merge 后生产观察（容易漏，固定三件事）**

1. 确认 `gh run list --workflow=supabase-db-push.yml` 结论 success（迁移先于代码生效）。
2. 在生产域按同一份清单抽验关键路径。
3. 查 `app_log_events`（Supabase）有无新增 error / 关键 fallback 事件；异常时 Vercel Instant Rollback 秒回代码，schema 变更保持向后兼容（加列加表），无需回滚库。

## 已固化的自动化（现状清单）

| 项 | 值 |
|---|---|
| Vercel 项目 | `gsw-web`，Root Directory=`web`，main 分支=生产 |
| 生产域名 | https://gsw-web-kerwin01130224-1532s-projects.vercel.app |
| 自定义域名 | https://www.04251688.xyz（裸域 308 跳转到 www）；DNS 在 Cloudflare 免费档，两条 CNAME（`@` 和 `www`）指向 `f3c6fcae1a46b090.vercel-dns-017.com`，均 DNS only（灰色云，勿开代理）；域名在 Vercel 侧经 TXT 验证使用（曾被旧账号占用，占用权未释放，续期/迁移见 Vercel 工单通道） |
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
