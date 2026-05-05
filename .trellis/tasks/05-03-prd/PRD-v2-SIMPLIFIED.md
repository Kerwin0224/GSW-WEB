# 文韵智途 PRD v2.0 (简化版)

**版本**: 2.0  
**日期**: 2026-05-03  
**状态**: Draft  
**基于**: 原 PRD v1.0 审计结果

---

## 一、产品概述

### 1.1 产品定位

文韵智途是一款面向中学古诗词与文言文教学场景的 AI 智能助手，以**布鲁姆认知层次（Bloom's Taxonomy）**为核心教学理论框架，通过 AI 对话驱动学习。

### 1.2 核心价值主张

- **对学生**：沿着布鲁姆认知阶梯从记忆走向创造，看到自己的认知成长路径
- **对教师**：AI 作为"助教"，教师可审计对话、掌握学情
- **对管理员**：配置 AI Provider 和用户管理

### 1.3 布鲁姆认知层次

| 层级 | 名称 | 核心能力 | 古诗词场景举例 |
|------|------|---------|---------------|
| L1 | 记忆 | 识别与回忆 | 背诵"鹅鹅鹅，曲项向天歌" |
| L2 | 理解 | 解释与释义 | 解释"曲项"一词的含义 |
| L3 | 应用 | 迁移与运用 | 用"白描"手法写一句描写动物的句子 |
| L4 | 分析 | 分解与比较 | 比较《咏鹅》与《画》的写法异同 |
| L5 | 评价 | 判断与论证 | 评价"白描是否是这首诗最核心的手法" |
| L6 | 创造 | 重组与生成 | 仿照《咏鹅》的写法创作一首描写其他动物的诗 |

---

## 二、用户角色与权限

### 2.1 角色定义

```
管理员 (Admin)
  └── 教师 (Teacher)
        └── 学生 (Student)
```

### 2.2 权限矩阵

| 功能 | 学生 | 教师 | 管理员 |
|------|------|------|--------|
| AI 对话（学习） | ✅ | ✅ | ❌ |
| 布鲁姆认知路径查看 | ✅（本人） | ✅（所教班级） | ❌ |
| 挑战练习 | ✅ | ❌ | ❌ |
| 个人中心 | ✅（本人） | ✅（所教班级） | ❌ |
| 对话审计 | ❌ | ✅ | ❌ |
| Provider 配置 | ❌ | ❌ | ✅ |
| 用户管理 | ❌ | ❌ | ✅ |

### 2.3 数据关系（简化）

```
班级 Class
  ├── 学生 Student (多对一)
  └── 教师 Teacher (多对多)
```

**简化说明**：删除学校→年级层级，只保留班级。

---

## 三、核心功能（MVP）

### 3.1 AI 对话系统

#### 学生端对话

**功能**：
- 流式 AI 对话
- 自动项目归类（识别古诗文篇目）
- 布鲁姆层级自动标注
- 对话历史管理

**交互流程**：
```
用户输入问题 → 前端发送请求 → 后端并行处理：
  ├→ 主模型生成教学回答（流式返回）
  ├→ 分类模型识别篇目 → 自动归类
  └→ 分类模型判断布鲁姆层级 → 返回标签
```

**技术实现**：
- 使用 Vercel AI SDK v6 的 `streamText()`
- 在 `onFinish` 回调中异步执行分类和标注
- 使用 Supabase 存储对话和消息

#### 教师端对话

**功能**：
- 与学生端相同的对话能力
- 用于备课和教学准备

---

### 3.2 布鲁姆认知路径

#### 认知路径可视化

**功能**：
- 显示学生在某个项目（古诗文）上的认知层级分布
- 阶梯式路径图（L1→L6）
- 点击节点查看对应的问题

**数据来源**：
- 从 `conversation_messages` 表聚合 `bloom_level`
- 计算每个层级的问题数量
- 识别最高已触及层级

**UI 设计**：
- 简化版阶梯图（不需要复杂的粒子动画）
- 使用 shadcn/ui 的标准组件
- 响应式设计

#### 个人中心

**功能**：
- 项目总览（卡片网格）
- 每个项目显示：篇目名称、最高层级、问题数量
- 按最近学习排序

---

### 3.3 挑战练习系统

#### 出题逻辑

**功能**：
- 根据学生当前最高层级，出下一层级的题目
- 使用 AI 生成题目

**技术实现**：
```typescript
// 调用 AI SDK 生成题目
const { text } = await generateText({
  model: challengeModel,
  system: `你是古诗文教学专家。为 L${targetLevel} 层级出题。`,
  prompt: `学生正在学习《${poemTitle}》，当前最高层级 L${currentLevel}。
           请为 L${targetLevel}（${levelName}）出一道挑战题。`,
});
```

