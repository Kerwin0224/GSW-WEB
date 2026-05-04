# Fill UI design system spec (刀 1：视觉系统统一)

## Goal

在 `.trellis/spec/frontend/ui-ux-guidelines.md` 基础上，建立一份**可落地的视觉 token 系统** —— Bloom 六色 CSS 变量、字体、radius/shadow、深色模式色票 —— 并回写为 spec scenarios，让后续 Codex 执行 UI 任务时有单一真源。

## Context

### 项目一句话
文韵智途（GSW-EDU），中学古诗词与文言文 AI 教学工作台，Next.js 16 + Tailwind v4 + shadcn/ui + Vercel AI SDK v6 + Supabase。

### 当前视觉状态（已踩点）
- `web/src/app/globals.css` 无自定义 heading 字体；代码里 `font-heading` 类已被 `workspace-hero.tsx`、`project-card.tsx` 等使用 → 目前是**死类**。
- `web/src/components/workbench/bloom-badge.tsx` + `bloom-ladder.tsx` 是**唯一**使用 Bloom 六色的地方，色值硬编码，其它组件一律 zinc/slate。
- `.trellis/spec/frontend/ui-ux-guidelines.md:44-58` 已有 `--bloom-1..6` 占位但**未落地到 `globals.css`**。
- shadcn 组件全部安装在 `web/src/components/ui/`（29 个原语），风格 new-york。
- `next-themes` 已集成（`app/layout.tsx`），`.dark` 类策略。
- Tailwind v4 使用 `@theme inline`（**需用 context7 核对当前语法**），`tw-animate-css` 已在 package.json。

### 业务色语义（来自 PRD.md §6.1-6.2）
| Token | 浅色 | 深色 | 用途 |
|-|-|-|-|
| background | 米白 #FAF8F1 | 墨灰 #1A1A2E | 主背景 |
| primary | 黛蓝 #4A6FA5 | 月白 #7EA3CC | 主交互 |
| destructive | 朱砂 #C04851 | 亮朱 #E0606A | 警告/删除 |
| accent | 紫金 #B7A57A | 亮紫金 #D4C49A | 成就/突破 |
| bloom-1..6 | 黛蓝→天青→竹青→赭石→朱砂→紫金 | 同系提亮 | Bloom 层级 |

### 字体
- Heading：**LXGW WenKai（霞鹜文楷）**，开源，可通过 `@fontsource/lxgw-wenkai` 或 CDN 引入；**必须用 `next/font/local` 或 `next/font/google` 避免布局抖动**（用 context7 查 next/font 当前 API）。
- Body：系统字体栈（回退思源黑体 → PingFang SC → system-ui）。
- 等宽：`ui-monospace`（保留 shadcn 默认）。

### 成功信号
- 全仓库无硬编码 `#4A6FA5` / `#C04851` 等色值；都走 `var(--primary)` / `bg-bloom-{n}`。
- `font-heading` 类真实生效（heading 变霞鹜文楷）。
- `BloomBadge` 只需 `level` prop，颜色从 CSS 变量读取。
- 深色模式下六色、alert、primary 都有显式色票（不是反转）。

## Tools Available

你有两类 MCP + 外部工具，**必须**在写 spec 前用：

### 内部代码分析
| 工具 | 用途 | 示例 |
|-|-|-|
| `gitnexus_query` | 找设计系统相关流 | `gitnexus_query({query: "bloom color"})` |
| `gitnexus_context` | 符号 360° 视图 | `gitnexus_context({name: "BloomBadge"})` |
| `get_file_structure` | AST 级文件结构 | `get_file_structure({repo_name: "GSW-EDU", file_path: "web/src/components/workbench/bloom-badge.tsx"})` |
| `get_ast_node` | 取精确节点+依赖 | `get_ast_node({...})` |

### 外部最佳实践
| 工具 | 用途 |
|-|-|
| `mcp__context7__resolve-library-id` + `query-docs` | 核对 **Tailwind v4 `@theme inline` 语法、`next/font/google` API、shadcn tailwind v4 迁移、tw-animate-css API** |
| `mcp__tavily-remote__tavily_search` | 搜最新的「Tailwind v4 CSS variables best practice 2026」「LXGW WenKai next.js integration」「WCAG 2.1 AA bloom color contrast」 |

