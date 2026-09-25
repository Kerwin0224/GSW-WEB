# 部署与后端工作流（GitHub → Vercel / Supabase）

GitHub 是代码和迁移的源事实；Vercel/Supabase 的配置、部署和验证结果必须回写到仓库或发布记录，任何平台变更都要可追溯。

## 硬性约束

- **Supabase 就是云端开发：永不起本地栈。**
  **不要** `supabase start` / `db reset` / `test db` / `supabase status`，**不要** Docker，
  **不要** `npm run dev` 起服务去做后端验证。本机不维护本地 Supabase 容器栈，也不该去建。
  生产数据库只有一个真源：云端项目 `fxlfjwlwvsnjbgxmjtog`；Preview 使用独立项目或明确的只读边界。
  这条曾经被违反过：文档把「运行时验证」写成「去 Studio 粘一下」，于是 agent 把本该自己
  跑完的验证推给用户。**CLI 的 `--linked` 系列就是云端开发面，跑得动就别找别的路。**

  | 想干的事 | 云端开发面（要平台 access token，本机已登录） | 不许用 |
  | --- | --- | --- |
  | 跑任意 SQL（验证、审计、一次性数据） | `supabase db query --linked -f <file>` | Studio 手粘、本地 psql |
  | 迁移会不会推、顺序对不对 | `supabase db push --dry-run --linked` | `db reset` |
  | 本地 vs 云端迁移历史 | `supabase migration list --linked` | —— |
  | 安全/性能体检 | `supabase db advisors --linked` | —— |
  | schema / plpgsql 静态检查 | `supabase db lint --linked` | `db lint --local` |
  | 把云端 schema 拉成迁移 | ⚠️ 未验证，见下 | —— |

  **`db diff` 与 declarative schemas 在本仓不可用**：它们要起 shadow 库，会挂在 Docker 上
  （`--use-pg-delta` 也一样）。迁移**只能手写**，schema 漂移没有官方检测手段。

  `db pull --linked` 同样走 diff 引擎（migra / pg-delta），大概率与 `db diff` 一样挂住。
  **本表把它列为「未验证」而不是「可用」，也先别去试**：它会把差异写成迁移文件、
  并可能记进云端迁移历史，试错成本落在生产上。真要用，先跟用户确认。

- **全免费档**：不升级任何付费计划，不开启 Supabase Branching / Marketplace 集成。遇到可能触发计费的操作先停下告知用户。
- **`web/supabase/migrations/00000000000000_baseline_schema.sql` 只读**：schema 变更一律新增迁移文件，不修改 baseline。
- **生产与预览隔离**：生产 ref 为 `fxlfjwlwvsnjbgxmjtog`；有第二个 Free Supabase 项目时优先用于 Preview。若保持单项目，Preview 只做只读或 `BEGIN … ROLLBACK` 探针，不对生产库执行业务写入。
- **`supabase db push` 本地推不动**：它需要 GitHub secret 中的数据库密码；生产迁移只通过 `supabase-db-push` workflow 执行。
- **平台事实以官方文档为准**：Vercel、Supabase、GitHub 的控制台/API/CLI 语法先用 `find-docs` 查询；CLI 子命令先执行 `supabase <命令> --help` 核对当前参数，再运行命令。

## 日常流程

### 改 schema（新表、新列、新 RPC、新策略）

在 `web/` 下：

1. `supabase migration new <名称>`，在生成的空文件里写 SQL。

   ⚠️ **CLI 用 UTC 命名，与仓库既有的「本地时间」命名口径不一致**，生成的文件会排到既有迁移
   **之前**（例如本地 15:25 生成出 `20260916072443_…`，而最新一条是 `20260916132900_…`）。
   生成后必须改名成当前本地时间：`mv <生成名> "$(date '+%Y%m%d%H%M%S')_<名称>.sql"`，
   然后确认 `ls supabase/migrations | sort | tail -1` 就是它。

