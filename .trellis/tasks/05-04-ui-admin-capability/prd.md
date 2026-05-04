# Fill admin workspace spec (刀 2：管理员能力矩阵驾驶舱)

## Goal

把管理员端从"配置页合集"升级为**运行系统的驾驶舱** —— 首屏就能看到"哪个能力断链 / 哪个学生/教师功能因此关闭 / 哪个密钥快过期"，并落成 frontend spec。

## Context

### 现状缺陷（审计得出）
1. `SetupChecklist` 六项平铺勾选（`app/admin/page.tsx:30-37`），**不告知"这项缺了，现在哪个功能是关的"** → 缺**能力链路视图**。
2. `ProviderCapabilityMatrix`（`components/workbench/provider-capability-matrix.tsx`）展示 provider × capability，但**没有"能力盲点" KPI**（例如 `bloom_classification` 当前无任何可用模型绑定）—— 这才应该是首屏告警。
3. 密钥展示 `secret_last_four` + `AES-256-GCM`（`app/admin/providers/page.tsx:66-69`），但**缺创建时间 / 最后使用时间 / 轮换提醒**（密钥生命周期管理）。
4. 用户表只有姓名/账号/角色/状态（`app/admin/page.tsx:93-112`），**缺班级、最近登录、最近活动**；"添加账号" / "CSV 导入"按钮 `disabled` 硬占位。
5. MCP / Exports / Presets / Providers 四个管理页**交互风格不统一** —— Provider 走行内独立按钮；MCP / Presets 走 Dialog；导出单独 list。
6. `/admin/logs` 只显示 6 条 timestamp+event，**无 trace/userId 过滤、无搜索、无 level 筛选**。
7. 缺系统健康总览 —— provider P95 延迟、token 消耗、审计覆盖率、导出批次状态应该在一屏。
8. 批量导入（CSV）未实现（PRD §4.5.3）。
9. 数据集预览未实现（PRD §4.5.4 "预览前 100 条 + 分布统计"）。
10. Provider 速率限制 / 日预算阈值缺失（成本失控风险）。

### 管理员"唯一工作"
管理员坐下来想的是：**现在学生能学吗？教师能教吗？出问题怎么定位？** 所以管理员首屏必须回答这三问，而不是秀六格 checklist。

### 已存在
- `SetupChecklist`, `ProviderCapabilityMatrix`, `ProviderConfigDialog`, `ProviderActions`, `AdminLogViewer`, `McpServerDialog`
- `lib/data/admin.ts`: `getAdminDashboard`, `getAdminProviders`
- `lib/observability/server-log-store.ts`: `readRecentAppEvents`, `getLogFileStatus`
- `provider_capabilities` 表已带 `is_enabled`

### 成功信号
- `/admin` 首屏是**三问驾驶舱**：
  1. 学生 AI 链路状态（student_chat + bloom_classification + project_classification 是否全绿）
  2. 教师 AI 链路状态（teacher_chat + practice_generation + practice_evaluation）
  3. 最近 24h 错误数 + 导出批次 + 审计覆盖率
- `/admin/providers` 的 `ProviderCapabilityMatrix` 用**断链色**（destructive）标未绑定能力
- `/admin/logs` 有 level / trace_id / user_id 筛选
- 用户表有班级 + 最近登录列，"CSV 导入"走标准 Dialog（删 disabled 按钮）
- 管理端所有表单走**统一 Dialog 模式**（MCP、Provider、Preset、CSV 导入、Export 都一致）

## Tools Available

### 内部
| 工具 | 例子 |
|-|-|
| `gitnexus_query` | `gitnexus_query({query: "provider capability health"})` |
| `gitnexus_context` | `gitnexus_context({name: "ProviderCapabilityMatrix"})` |
| `get_file_structure` | `get_file_structure({repo_name: "GSW-EDU", file_path: "web/src/lib/data/admin.ts"})` |
| `mcp__supabase-remote__list_tables` | 确认 `provider_configs` / `provider_capabilities` / `export_batches` 真实列 |