#### 评判逻辑

**功能**：
- AI 评判学生答案是否达到目标层级
- 提供反馈和建议

**技术实现**：
```typescript
// 调用 AI SDK 评判答案
const { text } = await generateText({
  model: evaluateModel,
  system: `你是古诗文教学专家。评判学生答案是否达到 L${targetLevel} 层级。`,
  prompt: `题目：${question}\n学生答案：${userAnswer}\n请评判是否通过。`,
});
```

---

### 3.4 教师审计

#### 对话审计

**功能**：
- 查看所教班级学生的对话记录
- 标注 AI 回答质量（准确/有误）
- 填写修正答案（用于 SFT 数据集）

**数据模型**：
```sql
CREATE TABLE audit_records (
  id UUID PRIMARY KEY,
  source_message_id UUID REFERENCES conversation_messages(id),
  auditor_id UUID REFERENCES profiles(id),
  kind TEXT CHECK (kind IN ('sft', 'dpo')),
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')),
  prompt TEXT NOT NULL,
  original_answer TEXT,
  corrected_answer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3.5 管理端

#### Provider 配置

**功能**：
- 配置 AI Provider（OpenAI, Anthropic, DeepSeek 等）
- 为不同功能分配不同模型

**数据模型**：
```sql
CREATE TABLE provider_configs (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  base_url TEXT,
  secret_ref TEXT,
  is_enabled BOOLEAN DEFAULT false
);

CREATE TABLE provider_capabilities (
  id UUID PRIMARY KEY,
  provider_id UUID REFERENCES provider_configs(id),
  capability TEXT NOT NULL, -- 'student_chat', 'bloom_classification', etc.
  model_id TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true
);
```

#### 用户管理

**功能**：
- 创建/编辑/删除用户
- 分配角色（学生/教师/管理员）
- 班级管理

---

## 四、技术架构

### 4.1 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | ^16.x |
| 语言 | TypeScript | ^5.x |
| 样式 | Tailwind CSS | ^4.x |
| 组件库 | shadcn/ui | latest |
| AI SDK | Vercel AI SDK (`ai`) | ^6.x |
| 后端 | Supabase | ^2.x |
| 认证 | 自定义 Session | - |
| 验证 | Zod | ^3.x |
| 图表 | Recharts | ^2.x |

### 4.2 目录结构（简化）

```
web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/
│   │   ├── (student)/
│   │   ├── (teacher)/
│   │   ├── (admin)/
│   │   └── api/
│   ├── components/
│   │   ├── ui/                 # shadcn 组件
│   │   └── workbench/          # 业务组件
│   ├── hooks/
│   ├── lib/
│   │   ├── data/               # 数据层
│   │   ├── supabase/
│   │   └── observability/
│   └── types/
├── supabase/
│   └── migrations/
├── package.json
└── tsconfig.json
```

**设计原则**：
- 扁平结构，避免过度嵌套
- 按类型组织（`components/`, `hooks/`, `lib/`）
- 不使用 `features/` 目录

### 4.3 核心模块（简化为 3 个）

#### M1: Bloom Engine（纯数据转换）

**职责**：从消息数据计算认知路径

**接口**：
```typescript
interface BloomEngine {
  getCognitivePath(projectId: string, userId: string): Promise<CognitivePath>;
  getCognitiveProfile(userId: string): Promise<CognitiveProfile>;
}
```

**实现位置**：`lib/bloom-engine.ts`

#### M2: Challenge Engine（出题 + 评判）

**职责**：管理挑战练习的完整生命周期

**接口**：
```typescript
interface ChallengeEngine {
  generateChallenge(projectId: string, userId: string, targetLevel: number): Promise<Challenge>;
  evaluateAnswer(challengeId: string, userAnswer: string): Promise<Evaluation>;
}
```

**实现位置**：`lib/challenge-engine.ts`

#### M3: Dataset Export（数据集导出）

**职责**：导出 SFT/DPO 数据集

**接口**：
```typescript
interface DatasetExport {
  export(type: 'sft' | 'dpo', filters: Filters): Promise<ExportResult>;
  preview(type: 'sft' | 'dpo', filters: Filters): Promise<PreviewResult>;
}
```

**实现位置**：`lib/dataset-export.ts`

**简化说明**：删除 M1 (AI Pipeline), M4 (Audit Pipeline), M5 (Provider Registry), M6 (Org Manager)，这些功能直接在数据层或 API Route 中实现。

---

### 4.4 Supabase 集成（实际实现）

#### 自定义 Session 管理

**实际代码使用自定义 session**，而非 Supabase Auth：

```typescript
// lib/supabase/server.ts
export async function createClient() {
  const session = await getAppSession(); // 自定义 session
  
  return createServerClient(supabaseUrl, publishableKey, {
    global: {
      headers: session ? {
        'x-cwb-user-id': session.sub,
        'x-cwb-session-signature': createDatabaseSessionSignature(session.sub),
      } : undefined,
    },
    cookies: { /* ... */ },
  });
}
```

#### RLS 策略（适配自定义 headers）

```sql
-- 用户只能读取自己的数据
CREATE POLICY "Users read own" ON conversations
  FOR SELECT TO authenticated
  USING (owner_id = current_setting('request.headers')::json->>'x-cwb-user-id');

