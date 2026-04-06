# fullstack: LearnHouse 基座接管、古诗词课程化改造与本地模型整合

## Goal

交付一个真正可用、中文化、低心智的中小学古诗词教学平台演示版：

- 复用 LearnHouse 作为课程产品壳，而不是继续从零重写整站前端
- 把公开课程、课程页、活动页改造成古诗词教学产品体验
- 把活动页内 AI 面板稳定接到本地 `GSW-Qwen3-4B-20251205-q4_k_m.gguf` 模型
- 让 AI 只在课堂活动上下文内回答，避免退化成通用聊天壳
- 补齐 PRD 与 Trellis 文档，使代码、任务与当前产品形态一致

## Scope

### Backend

- 在 `app/backend` 提供 `/internal/learnhouse/chat` 本地桥接接口
- 强化 prompt、上下文裁剪与输出清洗，确保回答为中文教师风格
- 保留 Ollama 为当前运行时，同时保留 `llama-cpp-python` 兼容路径

### LearnHouse Shell

- 用 `seed_teaching_studio.py` 播种三门古诗词课程与固定活动 UUID
- 改造公开课程、课程页、活动页与 AI 相关文案，使其全部转为中文古诗词教学语境
- 收紧 AI 交互入口，只保留活动页内“问课堂助教”主链路

### Docs / Trellis

- PRD 升级到 `v1.1`，写清当前双仓架构与真实部署方式
- 为当前任务补齐 `prd.md`
- 更新 workspace / journal，使“当前已交付版本”与 Trellis 记录一致

## Key Decisions

1. 不再继续投入时间重做一套新的前端壳，而是借 LearnHouse 的课程结构快速达到可用产品形态。
2. AI 不做全站入口，只在具体活动上下文内回答，确保教学感、约束性和可控性。
3. 当前模型运行时以 Ollama 为主，因为本地环境已经稳定跑通；`llama-cpp-python` 留作兼容后路。
4. 当前产品优先级是“课程体验 + 中文界面 + AI 课堂助教能用”，而不是一次性把布鲁姆闯关、学习轨迹、学校级后台全量做完。

## Acceptance Criteria

- [x] `/courses` 能看到中文古诗词公开课程
- [x] `/course/{courseuuid}` 页面完成古诗词教学化改造
- [x] `/course/{courseuuid}/activity/{activityid}` 页面完成古诗词活动化改造
- [x] “问课堂助教” 可在真实浏览器中返回干净的中文教师式回答
- [x] `/health` 显示模型已就绪，当前 provider 为 `ollama`
- [x] Web 构建通过
- [x] PRD 与 Trellis 记录同步到当前实现

## Verification Snapshot

- `python -m compileall backend/app`
- `curl http://127.0.0.1:8000/health`
- `npm run build` in `learnhouse-base/apps/web`
- `python learnhouse-base/scripts/verify_teaching_studio_ui.py`

## Demo Content

- `AI 古诗词演示：从《静夜思》读懂画面与思乡`
- `AI 古诗词演示：借《春晓》学会观察与表达`
- `AI 古诗词演示：从《望庐山瀑布》看夸张与想象`

## Out of Scope

- 全学科通用助手
- 当前活动页之外的全局 AI 聊天入口
- 重做一套替换 LearnHouse 的全新站点壳
- 学校级 LMS 功能（排课、成绩册、多校区）
- 未经验证就直接上线的复杂布鲁姆闯关 / 学情矩阵
