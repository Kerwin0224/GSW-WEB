# fullstack: 三端联调、页面收敛与系统交付

## Goal

交付一个可正常运行的中小学古诗词教学轻量系统，覆盖学生、教师、管理员三端：

- 打通学生、教师、管理员现有核心功能
- 重点验证学生端与教师端聊天链路
- 教师端与管理员端做减法，靠近学生端的高级、简约风格
- 清理 Trellis 与项目结构，让当前代码、任务记录与目录状态一致

## Scope

### Backend

- 修复历史 SQLite schema 与当前代码不一致导致的运行失败
- 补齐管理员账户维护所需的教师列表与教师绑定能力
- 更新烟雾测试，使其反映真实的 `general_chat` 回退行为

### Frontend

- 学生端保留聊天式主交互，统一外层文案与导航
- 教师端保留聊天工作台核心，收敛班级/复核页面信息密度
- 管理员端重构为以 `/admin/skills` 为核心入口的工作台
- 账户页改为“现状 + 动作”结构，并补齐管理员绑定教师的交互

### Trellis / Repo Hygiene

- 当前任务与真实交付范围对齐
- 更新工作区索引与会话记录
- 删除本轮产生的运行日志垃圾

## Key Decisions

1. 管理员首页不再做“后台九宫格”，而是聚焦 Skills / MCP / 模板的专业编排台。
2. 教师端继续沿用学生端的聊天范式，不再回到卡片堆叠式后台。
3. 后端测试不再依赖单一 `result_type`，而是验证更稳定的真实行为：
   - 内容问题能成功产出结果
   - 非内容问题会回退到 `general_chat`
   - trace 中不再出现旧的失败断言

## Acceptance Criteria

- [x] 学生、教师、管理员三端核心页面可正常进入
- [x] 学生聊天与教师聊天均完成真实浏览器回归
- [x] 教师班级页、教师复核页可正常加载
- [x] 管理员编排页、追踪页、账户页可正常加载
- [x] 管理员账户维护支持教师列表读取与创建学生时绑定教师
- [x] `frontend` 的 `typecheck` 与 `lint` 通过
- [x] `smoke_backend_v1`、`smoke_challenge_flow`、`smoke_admin_visibility` 通过
- [x] Trellis 当前任务与代码交付范围一致

## Verification Snapshot

- `npm run typecheck`
- `npm run lint`
- `python backend/scripts/smoke_backend_v1.py`
- `python backend/scripts/smoke_challenge_flow.py`
- `python backend/scripts/smoke_admin_visibility.py`
- 浏览器回归：
  - 学生登录 + 聊天
  - 教师登录 + 聊天
  - 教师班级页 / 复核页
  - 管理员编排页 / 追踪页 / 账户页

## Delivered Changes

- 后端：
  - 兼容旧 `sessions` / `projects` schema
  - 新增 `/users/teachers`
  - 管理员批量建学生支持显式 `teacher_id`
- 前端：
  - `AdminSkillsWorkspace` 重做为主工作台
  - `AdminTraceWorkspace` 收敛为追踪专页
  - `AccountsWorkspace` 补齐教师绑定并简化结构
  - `AppShell` 统一教师/管理员导航与文案
  - `TeacherWorkspace` 删除冗余隐藏块并收紧页头表达

## Out of Scope

- 不扩展新的业务模块
- 不新增超出现有后端能力的大型管理功能
- 不引入新的设计系统或复杂动效框架