### 必查清单（最少 5 次 context7 / 3 次 tavily）
1. `context7: /vercel/next.js` → `next/font` 当前 API
2. `context7: /tailwindlabs/tailwindcss` → v4 `@theme inline` + `@custom-variant dark` 是否真实
3. `context7: /shadcn-ui/ui` → shadcn + Tailwind v4 的 token 映射约定
4. `tavily: "LXGW WenKai next.js next/font local 2026"`
5. `tavily: "tailwind v4 oklch bloom design tokens"`
6. `tavily: "WCAG 2.1 AA contrast ratio Chinese education UI"`

## Files to Fill / Create

仅修改 `.trellis/spec/frontend/` 下的 **新建** `design-tokens.md`，以及**更新** `ui-ux-guidelines.md` 里的 Design System scenario。

### 必建 / 必改
1. **新建 `.trellis/spec/frontend/design-tokens.md`**
   - Bloom 六色 CSS 变量（oklch 优先，fallback hex）完整色卡
   - 浅色 / 深色 token 对照表（background/primary/destructive/accent）
   - `globals.css` 完整示例（可直接复制）
   - Tailwind v4 `@theme inline` 映射示例（用 context7 核对语法）
   - `font-heading` / `font-sans` / `font-mono` 声明（next/font 引入方式）
   - `--radius` / `--shadow-soft` / `--shadow-ink` token
   - 禁止列表：禁止 `text-red-500` 等原生色；禁止硬编码 hex
   - 反面示例 vs 正确示例

2. **更新 `.trellis/spec/frontend/ui-ux-guidelines.md`**
   - 把 §44-58 的占位 token 替换为对 `design-tokens.md` 的引用
   - 新增 "Scenario: Dark Mode Color Remapping" 段

3. **更新 `.trellis/spec/frontend/index.md`**
   - 把 `design-tokens.md` 加进表格

### 文件范围（严格）
- 仅修改 `.trellis/spec/frontend/design-tokens.md`、`ui-ux-guidelines.md`、`index.md`
- 禁止碰 `.trellis/spec/backend/`、`guides/`、其它任务目录
- 禁止改 `web/` 下任何源码（UI 落地是后续 `05-04-ui-student-core-loop` 等任务的事）
- 禁止 `git commit`

## Important Rules

### Spec 文件可动
- 如果 context7 查出 Tailwind v4 **不支持** `@theme inline`，改用其真实支持的语法
- 如果 LXGW WenKai 在 Google Fonts 没有，写 `next/font/local` + `@fontsource/lxgw-wenkai` 两种方案
- 不要造 API：每条色值、每条字体加载代码都要能在 Next 16 + Tailwind v4 真实跑通

### 平行 agent — 守车道
- **只**动上面列的 3 个文件
- 可读任何文件
- 不改源码、不 git、不改其它 task

## Acceptance Criteria

- [ ] `design-tokens.md` 含可直接复制的 `globals.css` 完整 token 块（浅色 + 深色）
- [ ] 六色都有 oklch 值 + hex fallback + WCAG 对比度说明
- [ ] next/font 示例是**官方 API**（context7 核对过）
- [ ] Tailwind v4 `@theme` 语法**经 context7 / tavily 交叉验证**
- [ ] 含 "禁止硬编码 hex" + "禁止 `text-red-500`" 的 forbidden 列表
- [ ] `ui-ux-guidelines.md` 的 token 段已指向新 spec
- [ ] `index.md` 已加 `design-tokens.md` 条目
- [ ] 无 "TBD"、"To be filled"、"TODO" 占位

## Technical Notes

- Package: `web/` (Next.js 16 App Router, single-repo mode)
- Deps: next@16, tailwindcss@4, @tailwindcss/postcss@4, tw-animate-css, next-themes
- Build: `cd web && pnpm run build` （不要求执行，但 token 必须能通过 build）
- 现有 globals.css 路径：`web/src/app/globals.css`（写 spec 时参考此文件的**当前真实内容**）
