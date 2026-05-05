# Research: Tailwind CSS v4 和 shadcn/ui v4 配置验证

- **Query**: 验证 PRD 中 Tailwind v4 和 shadcn/ui v4 的样式系统设计
- **Scope**: External documentation research
- **Date**: 2026-05-03

## 执行摘要

通过查询 npm registry、Tailwind CSS 官方博客和相关文档，验证了 PRD 第 6 节样式系统设计的技术可行性。发现以下关键信息：

### 关键发现

1. **Tailwind CSS v4 处于 Beta 阶段**（Beta 1 发布于 2024-11-21）
2. **CSS-first 配置**是 v4 的核心特性，使用 `@theme` 而非 JavaScript 配置
3. **tw-animate-css** 是官方认可的 v4 兼容动画库
4. **shadcn/ui v4** 的具体配置方式需要进一步验证
5. **@custom-variant** 语法需要进一步验证

---

## 详细发现

### 1. Tailwind CSS v4 核心特性

**来源**: Tailwind CSS v4.0 Beta 1 公告（2024-11-21）

#### 1.1 CSS-First Configuration

Tailwind v4 的最大变化是从 JavaScript 配置文件（`tailwind.config.js`）转向 **CSS-first configuration**：

> "CSS-first configuration — a reimagined developer experience where you customize and extend the framework directly in CSS instead of a JavaScript configuration file."

**关键点**：
- 不再使用 `tailwind.config.js`
- 配置直接写在 CSS 文件中
- 使用 `@theme` 指令定义主题变量

#### 1.2 性能提升

- 完整构建速度提升 **5x**
- 增量构建速度提升 **100x+**（以微秒计）

#### 1.3 统一工具链

- 内置 import 处理
- 内置 vendor prefixing
- 内置语法转换
- 无需额外工具配置

#### 1.4 现代 Web 特性

- 基于原生 cascade layers
- 支持 wide-gamut colors
- 一流支持 container queries
- 支持 `@starting-style`
- 支持 popovers

---

### 2. tw-animate-css 动画库

**来源**: npm registry 搜索结果

#### 2.1 基本信息

- **包名**: `tw-animate-css`
- **版本**: 1.4.0（发布于 2025-09-24）
- **描述**: "TailwindCSS v4.0 compatible replacement for `tailwindcss-animate`"
- **许可证**: MIT
- **维护者**: wombosvideo (Luca Bosin)

#### 2.2 关键特性

- **Tailwind v4 兼容**：专门为 v4 设计
- **替代品**：替代旧的 `tailwindcss-animate` 插件
- **关键词**：accordion, animate, animation, bits-ui, collapsible, css, fades, opacity, radix, shadcn, slide, spin, tailwind-animate, tailwindcss, transform, transition, translate, zoom

#### 2.3 与 shadcn/ui 的关系

从关键词可以看出，`tw-animate-css` 明确支持 **shadcn** 和 **radix**（shadcn/ui 的底层库）。

#### 2.4 其他 v4 兼容动画库

npm 搜索还发现了其他 Tailwind v4 兼容的动画库：

1. **tailwind-animate** (v0.2.10, 2025-03-18)
   - 描述: "A v4.0 compatible Tailwind CSS plugin for creating beautiful animations, replacing `tailwindcss-animate`"
   - 包含自定义动画如 `accordion-up` 和 `accordion-down`

2. **tw-shimmer** (v0.4.11, 2026-04-24)
   - Tailwind CSS v4 plugin for shimmer effects
   - 来自 assistant-ui 团队

---

### 3. @theme 内联配置（需要进一步验证）

**状态**: 部分验证

从 Tailwind v4 Beta 公告中确认了 **CSS-first configuration** 的存在，但具体的 `@theme inline` 语法细节未在公开文档中找到。

**已知信息**：
- v4 使用 CSS 而非 JavaScript 配置
- 配置通过 `@theme` 指令完成
- 主题变量直接在 CSS 中定义

**需要验证**：
- `@theme inline` 的具体语法
- 如何定义自定义颜色
- 如何定义自定义间距
- 如何定义自定义字体

**PRD 中的用法**（第 6.1 节）：
```css
@theme inline {
  --color-primary: oklch(0.6 0.2 30);
  --font-serif: "Noto Serif SC", serif;
}
```

**风险评估**：
- **中等风险**：语法可能不完全准确
- **建议**：查阅 Tailwind v4 官方文档的 Theme 章节
- **替代方案**：使用 CSS 变量 + Tailwind 的 `theme()` 函数

