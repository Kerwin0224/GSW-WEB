# 严格对齐 Trellis 与 PRD/代码现状

## 目标

把 `app/.trellis/` 下的 task、workspace、current-task 与当前 PRD 和实际代码状态严格对齐，消除路径错位、过期描述和上下文缺失，确保后续代理读取 Trellis 即得到真实可执行上下文。

## 要求

- 以 `app/.trellis/` 作为当前项目内有效 Trellis 根目录
- 校准当前任务指针、workspace 索引、开发者索引与任务状态
- 修正父任务/子任务 PRD 中与当前代码现状冲突的描述
- 为本次对齐任务补齐标准 Trellis 文件（`prd.md`、context 初始化）
- 不扩写新需求，只做对齐与收口

## 验收标准

- [ ] `app/.trellis/.current-task` 指向项目内真实任务目录
- [ ] `03-30-v1-complete-app/prd.md` 不再包含与现状冲突的“未发现 frontend/package.json”等描述
- [ ] `workspace/index.md` 与 `workspace/shixiangliu/index.md` 反映 2026-03-31 的当前任务状态
- [ ] 新任务 `03-31-align-trellis-prd-code` 已具备 PRD 和 context 基础文件
- [ ] 后续代理读取当前 Trellis 状态时，不会被根目录外的旧 `.trellis/` 路径误导

## 涉及文件

- `.trellis/.current-task`
- `.trellis/workspace/index.md`
- `.trellis/workspace/shixiangliu/index.md`
- `.trellis/tasks/03-30-v1-complete-app/prd.md`
- `.trellis/tasks/03-31-align-trellis-prd-code/*`

## 备注

- 当前仓库实际代码位于 `app/backend/` 与 `app/frontend/`
- 仓库根目录下另有旧 `.trellis/` 痕迹，但当前项目执行应以内层 `app/.trellis/` 为准
