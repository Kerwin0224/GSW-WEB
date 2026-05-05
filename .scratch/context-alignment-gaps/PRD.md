Status: needs-triage

# PRD: CONTEXT 语境对齐缺口修复

## Problem Statement

05-05 UIUX 主线已经落地学生、教师、管理员三角色核心页面，但仍有两类可见体验与 `CONTEXT.md` 的产品语境不完全一致：教师侧仍暴露“审计”等后台治理术语，管理员侧虽然已有用户与班级数据入口雏形，但缺少独立的用户权限页与班级成员管理入口。用户希望这些缺口进入正常 PRD/Trellis 流程并实现，而不是继续依赖口头约定。

## Solution

收敛为一次最小语境对齐实现：教师侧所有可见文案统一使用“教学正确性核实”“待核实学习记录”“本周核实覆盖”等领域语言，避免对教师暴露“审计/SFT/DPO/打标”等专业数据术语；管理员侧补齐独立用户权限页入口，并在班级页提供成员管理入口，复用已有 CSV 导入、profiles、classes 与 class_memberships 数据，不扩大为复杂权限系统。

## User Stories

1. As a 教师, I want 教师看板使用“待核实学习记录”, so that 我不会被后台数据治理术语干扰。
2. As a 教师, I want 学情页面显示“本周核实覆盖”, so that 我理解这是教学正确性核实工作而不是系统审计。
3. As a 教师, I want 进入核实队列的按钮避免“审计”, so that 操作语义贴合我的教学工作。
4. As a 教师, I want 错误加载状态也使用“学习记录核实”, so that 失败信息仍符合产品语境。
5. As a 教师, I want 教师侧不出现 SFT/DPO/打标, so that 我只需要确认或修订学习记录。
6. As an 管理员, I want 在侧边栏看到“用户权限”, so that 我能独立处理账号、角色和状态。
7. As an 管理员, I want 用户权限页展示真实 profiles, so that 我能看到学校账号的角色与启用状态。
8. As an 管理员, I want 用户权限页复用 CSV 导入, so that 我能批量导入账号而不是只在看板卡片里操作。
9. As an 管理员, I want 班级页提供成员管理入口, so that 我能从班级上下文处理教师与学生归属。
10. As an 管理员, I want 班级成员管理基于 class_memberships, so that 教师权限边界与班级归属保持一致。
11. As an 管理员, I want AI Native 后台仍保留 SFT/DPO/Provider/MCP 等专业术语, so that 管理员能进行专业 AI 运维。
12. As a 开发者, I want 保持 lint/typecheck/build 通过, so that 本轮语境对齐不会破坏已提交主线。

## Implementation Decisions

- 修改教师可见文案层，不改变 audit_records 等数据库命名和后台数据模型。
- 教师侧专业数据术语只在管理员教学数据导出中保留。
- 新增或补齐管理员用户权限页面，读取 profiles 并接入已有 CSV 导入组件。
- 班级页补齐成员管理入口，最小实现为基于现有 class_memberships 的成员可见性与导入/管理入口，不引入复杂 RBAC。
- 侧边栏新增学校管理下的用户权限入口，并保持学校管理 / AI 运维分组。
- 不新增 Supabase schema，除非实现发现现有表无法表达必要的成员关系。
- 所有改动保持当前 Next.js App Router、server actions、shadcn/ui 与现有数据层风格。

## Testing Decisions

- 验证外部行为：教师页面文案不出现“审计/SFT/DPO/打标”，管理员页面仍允许专业术语出现在 AI 运维区域。
- 验证用户权限页能在无用户、有用户、导入入口三种状态下渲染。
- 验证班级页成员入口在无成员、有成员时都能渲染。
- 本轮至少运行 lint、TypeScript typecheck、production build。
- 如果新增纯数据整理函数，应优先写单元测试；若只改页面组合与文案，则以构建和页面渲染路径为主。

## Out of Scope

- 不实现复杂权限矩阵、细粒度 RBAC 或权限审批流。
- 不重构 Supabase RLS。
- 不改变 audit_records、export_batches 等后台数据命名。
- 不重做学生项目/挑战主路径。
- 不新增真实浏览器端登录 E2E。

## Further Notes

本 PRD 的核心不是新增大功能，而是把已经实现的 UIUX 主线与 `CONTEXT.md` 的领域语言收口，避免教师体验被管理员/AI 训练数据语义污染。