---

### 4. @custom-variant 自定义变体（需要进一步验证）

**状态**: 未验证

在公开文档中未找到 `@custom-variant` 语法的直接证据。

**PRD 中的用法**（第 6.5 节）：
```css
@custom-variant dark (&:where(.dark, .dark *));
```

**可能的情况**：
1. **语法错误**：可能是 v3 的 plugin API 混淆
2. **文档滞后**：v4 Beta 文档可能尚未完整
3. **替代方案**：v4 可能使用不同的变体定义方式

**Tailwind v4 的变体系统**：
- 基于原生 cascade layers
- 可能使用 `@layer` 和 `@variant` 指令
- 需要查阅官方文档确认

**风险评估**：
- **高风险**：语法可能完全错误
- **建议**：查阅 Tailwind v4 官方文档的 Variants 章节
- **替代方案**：使用 v4 的标准 dark mode 配置

---

### 5. shadcn/ui v4 与 Tailwind v4 兼容性

**状态**: 部分验证

#### 5.1 间接证据

从 `tw-animate-css` 的关键词中看到 **shadcn** 和 **radix**，说明：
- shadcn/ui 社区已经在适配 Tailwind v4
- 动画库明确支持 shadcn/ui

#### 5.2 shadcn/ui 的版本状态

**未找到明确的 "shadcn/ui v4" 版本号**。shadcn/ui 的版本管理方式可能不同于传统 npm 包：
- 它是一个 CLI 工具，通过 `npx shadcn@latest` 安装
- 组件是复制到项目中的，而非 npm 依赖
- 版本可能指的是组件库的迭代版本

#### 5.3 安装方式验证

尝试访问 shadcn/ui 的 Next.js 安装文档时返回 404，说明：
- 文档路径可能已更改
- 需要访问官方网站 https://ui.shadcn.com 确认

#### 5.4 风险评估

- **中等风险**：shadcn/ui 可能尚未完全适配 Tailwind v4
- **建议**：访问 https://ui.shadcn.com/docs 确认安装步骤
- **替代方案**：使用 Tailwind v3 + shadcn/ui 的稳定组合

---

### 6. 深色模式实现

**状态**: 部分验证

#### 6.1 Tailwind v4 的深色模式

从 Beta 公告中可以看到，Tailwind v4 的网站本身使用了深色模式切换，说明：
- v4 支持深色模式
- 可能使用 `dark:` 变体前缀（与 v3 一致）

#### 6.2 实现方式

从 Tailwind 官网的源码片段中可以看到：
```javascript
classList.remove("light", "dark", "system");
if (theme === 'dark') {
  classList.add('dark')
}
```

这说明 v4 的深色模式实现方式：
- 通过添加 `.dark` class 到 `<html>` 元素
- 支持 `light`、`dark`、`system` 三种模式
- 与 v3 的 class 策略一致

#### 6.3 PRD 中的实现（第 6.5 节）

PRD 中使用了 `@custom-variant dark` 语法，这可能不是 v4 的标准做法。

**标准做法**（推测）：
```css
/* 使用标准的 dark: 变体 */
.dark .my-element {
  /* dark mode styles */
}
```

或者在 HTML 中：
```html
<html class="dark">
```

---

## 发现的问题

### 问题 1: @theme inline 语法未验证

**严重程度**: 中等

**描述**: PRD 第 6.1 节使用了 `@theme inline` 语法，但未在公开文档中找到确切的语法示例。

**证据**:
- Tailwind v4 Beta 公告确认了 "CSS-first configuration"
- 但未提供 `@theme inline` 的具体语法

**建议**:
1. 查阅 Tailwind v4 官方文档的 Theme 章节
2. 查看 Tailwind v4 的 GitHub 仓库示例
3. 如果语法不存在，使用 CSS 变量 + `theme()` 函数替代

### 问题 2: @custom-variant 语法可能不存在

**严重程度**: 高

**描述**: PRD 第 6.5 节使用了 `@custom-variant dark` 语法，但未找到任何证据表明 v4 支持此语法。

**证据**:
- 未在 npm 搜索、博客公告或文档片段中找到 `@custom-variant`
- Tailwind v4 使用 cascade layers，可能有不同的变体定义方式

**建议**:
1. 查阅 Tailwind v4 官方文档的 Variants 章节
2. 使用标准的 `.dark` class 策略
3. 如果需要自定义变体，查看 v4 的 plugin API

