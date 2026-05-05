# clean duplicate student class memberships

## Goal

清理数据库中违反产品语境的学生多班级关系：教师可以属于多个班级，但学生在 MVP 中只允许属于一个班级。

## Requirements

- 只处理 `class_memberships.role = 'student'` 的重复班级关系。
- 每个学生只保留最新加入的班级关系。
- 删除同一学生更早的班级关系。
- 教师多班级关系不受影响。
- 执行前必须 dry-run 输出受影响学生数与将删除关系数。
- 如数据库支持迁移/约束，后续实现应防止再次出现学生多班级关系。

## Acceptance Criteria

- [ ] dry-run 能统计重复学生关系。
- [ ] 清理后每个 student profile 最多只有一条 student class_memberships。
- [ ] teacher class_memberships 不被删除。
- [ ] `CONTEXT.md` 记录教师多班、学生单班与自动迁班规则。

## Out of Scope

- 不改变教师多班逻辑。
- 不删除 profiles、classes 或学生学习数据。
- 不重做权限/RLS。