-- 教师可以读取所教班级学生的数据
CREATE POLICY "Teachers read students" ON conversations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_memberships cm_teacher
      JOIN class_memberships cm_student ON cm_teacher.class_id = cm_student.class_id
      WHERE cm_teacher.profile_id = current_setting('request.headers')::json->>'x-cwb-user-id'
        AND cm_teacher.role = 'teacher'
        AND cm_student.profile_id = conversations.owner_id
        AND cm_student.role = 'student'
    )
  );
```

---

### 4.5 数据库 Schema（核心表）

```sql
-- 用户
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  login_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 班级
CREATE TABLE classes (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  grade TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 班级成员
CREATE TABLE class_memberships (
  id UUID PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  UNIQUE (class_id, profile_id)
);

-- 项目（古诗文篇目）
CREATE TABLE text_projects (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES profiles(id),
  class_id UUID REFERENCES classes(id),
  title TEXT NOT NULL,
  author TEXT,
  text_type TEXT DEFAULT 'poem',
  classification_state TEXT DEFAULT 'pending',
  highest_bloom_level SMALLINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 对话
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES profiles(id),
  project_id UUID REFERENCES text_projects(id),
  source TEXT NOT NULL CHECK (source IN ('student_chat', 'teacher_chat', 'practice')),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 消息
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  bloom_level SMALLINT CHECK (bloom_level BETWEEN 1 AND 6),
  bloom_state TEXT DEFAULT 'pending',
  model_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 挑战记录
CREATE TABLE practice_records (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES profiles(id),
  project_id UUID REFERENCES text_projects(id),
  target_bloom_level SMALLINT NOT NULL,
  prompt TEXT,
  answer TEXT,
  feedback TEXT,
  achieved BOOLEAN,
  evaluation_state TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 审计记录
CREATE TABLE audit_records (
  id UUID PRIMARY KEY,
  source_message_id UUID REFERENCES conversation_messages(id),
  auditor_id UUID REFERENCES profiles(id),
  kind TEXT NOT NULL CHECK (kind IN ('sft', 'dpo')),
  status TEXT DEFAULT 'pending',
  prompt TEXT NOT NULL,
  original_answer TEXT,
  corrected_answer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider 配置
CREATE TABLE provider_configs (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  base_url TEXT,
  secret_ref TEXT,
  is_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider 能力
CREATE TABLE provider_capabilities (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES provider_configs(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  model_id TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  UNIQUE (provider_id, capability, model_id)
);
```

---

## 五、UI/UX 设计（简化）

### 5.1 视觉风格

**设计原则**：使用 shadcn/ui 默认配色，不自定义中国传统色系统。

- **主色调**：shadcn/ui 默认（zinc/slate）
- **字体**：系统字体栈（不引入霞鹜文楷）
- **卡片风格**：shadcn/ui 默认
- **深色模式**：使用 `next-themes` + `.dark` 类

### 5.2 布鲁姆层级配色（简化）

使用 shadcn/ui 的 chart colors：

| 层级 | 颜色 | Tailwind 类 |
|------|------|-------------|
| L1 记忆 | chart-1 | `bg-chart-1` |
| L2 理解 | chart-2 | `bg-chart-2` |
| L3 应用 | chart-3 | `bg-chart-3` |
| L4 分析 | chart-4 | `bg-chart-4` |
| L5 评价 | chart-5 | `bg-chart-5` |
| L6 创造 | chart-6 | `bg-chart-6` |

### 5.3 核心页面布局（简化）

#### 学生端 - 对话页

```
┌─────────────────────────────────────────────┐
│  ◀ 返回    《咏鹅》对话          📊 认知路径  │
├──────────┬──────────────────────────────────┤
│          │                                  │
│ 项目列表  │  [L2 理解]                       │
│          │  学生：鹅鹅鹅曲项向天歌用了什么手法？│
│ 《咏鹅》  │                                  │
│ 《静夜思》│  AI：这首诗主要使用了白描...      │
│ 《春晓》  │                                  │
│          │  ┌─────────────────────────────┐ │
│          │  │ 输入你的问题...        发送 │ │
│          │  └─────────────────────────────┘ │
└──────────┴──────────────────────────────────┘
```

#### 学生端 - 认知路径页

```
┌─────────────────────────────────────────────┐
│  ◀ 返回          《咏鹅》认知路径            │
├─────────────────────────────────────────────┤
│                                             │
│  L6 创造  🔒                                │
│  L5 评价  ● (1题)                           │
│  L4 分析  ● ● (2题)                         │
│  L3 应用  ● (1题)                           │
│  L2 理解  ● ● ● (3题)                       │
│  L1 记忆  ● (1题)                           │
│                                             │
│  当前最高层级：L5 评价                       │
│  [开始挑战 →]                               │
└─────────────────────────────────────────────┘
```

### 5.4 动效系统（简化）

**原则**：使用 shadcn/ui 默认动画，不自定义复杂动效。

- 卡片 hover：`hover:shadow-lg transition-shadow`
- 按钮 hover：`hover:bg-primary/90 transition-colors`
- 模态框：`animate-in fade-in-0 zoom-in-95`
- Toast：使用 `sonner` 默认动画

**删除**：金色粒子突破动画（过度设计）

---

## 六、开发规范（简化）

### 6.1 TypeScript 规范

- 严格模式：`strict: true`
- 禁止 `any`：使用 `unknown` + 类型守卫
- 数据库类型：通过 `supabase gen types typescript` 生成

### 6.2 组件架构

- Server Component 优先
- Client Component 最小化（仅交互部分）
- Props 类型内联定义

### 6.3 样式规范

- Tailwind 原子类优先
- 使用 `cn()` 合并类名
- 禁止内联 `style={{}}`（除非运行时计算）

### 6.4 测试策略（简化）

| 层级 | 工具 | 覆盖目标 |
|------|------|---------|
| 类型检查 | `tsc --noEmit` | 100% |
| 单元测试 | Vitest | 核心逻辑（3 个模块） |
| E2E | Playwright | 核心用户旅程 |

---

## 七、MVP 范围（明确）

### 7.1 包含的功能

- ✅ AI 对话系统（学生端 + 教师端）
- ✅ 布鲁姆认知路径可视化
- ✅ 挑战练习系统
- ✅ 教师审计（基础）
- ✅ 管理端（Provider 配置 + 用户管理）

### 7.2 不包含的功能（延后到 v2）

- ❌ MCP Server 集成
- ❌ 数据集导出
- ❌ 学情看板（热力图）
- ❌ 认知画像（雷达图）
- ❌ System Instruction 模板库
- ❌ 中国传统色系统
- ❌ 霞鹜文楷字体
- ❌ 复杂动画（金色粒子）

---

## 八、与原 PRD 的差异

### 8.1 简化的内容

| 方面 | 原 PRD | 简化版 PRD |
|------|--------|-----------|
| **深度模块** | 7 个 | 3 个 |
| **目录结构** | `features/` 组织 | 扁平结构 |
| **UI 系统** | 中国传统色 + 自定义字体 | shadcn 默认 |
| **动效系统** | 复杂动画 + 粒子效果 | shadcn 默认 |
| **功能范围** | 59 个用户故事 | 核心功能 |
| **文档长度** | 2300+ 行 | ~800 行 |

### 8.2 对齐实际的内容

| 方面 | 原 PRD | 简化版 PRD |
|------|--------|-----------|
| **Session 管理** | Supabase Auth | 自定义 session |
| **RLS 策略** | `auth.uid()` | 自定义 headers |
| **目录结构** | 理想化设计 | 实际实现 |

---

## 九、下一步行动

### 9.1 立即行动（本周）

1. **实现 Middleware**
   - Session 刷新
   - 角色路由保护

2. **实现挑战练习系统**
   - 出题逻辑
   - 评判逻辑
   - 挑战 UI

3. **完善布鲁姆认知路径**
   - 认知路径可视化页面
   - 个人中心项目总览

### 9.2 短期目标（2 周）

4. **补全测试**
   - 单元测试（3 个模块）
   - E2E 测试（核心流程）

5. **完善教师审计**
   - 审计界面优化
   - 标注流程完善

### 9.3 中期目标（1 个月）

6. **实现数据集导出**
7. **实现学情看板**
8. **UI/UX 优化**

---

**PRD 版本**: 2.0  
**生成时间**: 2026-05-03  
**基于**: 原 PRD v1.0 + 审计报告  
**状态**: Draft（待评审）
