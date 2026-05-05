# PRD 质量审计：技术栈验证与过度设计检查

## Goal

对现有的 111KB PRD 文档进行全面质量审计，从第一性原理出发，确保：
1. **无幻觉**：所有技术方案基于真实的库能力，不臆造 API
2. **无过度设计**：只保留必要的功能和抽象，去除不必要的复杂度
3. **最佳实践**：验证技术栈（Next.js 16, Vercel AI SDK v6, Supabase, Tailwind v4, shadcn/ui v4）的正确用法

## What I Already Know

### 现有 PRD 状态
- **文件**: `PRD.md` (111KB, 2300+ 行)
- **产品**: 文韵智途 - 古诗词与文言文 AI 教学助手
- **核心理论**: 布鲁姆认知层次（Bloom's Taxonomy）
- **技术栈**: Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui v4 + Vercel AI SDK v6 + Supabase

### 已完成的差距分析
- 已生成 `PRD-GAP-ANALYSIS.md`
- 总体完成度约 55%
- 识别出架构、功能、测试三大差距

### 审计范围
1. **技术栈验证**：查询真实 API 和能力边界
2. **架构审计**：检查 7 个深度模块是否过度设计
3. **功能审计**：检查每个功能的必要性
4. **UI/UX 审计**：检查设计是否符合现代最佳实践

## Assumptions (Temporary)

- PRD 中可能存在基于过时文档或臆想的 API 用法
- 某些"深度模块"可能是过度抽象
- 某些 UI 设计可能过于复杂
- 需要通过 Context7 和 Tavily 验证真实能力

## Open Questions

✅ **已确认**：
- 审计优先级：**全面并行审计**（技术栈 + 架构 + 功能同时进行）
- 审计深度：**重写 PRD**（基于审计结果重新设计）

## Requirements (Confirmed)

### 审计维度（并行进行）

#### 1. 技术栈验证
- [ ] **Vercel AI SDK v6**：验证 `streamText()`, `generateText()`, `tool()`, `convertToModelMessages()`, `customProvider()` 等 API
- [ ] **Next.js 16 App Router**：验证 Server Components、API Routes、Middleware、约定和限制
- [ ] **Supabase**：验证 RLS 策略写法、Auth 集成、Database Types 生成
- [ ] **Tailwind v4**：验证配置方式、`@theme inline`、自定义变体
- [ ] **shadcn/ui v4**：验证组件安装方式、Tailwind v4 兼容性

#### 2. 架构审计
- [ ] **7 个深度模块**：评估每个模块的必要性和接口设计
  - M1: AI Pipeline
  - M2: Bloom Engine
  - M3: Challenge Engine
  - M4: Audit Pipeline
  - M5: Provider Registry
  - M6: Org Manager
  - M7: Dataset Export
- [ ] **目录结构**：评估 `features/` 组织方式的必要性
- [ ] **抽象层次**：识别过度抽象和不必要的间接层

#### 3. 功能审计
- [ ] **核心功能**：AI 对话、布鲁姆认知路径、挑战练习、教师审计、管理端
- [ ] **MVP 范围**：识别可以延后或删除的功能
- [ ] **用户故事**：验证每个用户故事的必要性（PRD 第 4.6 节有 59 个用户故事）

#### 4. UI/UX 审计
- [ ] **视觉设计**：评估中国传统色系统、字体选择的必要性
- [ ] **交互设计**：评估动效系统、状态矩阵的复杂度
- [ ] **无障碍**：评估 WCAG 2.1 AA 级要求的实现成本

### 输出物
- [ ] 生成完整的审计报告（`PRD-AUDIT-REPORT.md`）
- [ ] 基于审计结果重写 PRD（`PRD-v2-SIMPLIFIED.md`）

## Acceptance Criteria (Completed)

- [x] 生成审计报告，列出所有发现的问题（幻觉、过度设计、最佳实践违背）
- [x] 每个问题都有具体的证据（文档链接、代码示例）
- [x] 提供修复建议（如何改进 PRD）
- [x] 审计报告保存为 `PRD-AUDIT-REPORT.md`
- [x] 基于审计结果重写 PRD（`PRD-v2-SIMPLIFIED.md`）

## Definition of Done (Team Quality Bar)

- 审计报告完整且有据可查
- 所有技术栈验证都基于官方文档
- 识别出的过度设计有清晰的简化路径
- 用户确认审计结果

## Out of Scope (Explicit)

- 不重写整个 PRD（除非用户明确要求）
- 不实现代码（这是审计任务，不是开发任务）
- 不做性能测试或安全审计

## Technical Notes

### 需要查询的文档
- Vercel AI SDK v6: https://sdk.vercel.ai/docs
- Next.js 16: https://nextjs.org/docs
- Supabase: https://supabase.com/docs
- Tailwind CSS v4: https://tailwindcss.com/docs
- shadcn/ui v4: https://ui.shadcn.com/docs

### 审计方法
1. 使用 Context7 查询库函数的真实签名
2. 使用 Tavily 搜索最佳实践
3. 对比 PRD 中的设计与真实能力
4. 识别过度抽象和不必要的复杂度

## Research References

- [`research/vercel-ai-sdk-v6.md`](research/vercel-ai-sdk-v6.md) — 验证 Vercel AI SDK v6 API 真实性（大部分真实存在）
- [`research/nextjs-16-app-router.md`](research/nextjs-16-app-router.md) — 发现 middleware vs proxy.ts 架构冲突
- [`research/tailwind-shadcn-v4.md`](research/tailwind-shadcn-v4.md) — 发现 @custom-variant 语法可能不存在
- [`research/supabase-integration.md`](research/supabase-integration.md) — 发现实际使用自定义 session 而非 Supabase Auth

## 审计结果总结

### 技术栈验证
- ✅ Vercel AI SDK v6：大部分 API 真实存在
- ⚠️ Next.js 16：存在 middleware vs proxy.ts 架构冲突
- ⚠️ Tailwind v4：部分语法需要验证
- ⚠️ Supabase：实际实现与 PRD 设计存在显著差异

### 架构审计
- ❌ 7 个深度模块过度设计，简化为 3 个
- ✅ 实际的扁平目录结构比 PRD 的 features/ 更合理
- ❌ 删除不必要的抽象层

### 功能审计
- ✅ 核心功能（AI 对话、布鲁姆路径、挑战、审计）保留
- ❌ 删除 MCP Server、中国传统色、霞鹜文楷等过度设计
- ⚠️ 明确 MVP 范围

### 输出物
- ✅ `PRD-AUDIT-REPORT.md` - 完整审计报告（6/10 评分）
- ✅ `PRD-v2-SIMPLIFIED.md` - 简化版 PRD（从 2300 行简化到 800 行）
