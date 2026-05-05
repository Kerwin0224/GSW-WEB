# 总体验证审查与 gap 修复

## Goal

对刚完成的 Student、Teacher、Admin 三条 UI lane 做统一收口：验证当前 working tree 是否可构建、是否有明显 lane 越界或安全/授权问题，核对已知 spec gaps，并对确认的问题做最小修复。

## What I already know

- Student agent `bjcljd06k` 已完成并报告 `npm run build` exit 0；实现了学生三栏工作台、Bloom/session stats、ascension hint、RadarChart、挑战页和 challenge route 去重。
- Teacher agent `bmghas42y` 已完成并报告 `npm run lint` / `npm run build` exit 0；实现了三栏审计、SFT/DPO、teacher preset editor、analytics，并修复过一个 teacher action 授权缺口。
- Admin agent `bhq0dnmtv` 已完成并报告 `npm run lint` / `npm run build` exit 0；实现了 admin cockpit、capability broken-link alert、secret lifecycle、统一 dialog、logs、CSV import、dataset preview，并新增迁移 `web/supabase/migrations/202605040001_admin_capability_lifecycle.sql`。
- 当前 repo 有大量未提交改动，三条 lane 的更改叠在同一个 working tree。

## Requirements

- 运行整体验证：至少覆盖 `web` lint、build、typecheck 或等价 Next build TypeScript 检查。
- 审查三条 lane 的 scope 边界，识别是否有意外修改 shared files 或跨 lane 破坏。
- 审查安全与授权边界：teacher/admin/student API/server actions 不得削弱 role/RLS/service-role/server-only 约束。
- 核对已知 gaps：
  - Admin provider P95 latency/token cost 需要未来 metrics/token-usage 表；本任务只确认是否应修或记录为 out-of-scope。
  - Admin CSV import preview 当前为内存预览；确认是否存在必须立即修复的持久化缺口。
  - Student ascension hint 当前为 deterministic/template-based；确认是否符合 MVP 或需要改为更明确 UI 标识。
  - Dataset `source_record_id` traceability gap 只在允许范围内修，不能破坏 read-only scope 决策。
- 对确认的缺陷做最小修复，不做大范围重构或新增无关功能。
- 不提交 git commit。

## Acceptance Criteria

- [ ] `web` lint 通过。
- [ ] `web` build 通过。
- [ ] TypeScript 检查通过，或 build 输出证明 TypeScript 阶段通过。
- [ ] 安全/授权审查无 HIGH/CRITICAL 未处理问题。
- [ ] Scope 越界审查有结论，任何 shared 文件改动都有明确原因。
- [ ] 已知 gaps 被分类为 fixed / accepted out-of-scope / needs follow-up。
- [ ] 若修改函数、class、method，先按项目规则跑 GitNexus impact 并记录风险。

## Definition of Done

- 验证命令有直接证据。
- 修复只覆盖确认问题。
- 新增迁移仅保留为待 review，不应用生产。
- 最终报告包含：修改文件、验证结果、修复项、剩余 gap、是否可进入 commit 拆分。

## Technical Approach

1. 先做 read-only 总体审查：git status/diff、构建脚本、关键 changed files、已知 gap 文件。
2. 并行委派 review lanes：安全审查、spec/scope 审查、构建验证。
3. 汇总结果后只修 confirmed gap；任何 symbol 编辑前先跑 GitNexus impact。
4. 修复后再跑最终 lint/build，并给出 commit readiness。

## Decision (ADR-lite)

**Context**: 三条并行 UI lane 已经完成，但 working tree 混合了多条路径，直接 commit 风险高。

**Decision**: 采用一个独立收尾 task 做整体审查、最小修复和最终验证；不在本任务内做大范围产品扩展或 schema 生产应用。

**Consequences**: 收尾更慢但可降低 lane 冲突、安全回归和 spec gap 漏检风险；未必要一次性消灭所有未来型 gap。

## Out of Scope

- 不实现完整 metrics/token-usage 数据模型，除非验证发现当前 UI 因缺表无法工作。
- 不把 CSV import 改成完整持久化批处理系统，除非验证发现当前 commit action 不可用或有数据安全问题。
- 不应用 Supabase migration 到生产。
- 不做 git commit / push。
- 不重写三条 lane 的整体 UI。

## Technical Notes

- Student task: `.trellis/tasks/05-04-ui-student-core-loop/`
- Teacher task: `.trellis/tasks/05-04-ui-teacher-audit-triple/`
- Admin task: `.trellis/tasks/05-04-ui-admin-capability/`
- Primary specs:
  - `.trellis/spec/frontend/student-workspace.md`
  - `.trellis/spec/frontend/teacher-workspace.md`
  - `.trellis/spec/frontend/admin-workspace.md`
  - `.trellis/spec/frontend/design-tokens.md`
  - `.trellis/spec/frontend/ui-ux-guidelines.md`
  - `.trellis/spec/backend/error-handling.md`
  - `.trellis/spec/backend/logging-guidelines.md`