2. **在云端验证**（命令对照表见上面「硬性约束」，这里只说验证本身）。

   ⚠️ **`--dry-run` 不执行 SQL**，抓不到求值期错误——策略互相内联子查询造成的
   `infinite recursion detected in policy`、`INSERT … RETURNING` 被 SELECT 策略按语句
   开始时的快照误拒，这两类只有真跑一条语句才会暴露。**不要拿它当运行时验证。**

   ⚠️ **更隐蔽的一类：`db push` 成功 ≠ 策略对了。** push 只执行 DDL，**从不求值策略**。
   策略递归、租户谓词收窄过头（学生读不到自己的行）在 CI 全绿的情况下照样存在。
   所以**每条改动 RLS 策略的迁移，落地后必须补一次真身份查询**——见下面「探针怎么写」。

   `db query -f` 的两个行为差异，写探针时必须知道：

   - **只回最后一条语句的结果集**，中间的 `select` 与 `raise notice` 都不显示。
     所以探针要把结论写进 GUC（`set_config`），末尾用一条 `select … union all …` 汇总。
   - 探针里**不要用临时表**承接中间结果：临时表要额外 grant 给 anon，而 temp schema
     的名字（`pg_temp_43`）每个会话都不同，按 `pg_temp.x` 授权不生效，anon 一读就 42501。
   - **异常处理器里的 `set_config` 要用 `is_local = false`**：子事务回滚会把
     `is_local = true` 的 GUC 一起丢掉，夹具为什么失败就永远看不到，只剩一个下游报错。

   #### 探针怎么写（照抄这四个动作）

   1. **立身份**。`db query` 直连进来的是 `postgres`，**它会绕过 RLS，不切角色等于没测**。
      所以每个身份段必须 `set local role anon`（跑完 `reset role`），并手工注入签名头：

      ```sql
      perform set_config('request.headers', jsonb_build_object(
        'x-cwb-user-id', p_user::text,
        'x-cwb-session-signature',
        encode(hmac(subject::bytea,
                    (select value from private.runtime_secrets where name='cwb_auth_secret')::bytea,
                    'sha256'), 'hex'))::text, true);
      ```

      ⚠️ **`subject` 的算法以库里那份 `has_valid_app_session_signature` 为准**：
      `session_version = 0 ? id::text : id::text || ':' || session_version::text`。
      只签 `id` 在 `session_version ≠ 0` 时对不上 → 静默回落 `auth.uid()`（直连时是 NULL）
      → 探针全读到 0。**这会伪装成「策略收窄过头」，是最危险的一种假结论。**

   2. **自证身份**。紧接着把 `public.current_app_user_id()` 打进结果集。拿不到身份时
      后面的 0 全都是噪音，必须先看见身份再解释数字。

   3. **造对照**。只有一面的探针等于没验：`admin 读外公司 = 0` 单独成立，
      也可能只是「谁都读不到」。要同时给出**本公司 > 0** 与**夹具本人 > 0** 两个正例。
      生产是单租户时（本项目就是），在事务内现造第二个租户夹具，末尾统一 `rollback`，
      跑完核对零残留。

   4. **末尾 `rollback`**，整段只读。

   现成范例见 `.scratch/multi-space-tenancy/verify-live.sql`（二租户双向证明 + 零残留自检）。
   注意库里两条会挡住夹具的约束：`profiles.id` 有 FK 到 `auth.users`（别往 auth schema 插行，
   借真实档案），`validate_conversation_contract` 强制老师会话不能绑班、学生会话必须
   `student_chat`。

3. 类型：`src/lib/supabase/database.types.ts` 是**手写维护**的（没有 `Relationships` 键、
   `Views` 是占位、含中文业务注释与自定义别名如 `AppRole`/`Vector`/`AvatarKey`）。
   **不要用 `supabase gen types` 覆盖它**；新表新列手工补进去。

4. 迁移文件随功能代码一起 commit、push 到 main。完成标准：Action `supabase-db-push` 的 run 结论为 success（`gh run list --workflow=supabase-db-push.yml`）；失败时按日志提示用 `supabase migration repair` 对齐历史。

注意：pgcrypto 函数在 `extensions` schema 下，SQL 里写 `extensions.crypt(...)` 而非 `crypt(...)`。

### 造数据

| 数据类型 | 去处 |
|---|---|
| 每个环境都该有的演示数据 | `web/supabase/seed.sql`（演示账号密码 `demo1234`）。⚠️ 本仓不起本地栈，所以它**在本地永远不会被执行**，只在 CI/远端重放时生效 |
| 生产一次性数据 | `supabase db query --linked -f <file>.sql`，SQL 留档进 `docs/prod-data-fixes/` |
| 可重复生成的批量数据 | `web/scripts/` 下写 node 脚本 |

生产库只允许插数据；schema 变更走迁移。

⚠️ **一次性数据脚本也是云端跑的**：`docs/prod-data-fixes/` 下那些 SQL 的抬头若写
「在 Studio SQL Editor 执行」，按上面的命令跑即可，不必开浏览器。

### 新功能

1. 在本地完成代码、迁移、配置和测试；`web/` 执行测试、lint、类型检查。
2. 有迁移时先执行 `supabase db push --dry-run --linked`，再用 `db query` 跑最小探针；RLS、grant、触发器变更必须覆盖真实身份。
3. 门禁通过后直接 commit 并 push `main`；高风险变更可以临时使用分支和 PR 做复核。
4. `main` push 后观察 `ci`、Vercel Production 和 `supabase-db-push`；代码异常用 Vercel 回滚，schema 异常用新的 forward migration 修复。

