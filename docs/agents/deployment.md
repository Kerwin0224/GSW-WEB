# 部署与后端工作流（GitHub → Vercel / Supabase）

GitHub 是唯一 hub：代码和 schema 都从提交流出，Vercel 和 Supabase 只对 GitHub 做反应，任何一方都不脱离 Git 单独改。

## 硬性约束

- **Supabase 就是云端开发：永不起本地栈。**
  **不要** `supabase start` / `db reset` / `test db` / `supabase status`，**不要** Docker，
  **不要** `npm run dev` 起服务去做后端验证。本机不维护本地 Supabase 容器栈，也不该去建。
  数据库只有一个真源：云端项目 `fxlfjwlwvsnjbgxmjtog`。
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

- **全免费档**：不升级任何付费计划，不开启 Supabase Branching / Marketplace 集成（已评估过，见 git 历史）。遇到可能触发计费的操作（升级计划、付费 add-on、超配额）先停下告知用户。
- **`web/supabase/migrations/00000000000000_baseline_schema.sql` 只读**：它是 2026-09 从云端 dump 的真实 DDL（旧的清单式 baseline 已废弃，云端迁移历史已 repair 对齐为该 baseline）。schema 变更一律新增迁移文件。
- **Vercel 预览部署连的是生产数据库**：预览环境只做只读/轻量验证。需要写数据的验证，用 `.scratch/` 里的 `begin; … rollback;` 探针走 `db query`，不要为了测试在预览里真写。
- **`supabase db push` 本地推不动**：它要 `SUPABASE_DB_PASSWORD`，只存在 GitHub secret 里。**迁移落地只有一条路：push main → CI `supabase-db-push` 自动推。**
- **云端平台行为以官方文档为准**：Vercel / Supabase / GitHub 的控制台入口、API 端点、CLI 用法，动手前用 `find-docs` skill 查当前文档；这三家改版频繁，凭训练记忆下结论会踩坑。
  CLI 子命令同理：动手前先 `supabase <命令> --help` 看一眼当下有哪些子命令与 flag，
  这次就是漏看 `db query` 才绕了一大圈。

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

1. 开分支 → 写迁移 + 代码 → **按上节在云端验证**（`db push --dry-run` 看顺序，
   `db query` 跑探针看运行时行为）。没有「本地先跑一遍」这一步。
2. push 分支 → Vercel 自动出预览部署（链接见 PR 或 Vercel dashboard）。
3. merge main → Vercel 自动更新生产，CI 自动推送迁移。迁移先于新代码生效，
   所以迁移必须**向后兼容**（加列加表、加策略；删表删列要等下一次发布）。

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
| 迁移顺序 | `supabase db push --dry-run --linked`（有迁移时必跑；**不是** `db reset`） |
| 变更图 | GitNexus `detect_changes({scope:"all"})`，不是 clean 不提交 |

⚠️ 这一段的 `--dry-run` 只证明「迁移推得动」。**改动 RLS 策略的迁移还要在第三段补探针**——
见第三段第 3 条。

**第二段：预览人工验证（PR READY 后，验证清单给到用户）**

预览连生产库且有 SSO，AI 网关真实链路与交互手感无法自动化，必须登录用户照清单点一遍。清单要求具体到动作和期望结果（例：空白入口问 X → 应归入《Y》）。注意：同一分支反复推送时预览 URL 不变，需强制刷新。

**第三段：merge 后生产观察（容易漏，固定四件事）**

1. 确认 `gh run list --workflow=supabase-db-push.yml` 结论 success（迁移先于代码生效）。
   **CI 绿只说明 DDL 跑通了，什么都不证明策略是对的**——继续下一条。
2. **动过 RLS 策略 / 触发器 / 权限的迁移，跑一次探针**（写法见上节）：
   `supabase db query --linked -f <探针.sql>`。顺带 `supabase db advisors --linked`
   看一眼有没有新增 warn。这是唯一能发现策略递归与收窄过头的环节。
3. 在生产域按同一份清单抽验关键路径。
4. 查有没有新增 error / 关键 fallback 事件：

   ```sql
   select level, event, count(*) from public.app_log_events
    where created_at > now() - interval '1 hour' group by 1,2 order by 3 desc;
   ```

   异常时 Vercel Instant Rollback 秒回代码；schema 变更保持向后兼容（加列加表），无需回滚库。

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
| `--linked` 命令报未 link / 连不上 | `supabase link --project-ref fxlfjwlwvsnjbgxmjtog`（需先登录）；**不要**改成起本地栈 |
| `db query` 报了「只在最后一条语句」之外的怪结果 | 先确认探针没在用临时表、结论没走 GUC 汇总；见上面「探针怎么写」 |
| 想跑 `db diff` / declarative schemas | 跑不了，要 shadow 库。迁移手写，不要为它起 Docker |
| GitHub secret 缺失 | `gh secret set <NAME> --repo Kerwin0224/GSW-WEB`；DB 密码无处可查时用管理 API 重置：`PATCH https://api.supabase.com/v1/projects/<ref>/database/password`（带 access token，生成随机新密码，直接管道进 `gh secret set`，全程不回显） |
| Vercel 环境变量缺失 | `vercel env add <KEY> <environment>`，值可从 `web/.env.local` 导入（脚本只输出变量名，不回显值） |

补救完成后，把新的存放位置或轮换方式更新回本表，保持它是唯一事实来源。
