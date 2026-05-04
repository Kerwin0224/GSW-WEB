# Fill teacher workspace spec (刀 2+3：教师端三栏审计 + 可行动学情)

## Goal

把教师端三个当前孤立的功能 —— **备课对话 / SFT·DPO 审计 / 学情看板** —— 串成一个"为下一节课服务"的闭环，并落成 frontend spec。核心：**三栏审计页、教师自管 System Instruction、可行动学情指标**。

## Context

### 现状缺陷（审计得出）
1. `/teacher/audit` 直接 `<TeacherAuditClient records={...} />` 撒开（`app/teacher/audit/page.tsx:8`）—— **未实现 PRD §4.4.2 的三栏**（学生列表 / 对话记录 / SFT·DPO 审计面板）。
2. `/teacher/analytics` 三张数字卡 + 一个空态（`app/teacher/analytics/page.tsx:38-52`），**零热力图、零排行、零预警**。PRD §4.4.3 三个核心视图全缺。
3. System Instruction 管理在 `/admin/presets`（管理员下），教师无法自建 / 编辑 / 预览（PRD §4.4.1 明确要求教师管）。
4. 审计状态 chip（pending/approved/rejected × sft/dpo）无色彩系统，队列无法扫视。
5. 备课 → 审计 → 学情之间**无交叉跳转**（"从这条高质量对话建预设"不存在）。
6. SFT/DPO 双模式在 `teacher-audit-client.tsx` 是 form，但表单**未给出对比视图**（原答案 vs 修正答案 侧边分栏）。
7. 缺 `{{学生姓名}}/{{当前篇目}}` 变量插值编辑器 + 左编辑 / 右预览分栏（PRD 用户故事 #38）。
8. 缺三维筛选（班级 × 篇目 × 学生）。
9. 缺异常预警（某学生连续 8 题停 L1-L2 → 建议）。
10. 缺备课笔记沉淀 —— AI 备课输出不会落盘。

### 教师端"唯一工作"
教师坐下来想的是：**明天这节课怎么上。** 所以教师端要给：**预设驱动的备课对话 + 对课堂真实对话打分 + 知道哪个学生卡在哪里**。

### 已存在但未用透
- `teacher-audit-client.tsx`（有 SFT/DPO 表单骨架）
- `teacher-chat-client.tsx`（预设选择 + 对话）
- `lib/data/teacher.ts`: `getTeacherWorkspace`, `getTeacherAuditQueue`, `getTeacherAnalytics`
- `audit_records` 表已含 sft/dpo/approved/pending/rejected × quality × rationale × metadata

### 成功信号
- `/teacher/audit` 是标准三栏：左学生列表（可搜可过滤班级）、中源对话（只读、高亮被审消息）、右 SFT+DPO 表单（双 tab + 原答案/修正答案并排）。
- `/teacher/analytics` 首屏是 **可行动卡片**：Top 5 卡住学生 + Top 5 薄弱篇目 + 本周审计覆盖率。
- 教师能在 `/teacher/instructions` 自建 prompt 预设，左编辑右预览（mock 对话），变量插值高亮。
- SFT/DPO 审计状态有统一 chip 色（参考 `design-tokens.md`）。
- 状态栏 + 跨页跳转：从"某条 pending"直接进审计三栏、从学情"卡住学生"跳到他的对话。

## Tools Available

### 内部
| 工具 | 例子 |
|-|-|
| `gitnexus_query` | `gitnexus_query({query: "audit workflow"})` |
| `gitnexus_context` | `gitnexus_context({name: "TeacherAuditClient"})` |
| `get_file_structure` | `get_file_structure({repo_name: "GSW-EDU", file_path: "web/src/components/workbench/teacher-audit-client.tsx"})` |
| `get_ast_node` | 取 SFT/DPO form 精确结构 |
| `mcp__supabase-remote__list_tables` | 确认 `audit_records` 真实 schema |

### 外部
| 工具 | 必查 |
|-|-|
| context7: `/tanstack/table` 或 shadcn data-table | 三栏里中间"对话记录"用何种 scroll / virtualize |
| context7: `/vercel/ai` | tool call part 如何在教师对话里展示 |
| tavily | `"rlhf annotation ui best practice 2026"`、`"sft dpo labeling interface design"`、`"teacher dashboard actionable metrics edtech"` |

## Files to Fill / Create

### 必建
1. **新建 `.trellis/spec/frontend/teacher-workspace.md`**（主 spec）
   - Section: Three-Pane Audit Layout（学生列表 / 源对话 / SFT·DPO 表单）
   - Section: SFT vs DPO Form Contract（字段、校验、提交流）
   - Section: Original vs Corrected Answer Diff View
   - Section: Teacher Prompt Preset Editor（左编辑 / 右预览 / 变量插值）
   - Section: Actionable Analytics（Top 卡住学生、薄弱篇目、审计覆盖率 —— **不做热力图 v1**）
   - Section: Cross-Surface Navigation（audit ↔ analytics ↔ teacher chat 跳转规则）
   - Section: Audit Status Chip System（统一色 + a11y）
   - 每节包含 Scope / Signatures / Contracts / Validation Matrix / Good/Base/Bad / Tests Required / Wrong vs Correct

2. **更新 `.trellis/spec/frontend/index.md`** 加条目

3. **更新 `.trellis/spec/frontend/ui-ux-guidelines.md`**「Teacher Ask And Audit UX」scenario 末尾加 "See also"

### 范围（严格）
- 仅动 `teacher-workspace.md`（新建）、`index.md`、`ui-ux-guidelines.md`（see also）
- 不改源码、不 git、不碰其它 task

## Important Rules

### 基于真实代码
- SFT/DPO 字段必须对齐 `audit_records` 真实 schema（用 supabase-remote MCP 查）
- 表单组件必须用 shadcn 已装的 `form`/`dialog`/`tabs`/`select` 原语（`components/ui/**`）
- 若 PRD 和真实代码冲突，**代码实际为准**

### 不做
- v1 不做热力图（过度设计，先做 Top 列表）
- 不做 DPO 三路偏好（只支持 chosen/rejected 双路）
- 不做多教师协作标注共享

### 平行 agent — 守车道
- 只动 3 个 spec 文件
- 可读任何文件
- 不改源码、不 git、不动其它 task

## Acceptance Criteria

- [ ] Three-Pane Audit 的 wireframe（ASCII 或 Mermaid）+ 每栏组件清单
- [ ] SFT/DPO 表单字段对齐 Supabase `audit_records` 真实 schema（给出 column 列表）
- [ ] Preset Editor 给出变量插值语法决策（`{{var}}` vs handlebars），含 context7 核对
- [ ] Actionable Analytics 给出 SQL 骨架（"Top 5 卡住学生"怎么算）
- [ ] 统一审计状态 chip 色引用 `design-tokens.md` 的 token
- [ ] 无 TBD / TODO
- [ ] `index.md` 条目齐

## Technical Notes

- 入口：`web/src/app/teacher/**`
- 核心 client：`web/src/components/workbench/teacher-audit-client.tsx`, `teacher-chat-client.tsx`
- Lib：`web/src/lib/data/teacher.ts`, `data/teacher-actions.ts`
- Supabase: `audit_records`, `conversations`, `conversation_messages`, `practice_records`, `prompt_presets`
- 依赖任务：`05-04-ui-design-system`（chip 色）