## Git 工作流（单人直推）

`main` 是生产分支。本项目默认本地开发完成后直接 push `main`，不要求 PR 或审批：

| 改动类型 | 流程 |
|---|---|
| 文档、注释、单文件小修 | 本地检查后直接 commit/push `main` |
| 依赖升级、schema 迁移、多文件重构 | 本地检查、迁移 dry-run 和探针通过后直接 commit/push `main`；风险高时使用临时分支和 PR |
| 紧急修复 | 可直接 push `main`，记录 incident、原因和回滚方式 |

`main` push 会触发 CI、Vercel Production 和迁移 workflow。CI 是推送后的状态记录，不阻塞已经完成的 push；高风险变更可以临时用 PR 做额外复核。

## 生产发布（直推模式）

**push 前门禁**

| 门禁 | 命令或证据 |
|---|---|
| 测试 | `npm test` |
| 类型 | `npx tsc --noEmit` |
| lint | `npm run lint`（0 error，历史 warning 不新增） |
| 迁移顺序 | `supabase db push --dry-run --linked`（有迁移时必跑） |
| 变更图 | GitNexus `detect_changes({scope:"all"})`，不能是 partial/truncated |

**push 后观察**

1. `ci` 在 `main` 上执行测试、lint 和类型检查；失败时先修复再补推。
2. Vercel 自动构建并分配生产域名；记录 deployment URL 和 commit SHA。
3. `supabase-db-push` 使用 `production` environment 和并发锁执行迁移；失败时停止继续发布，记录 migration history。
4. 执行 `supabase migration list --linked`、`supabase db advisors --linked` 和必要的 RLS/运行时探针。
5. 抽验登录、关键读写路径、AI 请求和日志。代码异常使用 Vercel Instant Rollback；数据库、RLS、grant 和数据使用新的 forward migration 或补偿脚本。

**回滚边界**：Vercel Instant Rollback 只回滚应用代码。Supabase schema、RLS、grant 和数据不做自动 down migration，迁移必须保持 expand-compatible。

## 自动化与控制面规则

| 项 | 状态或规则 |
|---|---|
| Vercel 正式项目 | `gsw-web`，Root Directory=`web`，Framework=Next.js，main=Production，Auto-assign Custom Production Domains=开启 |
| 错误项目 | `classical-chinese-workbench` 是 Root=`/`、Framework=Other 的空壳项目；确认别名和部署归属后再断开 Git 或归档，暂不自动删除 |
| CI | `.github/workflows/ci.yml`：Node、锁文件安装、测试、lint、类型检查；不在本地运行 Next build/dev |
| 迁移 CI | `.github/workflows/supabase-db-push.yml`：Supabase CLI 固定 `2.117.0`、`production` environment、并发锁、main 触发保护 |
| GitHub secrets | `SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD`；后续可拆到 `production` environment secrets |
| Vercel 环境变量 | `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`CWB_AUTH_SECRET`；有隔离项目时 Preview/Production 使用不同 Supabase 配置，单项目模式明确记录共享凭据和只读边界 |
| 分支保护 | 允许直接 push `main`；保留禁止 force push/删除；Vercel Preview/Deployment Checks 仍待配置 |


## 工具 / 凭据缺失时的补救

| 缺什么 | 怎么补 |
|---|---|
| supabase CLI | `npm i -g supabase` |
| CLI 未登录 | 用户到 supabase.com/dashboard/account/tokens 生成 token → `supabase login --token <token>` |
| 未 link | `supabase link --project-ref fxlfjwlwvsnjbgxmjtog`（需先登录） |
| `--linked` 命令报未 link / 连不上 | `supabase link --project-ref fxlfjwlwvsnjbgxmjtog`（需先登录）；**不要**改成起本地栈 |
| `db query` 报了「只在最后一条语句」之外的怪结果 | 先确认探针没在用临时表、结论没走 GUC 汇总；见上面「探针怎么写」 |
| 想跑 `db diff` / declarative schemas | 跑不了，要 shadow 库。迁移手写，不要为它起 Docker |
| GitHub secret 缺失 | `gh secret set <NAME> --repo Kerwin0224/GSW-WEB`；DB 密码无处可查时用管理 API 重置：`PATCH https://api.supabase.com/v1/projects/<ref>/database/password`（带 access token，生成随机新密码，直接管道进 `gh secret set`，全程不回显） |
| Vercel 环境变量缺失 | `vercel env add <KEY> <environment>`，值可从 `web/.env.local` 导入（脚本只输出变量名，不回显值） |

补救完成后，把新的存放位置或轮换方式更新回本表，保持它是唯一事实来源。