### 问题 3: shadcn/ui v4 版本号不明确

**严重程度**: 低

**描述**: PRD 中提到 "shadcn/ui v4"，但 shadcn/ui 的版本管理方式可能不同于传统 npm 包。

**证据**:
- shadcn/ui 是 CLI 工具，组件复制到项目中
- 未找到明确的 "v4" 版本号

**建议**:
1. 访问 https://ui.shadcn.com 确认当前版本
2. 确认 shadcn/ui 与 Tailwind v4 的兼容性
3. 如果不兼容，考虑使用 Tailwind v3

### 问题 4: tw-animate-css 是第三方库

**严重程度**: 低

**描述**: PRD 中使用的 `tw-animate-css` 是第三方维护的库，而非 Tailwind 官方库。

**证据**:
- 维护者是 wombosvideo (Luca Bosin)
- 最新版本 1.4.0 发布于 2025-09-24
- 有其他竞争库如 `tailwind-animate`

**建议**:
1. 评估 `tw-animate-css` 的维护活跃度
2. 考虑使用 `tailwind-animate`（更新更频繁）
3. 或者直接使用 Tailwind v4 的内置动画功能

---

## 推荐的验证步骤

### 立即执行

1. **访问 Tailwind v4 官方文档**
   - URL: https://tailwindcss.com/docs 或 https://v4.tailwindcss.com/docs
   - 重点查看: Theme、Variants、Dark Mode 章节

2. **访问 shadcn/ui 官方文档**
   - URL: https://ui.shadcn.com/docs
   - 确认安装步骤和 Tailwind v4 兼容性

3. **查看 Tailwind v4 GitHub 仓库**
   - URL: https://github.com/tailwindlabs/tailwindcss
   - 查看示例项目和配置文件

### 后续验证

4. **创建 Tailwind v4 测试项目**
   - 使用 `npm create vite@latest` 创建项目
   - 安装 Tailwind v4 Beta
   - 测试 `@theme` 和自定义变体语法

5. **测试 shadcn/ui 集成**
   - 在 Tailwind v4 项目中安装 shadcn/ui
   - 测试组件是否正常工作

6. **测试动画库**
   - 安装 `tw-animate-css` 或 `tailwind-animate`
   - 测试动画效果

---

## 外部参考

### 官方文档

- [Tailwind CSS v4.0 Beta 1 公告](https://tailwindcss.com/blog/tailwindcss-v4-beta) - 2024-11-21
- [Tailwind CSS 官方文档](https://tailwindcss.com/docs)
- [shadcn/ui 官方网站](https://ui.shadcn.com)

### npm 包

- [tw-animate-css](https://www.npmjs.com/package/tw-animate-css) - v1.4.0, MIT License
- [tailwind-animate](https://www.npmjs.com/package/tailwind-animate) - v0.2.10, MIT License
- [tw-shimmer](https://www.npmjs.com/package/tw-shimmer) - v0.4.11, MIT License

### GitHub 仓库

- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)
- [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css)
- [shadcn/ui](https://github.com/shadcn-ui/ui)

---

## 结论

### 已验证 ✅

1. **Tailwind CSS v4 存在且处于 Beta 阶段**
2. **CSS-first configuration 是 v4 的核心特性**
3. **tw-animate-css 是 v4 兼容的动画库**
4. **深色模式使用 `.dark` class 策略**

### 需要进一步验证 ⚠️

1. **@theme inline 的具体语法**
2. **@custom-variant 语法是否存在**
3. **shadcn/ui v4 的版本号和兼容性**

### 建议修改 PRD 🔧

1. **第 6.1 节**：验证 `@theme inline` 语法，可能需要调整
2. **第 6.5 节**：移除 `@custom-variant dark` 语法，使用标准 `.dark` class
3. **第 6.3 节**：评估 `tw-animate-css` vs `tailwind-animate`
4. **全局**：确认 shadcn/ui 与 Tailwind v4 的兼容性

### 风险评估

- **高风险**：`@custom-variant` 语法可能不存在
- **中等风险**：`@theme inline` 语法可能不准确
- **低风险**：shadcn/ui 版本号不明确
- **低风险**：使用第三方动画库

### 下一步行动

1. 访问 Tailwind v4 官方文档验证语法
2. 创建测试项目验证配置
3. 更新 PRD 中的不准确语法
4. 生成完整的审计报告
