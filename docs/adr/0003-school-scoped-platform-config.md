# 0003: 平台配置按学校隔离

日期：2026-09-16 · 状态：accepted

## 背景

ADR-0002 裁定「平台级资源（provider / model_tier / presets / mcp）按公司统一配置，本段不改其策略」，
并在迁移 `20260912130000_multi_tenant_foundations.sql` 里明文写死了这个边界。

产品推翻该裁定：这是给多所学校用的 SaaS，学校要能带自己的模型网关与 MCP Server。
同时排查中发现两条实锤越权（不是理论风险）：

- `prompt_presets` 的 `presets_app_admin_all` 用 `is_admin()`，**无学校谓词**
  → A 校管理员可以读改 B 校的预设。
- `presets_app_published_read` 收窄成了 `purpose='chat'`，但**仍无租户谓词**
  → 任何已登录用户可读任何学校的备课模板。

## 决策

1. **统一形状**：平台配置表的租户列是 `school_id uuid`，**NULL = 公司级模板**（所有校可用），
   非空 = 该校自带。不用 `organization_id` 做运行时分界（多公司场景尚未出现；
   真出现时加列即可，见「已知边界」）。
2. **「本校优先、回退公司级」放在 RPC 函数体里**，不是应用层。三个解析函数都是
   `security definer`，能自己从 `current_app_user_id()` 读到 `profiles.school_id`。
   返回**全部候选行且本校行排在前**，应用层 `getProviderCapability` 本来就是
   「逐行尝试，第一个 ready 的胜出」——回退不需要调用方写任何代码，
   `src/lib/data/common.ts` 一行未改。
3. **capability 的租户归属跟随 provider，用触发器而非列默认值。**
   若用会话默认值，org_admin 给某校 provider 配 embedding 时（他的 `current_school_id()` 是 NULL）
   会写出 `school_id=NULL` 却指向该校 provider 的能力行，所有学校都能回退拿到它——跨校泄漏。
4. **根表用列默认值 `current_school_id()`。** 旧代码插入时不传 `school_id`，迁移落地瞬间
   行为就正确，不必等代码部署。org_admin 的 `current_school_id()` 为 NULL，于是他建的是公司级模板。
5. **`scenario_tier_bindings` v1 不加学校维度。** 场景→tier 是路由策略，属公司级资产；
   恰恰因为它是公司级的，学校自带 Provider 才能零成本透明替换（只覆盖 tier 绑定即可）。
   `save_scenario_tier_bindings_and_sync` 相应从 `is_admin()` 收紧为 `is_org_admin()`。
6. **`provider_capabilities` 保留为表，不做视图化。** 它是派生数据，但
   `lib/data/admin.ts` 的 `provider_configs.select('*, provider_capabilities(*)')` 依赖外键，
   视图没有外键；且视图需要 `security_invoker`，写错就是绕过 RLS 的洞。
   重建函数 `rebuild_scenario_provider_capabilities` 改为按作用域分层，
   旧函数体存档于 `docs/prod-data-fixes/2026-09-16-rebuild-capabilities-rollback.sql`。

## 后果

- `provider_configs` / `mcp_servers` / `model_tier_bindings` / `provider_capabilities`
  / `prompt_presets` 都按校收敛；新增 `can_admin_school_scope` / `can_read_school_scope` 两个判定 helper。
- **provider / mcp 表的读仍限 admin**：它们含 `secret_ref`（API Key 与 MCP Token 的密文），
  而运行时走的是 `security definer` 的解析 RPC，不需要给师生开放这两张表。
  要真的开放得走「视图 + 列级 GRANT」，是独立的一件事。
- **`school_id` 为 NULL 的学校管理员写不了任何东西。** 这是有意的：
  为兼容它而放开「admin 可写公司级模板」，等于任何学校管理员都能改全校的模型路由。
  该角色理论上已不存在（`20260915231533` 之后），上线前需实测确认。
- **多公司场景未覆盖**：`school_id IS NULL` 的公司级模板目前对所有 organization 可见可用，
  且任何 org_admin 都能改。当前只有一个组织所以不是问题；出现第二个组织时必须加 `org_id` 列
  并加进两个 scope helper 的判断。
- 迁移带**派生表非空自检**：`rebuild_*` 产出为空就是所有模型调用 503，门禁在迁移里，
  且 `src/lib/__tests__/school-scope-contract.test.ts` 断言该自检与三个解析函数的租户谓词都在。