### 外部
| 工具 | 必查 |
|-|-|
| context7: `/shadcn-ui/ui` | `Dialog` / `DataTable` / `Command` 当前组合 |
| context7: `/vercel/next.js` | `loading.tsx` / `error.tsx` / route handler `NextRequest` |
| tavily | `"admin dashboard capability matrix 2026"`、`"api key rotation ui best practice"`、`"observability dashboard for small team 2026"` |

## Files to Fill / Create

### 必建
1. **新建 `.trellis/spec/frontend/admin-workspace.md`**（主 spec）
   - Section: Three-Question Cockpit（学生 / 教师链路 + 24h 健康）
   - Section: Capability Matrix With Broken-Link Alerts
   - Section: Provider Secret Lifecycle（创建时间 / 最近使用 / 轮换提醒）
   - Section: Unified Dialog Pattern（Provider / MCP / Preset / CSV / Export 一套模式）
   - Section: Log Explorer（level/trace_id/user_id/search + 分页）
   - Section: User Table v2（+ 班级 / 最近登录，CSV 导入走 Dialog）
   - Section: Dataset Preview（前 100 条样本 + 篇目分布 + 覆盖率）
   - 每节含 Scope / Signatures / Contracts / Validation Matrix / Good/Base/Bad / Tests / Wrong vs Correct

2. **更新 `.trellis/spec/frontend/index.md`** 加条目

3. **更新 `.trellis/spec/frontend/ui-ux-guidelines.md`**「Admin Setup And Governance UX」scenario 末尾加 see also

### 范围（严格）
- 仅动 `admin-workspace.md`（新建）、`index.md`、`ui-ux-guidelines.md`（see also）
- 不改源码、不 git、不动其它 task

## Important Rules

### 基于真实
- 字段必须对齐 Supabase 真实列（supabase-remote MCP 核对）
- Dialog / DataTable 必须是 shadcn 已装的原语
- 健康总览的指标必须**能从现有数据层查出**（不造假 KPI）

### 不做（v1 不做）
- 不做多租户 / 学校 × 年级 三级结构（PRD v2 已简化）
- 不做 MCP 运行时集成 UI（只做注册）
- 不做实时 WebSocket 日志流（v1 仅 polling）

### 平行 agent — 守车道
- 只动 3 个 spec 文件
- 不改源码、不 git、不碰其它 task

## Acceptance Criteria

- [ ] Three-Question Cockpit 给出具体 data 查询（SQL 或 data function 签名）
- [ ] Capability Matrix 说明"断链"如何判定（SQL / aggregation 逻辑）
- [ ] Secret Lifecycle 列出字段需求 → 如 Supabase `provider_configs` 需加 `created_at`、`last_used_at`、`rotated_at`（若缺，给迁移 SQL 草稿）
- [ ] Unified Dialog Pattern 给出抽象（base component 签名） + 至少 2 个具体使用示例
- [ ] Log Explorer 筛选器 wireframe + URL query 参数契约
- [ ] Dataset Preview 给出导出样本结构示例（SFT JSONL 真实格式）
- [ ] 无 TBD / TODO
- [ ] `index.md` 条目齐

## Technical Notes

- 入口：`web/src/app/admin/**`
- 核心 client: `provider-capability-matrix.tsx`, `provider-config-dialog.tsx`, `provider-actions.tsx`, `mcp-server-dialog.tsx`, `setup-checklist.tsx`, `admin-log-viewer.tsx`
- Lib: `web/src/lib/data/admin.ts`, `web/src/lib/observability/**`, `web/src/lib/crypto/secret-cipher.ts`
- Supabase: `provider_configs`, `provider_capabilities`, `mcp_servers`, `prompt_presets`, `export_batches`, `profiles`, `classes`, `class_memberships`
- 依赖：`05-04-ui-design-system`（chip / alert 色）
