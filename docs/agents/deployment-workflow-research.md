# 上线与更新工作流官方资料调研

> 调研日期：2026-09-25
> 范围：Next.js App Router、Vercel Git deployments、Supabase migrations/CLI/RLS、GitHub Actions。
> 性质：研究阶段只读；后续规范实施与控制面复核记录在第 14 节。报告不记录任何环境变量值。

## 0. 结论摘要

1. **当前仓库只有一个自动化部署面：生产迁移推送；应用部署依赖 Vercel 的 Git 集成。** `.github/workflows/supabase-db-push.yml:6-34` 只在 `main` 上且迁移目录变化时执行 `supabase db push --linked`；仓库内没有 PR 测试、类型、lint、生产构建或 RLS 动态测试工作流。
2. **“迁移先于代码生效”目前没有技术保证。** Vercel 与 GitHub Actions 都由同一个 `main` push 触发，二者并发启动；现有 YAML 没有 `needs`、staged production 或 promotion 屏障。`docs/agents/deployment.md:130-131,165-166` 的顺序性表述与实际编排不一致。
3. **预览连生产数据库是最高风险差距。** Vercel 官方把 Preview 定义为“不影响生产”的测试面，并建议需要独立资源时使用独立 staging 凭据；Supabase 官方 Branching 默认无生产数据，而本仓预览连接生产库。`docs/agents/deployment.md:32` 只靠人工纪律降低风险，不能形成环境隔离。[Vercel Environments](https://vercel.com/docs/deployments/environments)、[Supabase Branching](https://supabase.com/docs/guides/deployment/branching)
4. **第二个 Supabase Free 项目是免费的可选隔离方案，不是免费层前置条件。** 官方定价页明确 Free 包含 2 个 active projects，并建议开发/生产各一项目；Database Branching 不含在 Free。若不创建第二个项目，必须采用单项目只读/事务回滚边界。[Supabase Pricing](https://supabase.com/pricing)
5. **代码回滚不等于数据库回滚。** Vercel Instant Rollback 只重新指向旧构建，不回滚外部数据库/环境变量；Hobby 仅能回到紧邻的上一部署，Rollback 后还会关闭生产域自动指派。数据库破坏性变更必须拆成向后兼容的多版本发布。[Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)
6. **RLS 不能只靠静态 SQL 形状或 DDL 成功证明。** Supabase 官方要求同时检查 grants 与 policies，并为 `anon` / `authenticated` 的允许与拒绝行为建立 pgTAP 测试。仓库已有静态契约测试和两份手工云端真实身份探针，但最新迁移没有对应自动动态探针，`web/supabase/tests/` 也不存在。[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
7. **PR 门禁应至少成为 main 的 required checks。** 仓库当前把测试、类型、lint、迁移 dry-run 都放在人工流程中；GitHub 官方支持 `pull_request` 的 branch/path filters、branch protection、required status checks、environment reviewers 和 environment secrets。[GitHub triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)、[GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
8. **发布排序应是“迁移成功 → 必要探针通过 → 切生产流量”。** Hobby 也可用 Vercel staged production：关闭生产域自动指派，让 `main` 先构建候选部署，迁移与探针成功后再手工 Promote；Promote 不重新构建。[Vercel Promoting Deployments](https://vercel.com/docs/deployments/promoting-a-deployment)
9. **环境变量按 Preview / Production 作用域管理。** 有隔离项目时使用不同 Supabase 配置；单项目模式可以共享凭据，但 Preview 不得执行业务写入。`NEXT_PUBLIC_*` 在 `next build` 时内联并冻结，不能靠修改旧部署的变量来切换。[Next.js Environment Variables](https://nextjs.org/docs/app/guides/environment-variables)、[Vercel Environment Variables](https://vercel.com/docs/environment-variables)
10. **所有“当前已启用”的说法都要回到仓库证据。** `gsw-web`、Root Directory=`web`、仅 PR 预览、预览 SSO 等目前只由文档声称；本地忽略的 `.vercel` 元数据甚至分别指向两个项目，不能作为控制台事实。[Vercel Project Settings](https://vercel.com/docs/project-configuration/project-settings)

## 1. 调研方法与限制

- 先通过 `npx ctx7@latest library ...` 解析出 `/websites/nextjs`、`/supabase/cli`、`/websites/github_en_actions`、`/vercel/vercel`，再用 `npx ctx7@latest docs <library-id> ...` 获取当前文档线索；Context7 只用于定位，不作为本报告的最终证据。
- 最终证据全部回到 Vercel、Supabase、GitHub、Next.js 官方站点或官方 CLI 文档。
- 通用 Web Search 在本环境因搜索服务鉴权/反自动化限制不可用；四个平台的官方文档均可直接访问。少量旧路径或猜测路径返回 404，随后改用官方 canonical 页面，没有用二手文章补缺。
- 本报告访问的 Next.js 官方文档版本为 16.3.6；仓库锁定 `next@16.3.4`。本文只讨论已核实语义，没有建议在本次调研中升级依赖。
- **控制台状态未知：** 未验证 Vercel 实际项目、Root Directory、Production Branch、Preview 设置、Deployment Protection、变量作用域；未验证 Supabase 实际计划/项目 ref/迁移历史；未验证 GitHub 仓库可见性、branch protection、required checks、Actions secrets 或近期运行结果。

## 2. 当前仓库流程事实

| 领域 | 仓库可证实事实 | 证据边界 |
| --- | --- | --- |
| 应用 | 唯一产品应用在 `web/`，Next.js 16.3.4 App Router；脚本有 `next build`、`next start`、lint、Node test。 | `web/package.json:1-12`；根目录没有 package manifest。 |
| Git 约定 | 文档声明 `main` 是生产分支；低风险文档/单文件小修允许直接推 main，其余用短命分支 + PR。 | `docs/agents/deployment.md:133-142`；是否由 branch protection 强制未知。 |
| Vercel | 文档声明项目 `gsw-web`、Root Directory=`web`、预览只由 PR 触发、预览域有 SSO。 | `docs/agents/deployment.md:140-142,180-190`。这些是控制台设置，未由仓库配置或访问日志验证。 |
| 本地 Vercel 链接 | 根 `.vercel/project.json` 指向 `classical-chinese-workbench`；`web/.vercel/project.json` 指向 `gsw-web`。 | `.gitignore:23-30` 忽略 `.vercel`；这是开发者本机状态，不能证明生产项目。 |
| 预览数据库 | 文档明确预览连接生产 Supabase，只允许只读/轻量验证；写验证使用 `BEGIN ... ROLLBACK` 云端探针。 | `docs/agents/deployment.md:30-33`。没有仓库机制阻止预览请求写生产。 |
| 生产迁移 | 唯一 workflow 在 `main` push 且 `web/supabase/migrations/**` 变化时运行，也支持手工 dispatch；显式 link 到 ref `fxlfjwlwvsnjbgxmjtog`，执行 `supabase db push --linked`。 | `.github/workflows/supabase-db-push.yml:1-34`。项目 ref 存在不等于已验证它就是当前生产 ref。 |
| CI 质量门禁 | 测试、类型、lint、迁移 dry-run、GitNexus 都由 agent/提交者在本地手工完成；仓库没有对应 Actions workflow。 | `docs/agents/deployment.md:144-157`；`.github/workflows/` 只有迁移 workflow。 |
| 迁移历史 | baseline 被约定为只读；schema 变更新增迁移。`db push` 只执行未应用文件并按 timestamp 顺序推进远端历史。 | `docs/agents/deployment.md:30-33,40-49`；[Supabase CLI `db push`](https://supabase.com/docs/reference/cli/usage#supabase-db-push)。 |
| RLS 静态门禁 | `npm test` 覆盖 conversation/school scope/space membership 等 SQL 源文本契约，能发现部分 helper、policy、grant 形状漂移。 | `web/src/lib/__tests__/space-membership-contract.test.ts:1-130` 及同目录测试。 |
| RLS 真身份探针 | 两份 `.scratch` SQL 使用 HMAC 身份、`set local role anon`、正反对照、事务夹具和最终 `rollback`；其中 multi-space 探针明确覆盖 2026-09-16 的三条迁移。 | `.scratch/multi-space-tenancy/verify-live.sql:1-83,181-240`；`.scratch/ponytail-audit-fixes/verify-org-admin-scope.sql`。它们是手工流程，未接入 CI。 |
| 最新 RLS 迁移 | `20260925205417_space_subject_membership.sql` 新建 `space_members`、启用 RLS、增加 policy/function/trigger；静态测试已引用这些定义。 | `web/supabase/migrations/20260925205417_space_subject_membership.sql:53-106,108-197`；`space-membership-contract.test.ts:105-120`。仓库未找到覆盖它的独立真身份探针，也无 `web/supabase/tests/`。 |
| 环境变量 | 部署文档只列 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`CWB_AUTH_SECRET`；代码硬性需要 URL/key 和 `CWB_AUTH_SECRET`。模板另有 service-role 与 provider keys，但漏了 `CWB_AUTH_SECRET`。 | `docs/agents/deployment.md:190`、`web/.env.local.example:1-19`、`web/src/lib/supabase/server.ts:18-38`、`web/src/lib/session.ts:20-28`。实际变量作用域未知。 |

### 当前真实顺序

```text
push main
├─ Vercel Git integration：开始生产构建（默认可成功后立即切生产域）
└─ GitHub Actions：若 migrations 路径变化，开始 link + db push 到云端
```

因此当前能保证的是“两个系统都被 main push 触发”，**不能保证迁移先完成，也不能保证迁移失败时阻止 Vercel 上线**。Vercel 官方说明生产分支 push 默认自动 promote；staged production 才是先构建、后手工切流的显式屏障。[Vercel Git](https://vercel.com/docs/git)、[Vercel Promoting Deployments](https://vercel.com/docs/deployments/promoting-a-deployment)

## 3. 官方推荐基线与本仓可采用流程

### 3.1 官方基线

- **Git/PR：** Vercel 推荐生产分支之外的 push/PR 生成 Preview，合并生产分支生成 Production；默认行为与项目级设置必须区分。[Vercel Git](https://vercel.com/docs/git)、[Vercel GitHub integration](https://vercel.com/docs/git/vercel-for-github)
- **代码门禁：** Next.js 官方把 `next build` 作为生产构建，并建议上线前本地构建；Vercel 对 Next.js 默认读取 `package.json#scripts.build` 或执行 `next build`。[Next.js Production Checklist](https://nextjs.org/docs/app/guides/production-checklist)、[Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next#next-build-options)、[Vercel Configuring a Build](https://vercel.com/docs/builds/configure-a-build)
- **数据库迁移：** Supabase 官方要求远端 schema 变更只通过 migration files，`db push` 比较本地文件与远端 history 并按顺序执行；`--dry-run` 只打印将应用的迁移，`--include-all` 包含远端 history 中找不到的本地迁移。[Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)、[CLI `db push`](https://supabase.com/docs/reference/cli/usage#supabase-db-push)
- **隔离预览：** Supabase Branching 为每个 branch 提供独立 instance/API credentials，preview 默认无生产数据；GitHub integration 强烈建议把 Supabase preview check 设为 required。[Supabase Branching](https://supabase.com/docs/guides/deployment/branching)、[Supabase Branching GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
- **RLS：** grants 决定操作是否允许，policies 决定行范围；两者必须同时测试。官方要求为暴露表建立 allow/deny 测试，覆盖 `anon` 与 `authenticated` 以及 CRUD。[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

### 3.2 免费档下的可选隔离拓扑

```text
GitHub PR
├─ CI：代码测试 + Next production build（使用非生产变量）
├─ 可选：Supabase 第二个 Free 项目：迁移验证 + pgTAP/真实身份 allow-deny 测试
└─ 可选：Vercel Preview 使用第二个项目的 URL/key/CWB_AUTH_SECRET；单项目模式只做只读/回滚验证

merge main
├─ Supabase Actions：迁移到生产项目
├─ 必要的生产 RLS 真身份探针（事务回滚）
└─ Vercel staged production：构建候选但不切生产域
   └─ 上述均成功后手工 Promote
```

这是免费层可选的安全增强，不是部署前置条件。Free 官方允许 2 个 active projects；Database Branching 仍不在 Free。若选择单项目模式，按本文的只读、事务回滚和 Preview 保护规则执行。[Supabase Pricing](https://supabase.com/pricing)

## 4. 预览、生产与迁移的正确顺序

### 4.1 预览

1. PR 的 Vercel Preview 在有第二个 Free Supabase 项目时使用该项目的 `NEXT_PUBLIC_SUPABASE_URL`、publishable key 和独立的 `CWB_AUTH_SECRET`；若采用单项目模式，则使用生产 ref 但只允许只读或可回滚夹具。Preview 变量变更只影响新部署。[Vercel Environment Variables](https://vercel.com/docs/environment-variables)
2. 预览域启用 Vercel Authentication/Standard Protection。Hobby 不支持 Password Protection，但支持免费的 Vercel Authentication；没有保护时，持有生产变量的 Preview URL 不应暴露。[Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)
3. Preview 只跑合成数据或可回滚夹具，不对生产库执行业务写请求。Supabase Branching 的“无数据默认”正是为了保护生产数据；本仓即使不启用 Branching，也应达到同等隔离目标。[Supabase Branching](https://supabase.com/docs/guides/deployment/branching)
4. CI 的 `next build` 同样使用 Preview/测试作用域变量。Next.js 官方说明 `NEXT_PUBLIC_*` 会在 build time 内联，构建完成后冻结；Vercel 也说明变量修改不会应用到既有部署。[Next.js Environment Variables](https://nextjs.org/docs/app/guides/environment-variables)、[Vercel Environment Variables](https://vercel.com/docs/environment-variables)

### 4.2 生产

推荐把 Vercel Production 改为 staged production：Production Branch Tracking 关闭 **Auto-assign Custom Production Domains**。这样 `main` push 仍会构建 Production candidate，但不会立即承接生产域；迁移和探针成功后再手工 Promote，Promote 不重新构建。[Vercel Promoting Deployments](https://vercel.com/docs/deployments/promoting-a-deployment)

如果暂不切 staged production，则必须删除“迁移先于代码”的承诺：Vercel 与 Actions 仍并发，只能依靠**每一步迁移都向后兼容**来承受任一顺序。Vercel 官方明确 Instant Rollback 不重建、不会同步新环境变量，并提醒外部数据库行为不会随代码回滚改变。[Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)

### 4.3 迁移

1. migration 与应用代码放在同一 PR/同一 commit 序列中；baseline 继续只读，新 schema 只新增迁移文件。Supabase 官方把 Git migration files 与远端 `supabase_migrations.schema_migrations` history 明确分离，两者必须同步。[Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
2. PR 阶段有第二个项目时在隔离项目执行 `db push --dry-run` 和实际迁移测试；单项目模式不向生产执行 Preview migration，只做 dry-run 与回滚探针。CLI 的 `--dry-run` 只打印待应用列表；`--include-all` 的语义是纳入远端 history 找不到的本地迁移，不能把它误解为“同步删除远端迁移”。[CLI `db push`](https://supabase.com/docs/reference/cli/usage#supabase-db-push)
3. 迁移文件不得直接改远端 schema。Supabase 官方警告远端 Dashboard/Table Editor 变更绕过 history，后续 `db push` 会失去同步依据。[Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
4. 生产 push 只允许一个迁移 job 运行。Supabase 官方团队流程明确要求协调单一 `db push`，因为 timestamp 顺序和并发 push 会冲突；本仓 workflow 应有按生产项目/主分支的 concurrency 串行化。[Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
5. 迁移必须向后兼容：先扩展（新增表/列/RPC/兼容 policy），再让代码使用；删除/重命名/收紧在后续版本完成。这样无论 Vercel 与 Actions 谁先完成，旧代码与新 schema 都能工作。

## 5. 环境保护

### 5.1 Vercel

- 官方默认环境是 Local、Preview、Production；Production、Preview 变量分别作用于对应的新部署，Preview 还可按 branch 覆盖。[Vercel Environments](https://vercel.com/docs/deployments/environments)、[Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- Hobby 没有 named Custom Environment，但可用 persistent preview branch 做 staging，或用 staged production；后两种路径均覆盖 Hobby。[Vercel Environments](https://vercel.com/docs/deployments/environments)
- Standard Protection + Vercel Authentication 应保护 Preview；不要把生产 service-role、CWB secret 或 provider key 放进可公开访问的 Preview。[Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)
- Preview 不应复用 Production 的 publishable key/URL/CWB secret。Vercel 官方特别说明，把 Preview build Promote 到 Production 时，Preview 变量不能作为 Production 变量使用，promotion 不会替你转换环境。[Vercel Promoting Deployments](https://vercel.com/docs/deployments/promoting-a-deployment)

### 5.2 GitHub Actions

- 生产迁移 job 应引用 `production` GitHub Environment，把 `SUPABASE_ACCESS_TOKEN` 与 `SUPABASE_DB_PASSWORD` 移为 environment secrets；环境 reviewer、wait timer、分支/tag 限制都可在 job 启动前或启动时执行。[GitHub Environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- PR 验证 job 不应拿到生产 DB password。GitHub 官方说明 fork PR 不传递 secrets（`GITHUB_TOKEN` 除外），因此不能把生产迁移逻辑直接复制到不可信 PR；预览凭据也应只给受信任分支/环境。[GitHub Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- GitHub Free 只有**公开仓库**可配置 environments/protection；私有仓库需要相应付费计划。若本仓是私有 Free，不能把“GitHub Environment reviewer”写成无条件可用的免费门禁。[GitHub Environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

### 5.3 代码边界

- `CWB_AUTH_SECRET` 是 server-only secret，代码缺失时直接失败；它必须进入 Vercel Production/Preview 各自的 secret 作用域，不能进入 `NEXT_PUBLIC_*`，也不应提交真实值。代码证据：`web/src/lib/session.ts:20-28`。[Next.js Production Checklist](https://nextjs.org/docs/app/guides/production-checklist)
- `NEXT_PUBLIC_SUPABASE_URL` 与 publishable key 是浏览器可见值，但 URL/key 的组合仍决定访问哪个 Supabase 项目；它们应在每次 build 对应正确环境，而不是“运行时再切”。[Next.js Environment Variables](https://nextjs.org/docs/app/guides/environment-variables)
- `.env.local.example` 漏掉 `CWB_AUTH_SECRET`，部署文档的变量清单也未列出 provider/runtime secret 的完整作用域；这会让新环境按模板配置后仍然启动失败。模板和部署清单应与代码读取点保持一份真源。

## 6. 回滚边界

| 故障类型 | 能回滚/恢复什么 | 不能做什么 |
| --- | --- | --- |
| Vercel 应用代码 | Hobby 可 Instant Rollback 到紧邻上一 Production；Vercel 直接把域指向旧 deployment。 | 不重建，不回滚数据库、CMS、外部 API；旧 deployment 的配置可能已过时。Rollback 后生产域自动指派关闭，需显式 Undo/Restore。 |
| 数据库 schema | 通过新 migration 做 forward fix；生产破坏性操作前保留兼容对象。 | Vercel Rollback 不会撤销 Supabase schema。Free 无 automatic backups / PITR；不能把 Git revert 当作 SQL rollback。 |
| RLS policy/grant | 用新 migration 恢复 grants/policies，再以 allow/deny 真实身份测试验证。 | 只回滚代码不能修复已经变严/变宽的 policy。 |
| 生产数据写入 | 由业务补偿脚本或经审批的数据修复处理。 | Instant Rollback 不恢复数据库行、外部 AI 请求或用户已经看到的内容。 |

上述边界直接来自 Vercel 的 rollback 文档；免费 Supabase 的备份限制来自官方定价页。[Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)、[Supabase Pricing](https://supabase.com/pricing)

## 7. 免费档限制（官方页面快照，访问 2026-09-25）

| 平台 | 关键限制 | 对本仓的影响 |
| --- | --- | --- |
| Vercel Hobby | 100 deployments/day；1 concurrent deployment；build 最长 45 分钟；50 domains/project；Runtime logs 1 小时；Hobby rollback 仅上一部署；Hobby 限非商业、个人使用。 | 频繁分支预览会消耗部署额度并排队；Hobby 商业使用资格需确认。不能用 Hobby Custom Environment，但可用 persistent preview branch/staged production。 |
| Supabase Free | 2 active projects；500 MB DB/project；5 GB egress；1 GB storage；无 automatic backups、无 PITR；无 Branching；1 周不活动会 pause。 | 第二个项目可做 staging，但要接受 500 MB/暂停约束；不能依赖 Branching 或免费 PITR 做恢复。 |
| GitHub Actions Free | 公开仓库标准 hosted runner 免费；私有仓库 GitHub Free 配额 2,000 minutes/月、500 MB artifact、10 GB cache/repo；超配额计费。GitHub Free 私有仓库不能配置 environments。 | 当前迁移 job 很小；PR build/test 会消耗私有仓库分钟。环境审批是否可用取决于仓库可见性和 GitHub plan。 |
| Next.js | `next build` 是生产构建；`next start` 需要先 build；`NEXT_PUBLIC_*` build-time inline。 | PR 必须跑真实 build，且 Preview build 变量不能误指向生产。 |

官方来源：[Vercel Hobby](https://vercel.com/docs/plans/hobby)、[Vercel Limits](https://vercel.com/docs/limits)、[Supabase Pricing](https://supabase.com/pricing)、[GitHub Actions Billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[Next.js Deploying](https://nextjs.org/docs/app/getting-started/deploying)。

## 8. 建议的 CI 门禁

以下是建议的**目标契约**，不是对当前控制台已启用的声明。

### PR 必过

1. **依赖与代码：** `npm ci`、`npm test`、`npm run lint`、`npx next typegen && npx tsc --noEmit`、`npm run build`。Next.js 16 官方说明 `next typegen` 可独立生成 route types 后再跑 TypeScript；`next build` 则是实际 production build。[Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next#next-typegen-options)、[Next.js Production Checklist](https://nextjs.org/docs/app/guides/production-checklist)
2. **迁移静态门禁：** 检查 migration 排序、重复 timestamp、baseline 未改；对新增 RLS/grant/trigger 保留现有 Node SQL contract tests；使用 `supabase db push --dry-run --db-url <PREVIEW_DB_URL>` 或等价的非生产目标，不对生产执行 dry-run/push。[Supabase CLI `db push`](https://supabase.com/docs/reference/cli/usage#supabase-db-push)
3. **数据库动态门禁：** 在第二个 Supabase 项目上应用迁移，然后以 `supabase test db --db-url <PREVIEW_DB_URL>` 或 `--linked` 跑 pgTAP；每个受保护表至少覆盖 `anon` / `authenticated` 的 allow 与 deny、select/insert/update/delete。Supabase 官方明确 `supabase test db` 支持 `--db-url` / `--linked`，每个测试独立事务回滚。[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Supabase CLI `test db`](https://supabase.com/docs/reference/cli/usage#supabase-test-db)
4. **预览部署：** Vercel Preview READY 且受保护；对实际用户路径做人工 smoke，尤其是自定义 `anon` + HMAC session、school boundary、conversation/space RLS。Vercel Preview 的构建/部署状态可作为协作信号，但不能替代 required CI check。[Vercel GitHub integration](https://vercel.com/docs/git/vercel-for-github)
5. **合并保护：** main 开启 PR required、conversation resolution、required status checks；状态名必须唯一，避免多 workflow 同名 job 造成歧义。[GitHub About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

### 生产触发

1. 仅 `push` 到 Production Branch（当前文档为 main）或受控 `workflow_dispatch`；`workflow_dispatch` 必须保留人工审计，不应绕过 branch/migration 保护。GitHub 的 push/pull_request/workflow_dispatch 和 branch/path filters 语义见官方事件文档。[GitHub triggers](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
2. 生产迁移 job 使用 GitHub `production` environment、environment secrets、production-only concurrency；执行 `supabase db push --linked --include-all`，然后用 `supabase migration list --linked` 确认 history。`--include-all` 只影响“远端 history 找不到的本地迁移”，不是删除同步。[Supabase CLI](https://supabase.com/docs/reference/cli/usage#supabase-db-push)
3. 若改 RLS、grant、trigger，先跑与变更匹配的真实身份 allow/deny 探针，再允许 Promote。生产探针必须显式立身份、切换到实际运行角色、包含正例与反例、末尾 rollback；Supabase 官方说明 RLS policy 会在每次访问时执行，静态 DDL 不能证明请求结果。[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
4. 只有 migration job、必要的生产探针、Vercel candidate build 全绿，才 Promote Vercel deployment。若保持自动 Promote，必须接受“迁移与代码并发、迁移向后兼容”的约束，并在 SOP 中明确不存在 migration-first 顺序保证。[Vercel Promoting Deployments](https://vercel.com/docs/deployments/promoting-a-deployment)

### 当前 Actions workflow 的具体改进点（不执行修改）

- `supabase/setup-cli@v1` 当前写死 `version: latest`；生产迁移工具链不可复现。建议选定并记录 CLI 版本，升级 CLI 本身作为独立变更验证。
- 没有 `concurrency`；两个 main push 的 migration job 可能并发，违反 Supabase 官方的单 push 协调建议。[Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- 没有 `environment`、reviewer、production branch policy；repo secrets 也没有 production/preview 作用域隔离。[GitHub Environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- 只过滤 `migrations/**`；`config.toml`、seed/RLS test 等 schema 交付物不会触发当前 job。若未来把 seed 或 SQL tests 纳入生产发布，触发路径必须显式列出并评审。
- 当前没有 `npm test`/lint/type/build 的 PR workflow；package scripts 存在不等于 CI 门禁存在。代码证据：`web/package.json:6-12`。

## 9. 当前仓库与最佳实践差距

| 优先级 | 差距 | 风险 | 最小可行改法 |
| --- | --- | --- | --- |
| P0 | Preview 复用生产 Supabase | 预览代码/人工误操作可直接触碰生产数据；Vercel 保护不能替代数据库隔离。 | 建第二个 Free Supabase 项目；Preview 变量只指向该项目；开启 Preview protection。 |
| P0 | main 没有可证实的 PR/required checks | 代码和 schema 可绕过测试直接进生产；Vercel build 不能替代 lint/type/RLS contract。 | 加 `pull_request` CI；main 开启 required PR + checks + conversation resolution。 |
| P0 | migration 与 Vercel 生产切换并发 | “迁移先于代码”只是文档假设；失败时可能新代码已上线而 schema 未完成。 | 开 staged production，迁移/探针成功后再 Promote；否则所有迁移必须严格 expand-compatible。 |
| P0 | RLS 真身份验证不是 CI 门禁，最新迁移无独立动态覆盖 | DDL 成功不能证明 policy 没有递归、grant 正确或跨租户被拒绝。 | 在隔离项目写 pgTAP allow/deny；为 custom HMAC 身份保留手工/受控生产探针。 |
| P1 | workflow 无 production environment、concurrency、固定 CLI 版本 | secrets 作用域宽；并发 push 冲突；latest 造成不可复现。 | environment secrets + branch policy；`concurrency` 串行；固定 CLI 版本并记录升级。 |
| P1 | `CWB_AUTH_SECRET` 不在 env template，部署变量清单不完整 | 新环境按模板配置仍会在 runtime 失败；Preview/Production 容易误共享 secret。 | 补齐模板与按环境清单；server-only secret 只进 Vercel/GitHub secret manager。 |
| P1 | Vercel 项目/Root/Preview/SSO 事实只在文档 | 开发者本机 `.vercel` 元数据与文档不一致；无法证明控制台配置。 | 在控制台核对并把“事实/核验日期/负责人”写回部署文档；不要依赖 ignored `.vercel`。 |
| P2 | 文档允许小修直接 main | 即使是文档/配置修复，也可能绕过统一 review、审计和状态检查。 | 普通变更一律 PR；只有明确 emergency 流程才允许 protected-branch bypass，并要求事后补 PR。 |
| P2 | 免费档恢复能力有限 | Supabase Free 无自动备份/PITR；Hobby 仅上一部署回滚；私有 GitHub minutes 有配额。 | 把 expand/contract、预览项目、部署记录和手工 forward fix 当作默认；不承诺数据库秒回。 |

## 10. 建议 SOP

### 10.1 分支与 PR

1. 从最新 main 建短命分支；一个变更只解决一个问题。schema 变更只新增 `web/supabase/migrations/<timestamp>_*.sql`，不改 baseline，不直接改远端 Dashboard。
2. 代码、migration、RLS contract test、业务验收清单同 PR 提交。PR 描述必须写：是否改 schema/RLS/grant/trigger、是否需要数据回填、旧代码是否仍兼容、回滚/forward-fix 方案。
3. 开启 main required PR、required status checks、conversation resolution；禁止 force-push/删除 main。GitHub 官方支持这些保护，并要求 required check 名称唯一。[GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
4. 禁止把生产 DB secrets 放进 fork PR job。有第二个项目时，Preview job 只拿隔离项目的最小权限凭据；单项目模式的 Preview 不执行业务写入。生产 job 只在 main merge 后、production environment 规则通过后运行。[GitHub Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

### 10.2 PR 预览

1. 推送分支并打开 PR；有第二个项目时 Vercel Preview 使用独立 variables、独立 Supabase project、独立 CWB secret。单项目模式沿用生产 ref，但 Preview 只做只读/可回滚验证，并开启 Vercel Authentication。
2. 先看 CI：依赖安装、测试、lint、route typegen/TypeScript、Next production build、迁移 dry-run、隔离数据库迁移、RLS pgTAP allow/deny。Next.js 官方要求 `next build` 产生优化生产构建；Vercel 默认会使用 `package.json` 的 build script。[Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next#next-build-options)、[Vercel Configuring a Build](https://vercel.com/docs/builds/configure-a-build)
3. 再做人工 smoke：登录、核心读写、学生/教师/管理员边界、跨校拒绝、错误/空态、AI 网关失败路径。有隔离项目时使用测试数据；单项目模式禁止在生产库模拟写入，写入验证统一使用事务回滚夹具。
4. Preview 不直接证明生产 promotion 后仍安全；必须保留 merge 后的 production migration check 和必要的 production RLS probe。

### 10.3 发布

**推荐路径（staged production）：**

1. 确认 Vercel Production Branch=`main`、Root Directory=`web`、Next.js preset/build command 正确，并关闭 `Auto-assign Custom Production Domains`。这些是控制台设置，需实际核验后写入事实表。[Vercel Project Settings](https://vercel.com/docs/project-configuration/project-settings)、[Vercel Configuring a Build](https://vercel.com/docs/builds/configure-a-build)
2. 合并 PR。Vercel 开始构建 candidate；GitHub production migration job 在同一 main commit 上串行执行 `db push`。此时不切生产域，旧应用继续服务。
3. 迁移 job 成功并确认 migration history；若变更 RLS/grant/trigger，运行匹配的真实身份 allow/deny 探针。探针必须先证明身份解析成功，再看允许/拒绝结果，不能只看一个 0。
4. 所有检查通过后，在 Vercel 手工 Promote candidate；Promote 不重新构建。记录 commit SHA、migration filenames、Actions run URL、Vercel deployment URL、变量作用域版本。
5. 生产抽验关键路径并观察 Vercel runtime/build logs、应用日志、Supabase advisor/error。任何失败先停止 Promote；已经 Promote 则按回滚边界处理。

**若暂不启用 staged production：**

- 明确写成“Vercel production 与 Supabase migration 并发”，不能写“迁移先于代码”。
- 只允许 expand-compatible migration；任何 drop/rename/收紧 policy 的破坏性迁移拆到后续发布。
- 监控 Vercel deployment 与 migration Actions 两个独立信号；Actions 失败时不要继续人工依赖“代码已上线”作为成功标准。

### 10.4 热更新 / 小修

1. 即使是单行代码、文案、配置或依赖小修，默认仍走短命分支 + PR + required checks；“小”只减少人工 smoke 范围，不绕过 review/审计。
2. 无 schema、无 RLS/grant/trigger、无环境变量新增时：测试 + lint + typecheck + build 通过后即可合并；Vercel candidate 成功后 Promote，观察关键页面与 runtime logs。
3. 纯仓库文档且不影响 Vercel build 时可以免人工 Preview，但仍建议保留文档/链接检查；不要把“文档小修直接 main”扩展成代码或配置小修。
4. 线上紧急修复是例外：记录 incident、批准人和 bypass 原因；先恢复服务，再补一个可审查的 PR，运行完整门禁。GitHub branch protection 默认可能允许管理员/有 bypass 权限者绕过，因此必须显式审计。[GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

### 10.5 失败处理与回滚

- **Vercel candidate 未构建：** 不 Promote；修复代码/变量后重跑。
- **迁移失败：** 不 Promote；检查 `migration list`、日志、迁移历史。不要用 `migration repair` 掩盖真实 schema 状态；Supabase 官方说明 repair 只改 history，不执行或撤销 SQL。[Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- **RLS probe 失败：** 不 Promote；用新 migration forward-fix grants/policies/functions，随后重跑正例和反例。
- **已 Promote 后应用故障：** Hobby 先 Instant Rollback 到紧邻上一部署；检查旧部署是否仍兼容当前数据库。不要期待它回滚 schema、数据或新环境变量。[Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)
- **已 Promote 后数据库故障：** 先冻结写入/按业务补偿，再由有权限者执行 forward-fix；Free Supabase 无 PITR/自动备份，恢复方案不能写成“Git revert”。[Supabase Pricing](https://supabase.com/pricing)

## 11. 待确认事项（上线前必须核对）

以下事项不能从当前仓库或本次只读研究中确认：

1. Vercel 实际项目是否为 `gsw-web`，GitHub repo 是否正确连接，Root Directory 是否为 `web`，Framework Preset 是否为 Next.js，build command 是否为 `npm run build`。
2. Vercel Production Branch 是否为 `main`；Preview 是否真的“Only PRs”；Preview/Production 是否分别配置 URL/key/CWB secret；`NEXT_PUBLIC_*` 是否在每次 build 取正确作用域。
3. Vercel Preview 是否启用 Standard Protection/Vercel Authentication；生产 generated URL、custom domain、rollback 权限与当前计划是否可用。
4. Vercel staged production 的 `Auto-assign Custom Production Domains` 当前是否开启；Rollback 后是否知道如何 Undo/恢复自动指派。
5. Supabase 实际组织/计划是否为 Free；`fxlfjwlwvsnjbgxmjtog` 是否为生产项目；第二个 Free project 是否已创建、是否有独立 URL/key/secret、是否接受 500 MB/1 周 pause 限制。
6. GitHub 仓库是 public 还是 private；GitHub plan 是否允许该可见性下的 Actions environments；Actions secrets 是否存在且仅在 production job 可读。
7. `main` 是否启用 branch protection/ruleset、required PR、required status checks、conversation resolution、禁止 force-push/删除；现有管理员 bypass 是否关闭。
8. 当前 `supabase-db-push` 最近运行是否成功、是否有并发/失败/部分迁移；CLI `latest` 的实际版本与项目 PostgreSQL major version 是否匹配。
9. `CWB_AUTH_SECRET`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、Supabase `secret_ref` 指向的运行时变量是否在 Production/Preview 各自配置；不要只看文档清单。
10. 预览实际使用的 Supabase 角色、grant、custom HMAC session 签名与 `current_app_user_id()` 是否与生产 RLS 一致；最新 `20260925205417` 是否已有独立真身份 probe 证据。
11. 第二个 Supabase project 是否有可重复的 seed/测试身份和跨租户夹具；若没有，不能把“RLS allow/deny CI”标为已具备。
12. 生产域名/自定义域名的当前 DNS、Vercel domain assignment、TXT 验证状态；本次没有访问控制台，不能从仓库文档推断其当前有效。

## 12. 官方来源索引（访问日期：2026-09-25）

### Vercel

- https://vercel.com/docs/git
- https://vercel.com/docs/git/vercel-for-github
- https://vercel.com/docs/deployments/environments
- https://vercel.com/docs/deployments/promoting-a-deployment
- https://vercel.com/docs/instant-rollback
- https://vercel.com/docs/environment-variables
- https://vercel.com/docs/deployment-protection
- https://vercel.com/docs/project-configuration/project-settings
- https://vercel.com/docs/builds/configure-a-build
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/limits

### Supabase

- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/reference/cli/usage#supabase-db-push
- https://supabase.com/docs/reference/cli/usage#supabase-test-db
- https://supabase.com/docs/guides/deployment/branching
- https://supabase.com/docs/guides/deployment/branching/github-integration
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/pricing

### GitHub

- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- https://docs.github.com/en/billing/concepts/product-billing/github-actions

### Next.js

- https://nextjs.org/docs/app/guides/production-checklist
- https://nextjs.org/docs/app/getting-started/deploying
- https://nextjs.org/docs/app/guides/environment-variables
- https://nextjs.org/docs/app/api-reference/cli/next

> 结论边界：以上官方页面描述的是平台能力和推荐机制；仓库当前是否启用这些能力，必须通过第 11 节的控制台/API/GitHub 设置核验后才能写成“已启用”。

## 13. 本次 CLI 现场复核（2026-09-25）

以下事实来自当前 Vercel/Supabase CLI，只记录项目名、配置结构和状态，不记录任何环境变量值。

### 13.1 Vercel 项目

- 正式项目 `gsw-web`：`rootDirectory=web`、`framework=nextjs`、Node `24.x`；自定义生产域名为 `https://www.04251688.xyz`。
- 另一个项目 `classical-chinese-workbench`：`rootDirectory` 为 `.`、framework 为空/Other；最新部署日志显示 `vercel build` 没有安装依赖，输出为空，访问其生成域返回 Vercel `404 NOT_FOUND`。
- 两个项目都连接过同一 GitHub 仓库的 `main` 提交；`classical-chinese-workbench` 的部署历史属于错误项目产生的空构建，不是有效产品发布。
- `gsw-web` 的正式部署日志包含 `npm ci`、`next build`、Next.js 16.3.4 识别、TypeScript 检查和 42 条路由生成；正式域名 `/login` 返回 HTTP 200。
- `gsw-web` 开启 Preview Vercel Authentication 与 Git Fork Protection；当前未配置 Vercel Deployment Checks。
- 本地根目录 `.vercel` 原先绑定到错误项目，已重新绑定到 `gsw-web`；`.vercel` 仍是忽略文件，不作为生产配置真源。

### 13.2 Supabase

- 项目 `GSW` 当前状态为 `ACTIVE_HEALTHY`，已 linked。
- `supabase migration list --linked` 可以读取远端历史。
- `supabase db push --dry-run --linked --skip-vault` 成功，当前只显示待应用的 `20260925205417_space_subject_membership.sql`；尚未实际推送。

### 13.3 GitHub

- GitHub API 已核验 `main` 原先没有 branch protection；现已启用 required PR、`ci` required check、conversation resolution、线性历史，并禁止 force push/删除。Vercel Preview/Deployment Checks 尚未配置。

本次现场核验与实施把正式项目收敛为 `gsw-web`，并关闭自动生产域名分配；Preview/Production 变量仍需在控制台按环境拆分确认。

## 14. 规范实施记录（2026-09-25）

- 根目录本地 Vercel 链接已改为 `gsw-web`；`.vercel` 仍被 `.gitignore` 忽略。
- 已通过 Vercel API 核验并设置 `gsw-web`：`autoAssignCustomDomains=false`、`rootDirectory=web`、`framework=nextjs`、Production Branch=`main`。这会把后续 main 部署保持为 candidate，需人工 Promote。
- 已新增 `.github/workflows/ci.yml`，对 PR 和 main 执行锁定依赖安装、测试、lint、TypeScript 检查；不在工作流中运行 Next build/dev。
- `.github/workflows/supabase-db-push.yml` 已固定 Supabase CLI `2.117.0`，增加 `production` environment、串行 concurrency、手动触发分支保护和迁移历史记录。
- `web/.env.local.example` 已补上 server-only `CWB_AUTH_SECRET`；真实值仍只存放在 Vercel/GitHub secret manager。
- 可选控制面操作：创建或指定第二个 Free Supabase 项目并填入 Preview 变量；若不创建，则在部署文档中明确单项目只读/事务回滚边界。另需为 `gsw-web` 添加 Deployment Checks，并确认错误 Vercel 项目的 Git 归属后再断开或归档。

> 第 0～13 节保留实施前的研究快照；当前执行规则以根目录 `AGENTS.md` 和 `docs/agents/deployment.md` 为准。
