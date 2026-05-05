# enforce single student class membership

## Goal

通过数据库硬约束防止学生多班级关系复发：教师账号可以归属多个班级，但学生账号在 MVP 中只能拥有一条 `student` 班级成员关系。

## Requirements

- 在数据库层为 `class_memberships` 增加只作用于 `role = 'student'` 的唯一约束或等价唯一索引。
- 约束必须以 `profile_id` 为学生单班唯一键，确保同一学生不能同时存在多条学生班级关系。
- 约束不得影响 `role = 'teacher'` 的多班级关系。
- 添加约束前必须确认当前远端数据库不存在重复学生班级关系。
- 本地迁移文件必须记录该数据库形状变更，便于后续环境同步。
- 不改变 RLS、profiles、classes、学生学习数据或教师多班逻辑。

## Acceptance Criteria

- [ ] 远端 dry-run/验证查询显示没有 `student` 重复班级关系。
- [ ] 新迁移创建只针对 `role = 'student'` 的唯一索引或等价约束。
- [ ] 同一 `profile_id` 不能拥有多条 `student` class_memberships。
- [ ] 同一教师仍可拥有多条 `teacher` class_memberships。
- [ ] 迁移应用后可在数据库元数据中看到该约束/索引。
- [ ] `CONTEXT.md` 已记录教师多班、学生单班与硬约束防复发规则。

## Definition of Done

- 本地迁移文件已添加。
- 远端数据库已应用约束迁移。
- 数据库验证查询通过。
- 若只修改 SQL 迁移且不改变 TS schema shape，则无需刷新 Supabase TS types。

## Technical Approach

使用 Postgres partial unique index：在 `public.class_memberships(profile_id)` 上创建唯一索引，并添加 `where role = 'student'` 谓词。这样数据库会拒绝同一学生的第二条 student 成员关系，同时 teacher 行不进入该唯一索引，继续支持教师多班。

## Out of Scope

- 不重做管理员班级成员管理 UI。
- 不实现自动迁班的应用层交互。
- 不修改教师多班逻辑。
- 不删除 profiles、classes 或学生学习数据。
- 不重做权限/RLS。

## Technical Notes

- `CONTEXT.md` 是产品语境来源，明确学生单班必须由数据库约束或等价强约束防复发。
- `.trellis/spec/backend/supabase-pgvector-guidelines.md` 要求所有 schema 变化以 SQL migration 表达，并在远端应用前检查迁移安全。
- 现有 `class_memberships` 已有 `unique (class_id, profile_id)`，只能防止同一账号重复加入同一个班级，不能防止学生跨班重复。
