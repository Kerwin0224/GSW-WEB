# Fill student workspace spec (刀 2+3：学生端核心闭环)

## Goal

把学生端的核心循环 —— **提问 → 认知层级可见 → 攀升提示 → 挑战突破 → 个人画像** —— 落成一份可被 Codex 直接按部就班实现的 frontend spec。**聚焦：不再把首页当介绍页**，而是工作台；**聚焦：让 Bloom 层级在对话过程中实时可感**。

## Context

### 现状缺陷（审计得出）
1. `web/src/app/student/page.tsx:30-73` 首屏是 Hero + 3×PrincipleCard + 3×Metrics，对话窗口 scroll 到第二屏，核心功能被挤走。
2. 每条消息的 Bloom 徽章在 `components/workbench/ai-message-list.tsx` 已渲染，但**对话顶部无"本次会话涉及层级"统计 bar**（PRD §4.1.1 要求）。
3. 认知路径图 `BloomLadder` 只藏在 `/student/projects/[id]` Tab 下（`app/student/projects/[projectId]/page.tsx:66-73`），对话中无法实时看到攀升。
4. `/student/me` 只有 6 个数字方块（`app/student/me/page.tsx:64-72`）→ 未用雷达图，`recharts` 已在 deps 却未使用。
5. `ProjectCard`（`components/workbench/project-card.tsx`）只有 title/author/count，缺缩略层级条、最高层级、挑战进度（PRD §4.2.2）。
6. `/student/challenge/[projectId]` 与 `/student/(student)/challenge/[projectId]` 两套路由共存，route group 残留。
7. 消息气泡无复制/重试/regenerate 按钮。
8. 无"你可以尝试…"攀升提示卡（PRD 用户故事 #7）—— 差异化核心。
9. 无"点认知路径节点 → 展开当时对话"跳转（PRD §4.2.1）。
10. 挑战页无"需要提示"按钮、无失败后回 L{n-1} 的分流（PRD 交互状态矩阵）。

### 学生端的"唯一工作"
学生坐下来想的是：**这首诗我哪里没懂。** 所以首屏必须是对话 + 项目侧栏 + 右侧认知实时状态。其它都是干扰。

### 已存在但未用的资产
- `BloomLadder`、`BloomBadge`、`BloomStatusBadge`
- `student-chat-client.tsx` 已用 `useChat`
- `recharts` 已装（雷达图现成）
- `challenge-engine.ts` 已存在（`web/src/lib/challenge-engine.ts`，审计指向 M3 已在实现中）
- `bloom-engine.ts` 已存在（`web/src/lib/bloom-engine.ts`）

### 成功信号
- 学生登录后**第一眼**看到的是：左项目栏 + 中对话区 + 右本次会话 Bloom 统计。
- 每条 AI 回答末尾有一张"攀升提示"卡片（内容由 API 返回，前端只负责渲染）。
- 雷达图在 `/student/me` 真实显示六维。
- 挑战页沉浸式全屏，竖向进度条，成功有**简化**突破动画（2s scale+opacity，**不做**金色粒子，过度设计）。
- 单一挑战路由 `/student/challenge/[projectId]`，删掉 route group 重复。

## Tools Available

### 内部代码分析
| 工具 | 例子 |
|-|-|
| `gitnexus_query` | `gitnexus_query({query: "student chat flow"})` |
| `gitnexus_context` | `gitnexus_context({name: "StudentChatClient"})` |
| `gitnexus_impact` | `gitnexus_impact({target: "BloomLadder", direction: "upstream"})` 确认修改点 |
| `get_repo_structure` | `get_repo_structure({repo_name: "GSW-EDU"})` |
| `get_file_structure` | `get_file_structure({repo_name: "GSW-EDU", file_path: "web/src/components/workbench/student-chat-client.tsx"})` |
| `get_ast_node` | 取 `StudentChatClient`、`AIMessageList`、`ChatComposer`、`BloomLadder` 的精确实现 |

