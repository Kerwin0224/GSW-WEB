# 0002: 多租户（SaaS）与群文阅读多篇归属的数据模型

日期：2026-09-11 · 状态：proposed（待产品确认后实施）

本文覆盖两个互相独立的数据模型变更：多租户隔离（SaaS 化前提）与群文阅读场景下会话归属多个篇目。两者都动核心表，先立设计再动迁移。

## 一、多租户模型

### 背景

当前库完全没有"学校/机构"概念：`classes` 是全局的，任何 admin 能看到所有班级；一个 Supabase 项目服务多所学校时，数据会跨校穿透。做 SaaS 需要公司（我方）→ 学校（租户）→ 校内成员的三层结构，且免费档不加服务的约束下，隔离必须用 RLS 完成，不依赖 Branching。

### 模型

```
organizations（公司/集团，SaaS 客户）
  1─N schools（学校 = 租户）
        1─N classes
        1─N profiles（teacher/student/admin 均挂 school）
        1─N school_admins（一所学校若干管理员）
```

决策：

1. **新增两表**：`organizations(id, name, plan, status, …)`、`schools(id, org_id → organizations, name, region, status, …)`。
2. **profiles 加 `school_id`**（nullable 过渡期）：teacher/student 必属一个学校；`platform_admin`（我方运营）不挂校。现有 `admin` 角色拆为 `school_admin`（校内管理员，可多个）与 `platform_admin`。
3. **classes 加 `school_id`**，班级天然隔离在校内。
4. **数据不碰的两张表**：`provider_configs`（模型供应商）是平台级资源，挂 organizations 或平台，不挂学校——模型网关按公司统一采购。`export_batches` 挂 school（导出是校维度资产）。
5. **RLS 隔离模板**：所有带 school_id 的表，策略统一为 `school_id = current_school_id()`（新增 JWT/会话解析函数），平台管理员 `is_platform_admin()` 豁免。`teacher_can_access_class`、`current_app_user_id` 等现有 helper 在此之上叠加，不替换。
6. **迁移路径**（全部加列加表，向后兼容）：
   - 迁移一：建 organizations/schools，profiles/classes 加 school_id（NULL 允许）；
   - 迁移二：回填现网单校数据到默认学校；
   - 迁移三：收紧 CHECK/RLS（新数据 school_id 必填）；
   - 注册/登录函数 `authenticate_school_account` 增加租户判定（login_id 在校内唯一，全局可重复——学号 20240001 每所学校都可以有）。

### 后果

- login_id 从全局唯一变为**校内唯一**，唯一约束从 profiles 全局索引改为 `(school_id, login_id)`。
- 现有"演示管理员/教师"语义变为某默认学校的管理员/教师；平台级账号另建。
- RLS 面全面重写是本次最大的工程量，需要逐表清单化推进。

## 二、群文阅读：会话归属多个篇目

### 背景

`conversations.project_id` 是单外键，归类器也只裁决一个主篇目。群文阅读场景（"把《静夜思》和《春望》放在一起比较"）只能挂到一篇，另一篇的学习记录完全丢失。

### 模型

决策：

1. **新增关联表 `conversation_projects(conversation_id, project_id, is_primary, created_at)`**，`UNIQUE(conversation_id, project_id)`；`conversations.project_id` 保留为**主篇目**的物化列（兼容现有查询与挑战输入边界），过渡期不删。
2. **归类器输出改为有序列表**：第一行为主篇目，其后为次篇目（两行文本协议扩展为 N 行，逐行书名号/标题解析，复用现有 salvage）。主篇目空缺仍归档；次篇目只挂到已解析出的具体篇目。
3. **写入路径**：归类落定时一次 upsert 到 conversation_projects（is_primary=true 的那条同步进 conversations.project_id）。
4. **读取路径**：侧边栏/学习记录按 conversation_projects 联查，一个会话出现在它挂到的每个篇目下；挑战生成仍以 conversations.project_id（主篇目）为输入边界，与 CONTEXT.md 155 行一致。
5. **迁移**：加表 + 回填（`INSERT … SELECT id, project_id, true FROM conversations WHERE project_id IS NOT NULL`）。

### 后果

- 学习记录"篇目"计数从"会话数"变为"关联数"，统计口径要同步调整。
- 归档会话不挂任何篇目（CONTEXT.md 145 行不变）。
- 删除会话时关联表级联清理。

## 实施顺序

多租户先行（独立迁移链），群文阅读其次（依赖归类器，改动面在应用层更多）。两者都不阻塞彼此，各自走"迁移 → db reset → 预览 → merge"标准流程。