### 外部最佳实践（必用）
| 工具 | 必查 |
|-|-|
| context7: `/vercel/ai` | `useChat` v6 真实 API（`message.parts`、`onFinish`、`data` 流） |
| context7: `/vercel/next.js` | App Router parallel routes、loading.tsx、Server Components pattern |
| context7: `/recharts/recharts` | RadarChart `PolarGrid` / `PolarAngleAxis` 当前 props |
| tavily | `"bloom taxonomy visualization ui best practice"`、`"chatgpt chat layout three pane 2026"`、`"sonner toast pattern education"` |

## Files to Fill / Create

### 必建
1. **新建 `.trellis/spec/frontend/student-workspace.md`**（主 spec）
   - Section: Three-Pane Chat Layout（左项目 / 中对话 / 右 Bloom 实时）
   - Section: Per-Message Bloom Badge + Ascension Suggestion Card
   - Section: Session-Level Bloom Stats Bar
   - Section: Project Card v2（缩略层级条 + 最高层级 + 挑战进度）
   - Section: Cognitive Profile Radar（`/student/me` 用 Recharts 的落地）
   - Section: Immersive Challenge Page（沉浸式 + 竖向进度 + 简化突破动画）
   - Section: Route Dedup（删掉 `(student)/challenge` route group）
   - 每个 Section 含：Scope / Signatures / Contracts / Validation & Error Matrix / Good/Base/Bad / Tests Required / Wrong vs Correct —— 与 `ui-ux-guidelines.md` 风格一致

2. **更新 `.trellis/spec/frontend/index.md`** 加 `student-workspace.md`

3. **更新 `.trellis/spec/frontend/ui-ux-guidelines.md`** 在 "Bloom-Centered Student UX" scenario 末尾加 "See also: student-workspace.md"（不要重写已有内容）

### 文件范围（严格）
- 仅修改 `.trellis/spec/frontend/student-workspace.md`（新建）、`index.md`、`ui-ux-guidelines.md`（小改 see also）
- 禁止修改其它 spec 目录、其它 task 目录
- 禁止改 `web/` 源码
- 禁止 git

## Important Rules

### Spec 可随现实调整
- 如果 `challenge-engine.ts` 实际接口和 PRD 不同，以**代码实际为准**（用 ABCoder 读真实 API）
- 如果 `useChat` v6 没有 `data` 流，用 `message.parts` 的 custom part
- 禁止写基于训练数据猜的 API —— 必须 context7 核对一次

### 不做（节约时间 & 反过度设计）
- 不做金色粒子动画（PRD §6.7.2 的 2500ms 仪式动画）—— 用 2s scale+opacity 代替
- 不做"中国传统色系统"装饰层（水墨纹理等）
- 不实现 MCP Server UI
- 不做连续学习天数、周报等游戏化

### 平行 agent — 守车道
- 只动上面列的 3 个 spec 文件
- 可读任何文件（`web/src/**`、`lib/**`、`PRD.md`、其它 spec 只读）
- 不改源码、不 git、不改其它 task

## Acceptance Criteria

- [ ] `student-workspace.md` 每节都有从真实代码摘录的代码块（带文件路径）
- [ ] 每节都有 Wrong vs Correct 示例
- [ ] Three-Pane Chat Layout 给出 `app/student/page.tsx` 的 **Server Component 数据获取 + Client Component 交互** 拆分示例
- [ ] Cognitive Profile Radar 用 Recharts 真实 props（context7 核对）
- [ ] Challenge page 给出完整 route `/student/challenge/[projectId]` 的文件结构 + 删除旧 route group 的说明
- [ ] Ascension Suggestion Card 是前端纯渲染（数据来自后端 onFinish），不在前端造 prompt
- [ ] 无 TBD / TODO 占位
- [ ] `index.md` 加好条目

## Technical Notes

- 入口文件：`web/src/app/student/**`
- 核心 client 组件：`web/src/components/workbench/student-chat-client.tsx`, `ai-message-list.tsx`, `chat-composer.tsx`, `bloom-ladder.tsx`, `bloom-badge.tsx`, `project-card.tsx`
- 核心 lib：`web/src/lib/bloom-engine.ts`, `challenge-engine.ts`, `data/student.ts`
- Deps: `@ai-sdk/react`, `ai@6`, `recharts`, `next@16`, `next-themes`
- Bloom 色值来源：`05-04-ui-design-system` 任务产出的 `design-tokens.md`（依赖它，但不等它完成 —— spec 可并行写）
