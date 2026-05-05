# Student Cognition Challenge Climb

## Goal

落地学生端两个清晰链路：项目内 AI 对话用于观察和呈现学生在某个诗文项目下的布鲁姆认知路径与分布；挑战用于通过结构化出题真实核查认知水平，并推动学生从 L1 记忆逐层攀升到 L6 创造。

## What I already know

- 用户明确要求区分：项目、会话、布鲁姆认知路径、布鲁姆认知分布统计、挑战。
- 用户明确强调：挑战不是普通练习，而是“出题来真实核查认知水平”，并且要让认知从最低攀升到最高。
- `web/src/components/workbench/student-chat-client.tsx` 已有本次会话层级条，但只展示触达层级，尚未完整表达分布统计和项目/会话边界。
- `web/src/app/student/projects/[projectId]/page.tsx` 已有项目详情页，展示项目、问题记录、练习记录、认知路径入口。
- `web/src/lib/challenge-engine.ts` 已有 `generateChallenge(projectId, userId, targetLevel)` 和 `evaluateAnswer(challengeId, userId, userAnswer)`，但当前模型是单题目标层级，不是 L1→L6 阶梯挑战闭环。
- `web/src/app/student/challenge/page.tsx` 当前只重定向到 `/student/projects`，没有独立挑战体验。
- `web/package.json` 当前没有通用 `test` 脚本，只有 `lint`、`build` 和一个 SFT/DPO e2e 脚本；TDD 需要优先补可运行测试抓手或使用现有 lint/build 作为回归验证。

## Assumptions (temporary)

- MVP 不新增复杂学习科学模型，只基于现有布鲁姆 1-6 层级和 `practice_records` 表能力实现。
- MVP 的挑战攀升可以先以项目为单位，按 L1→L6 顺序生成题目、提交答案、评判是否达标。
- 如果某层未达标，学生停留在该层获得反馈，不自动跳到下一层。
- 对话画像和挑战核查需要在 UI 文案上明确区分，避免“画像=能力”的误导。

## Open Questions

- OMC Teams 分发需要用户确认 worker 规格：`N:claude`、`N:codex` 或 `N:gemini`。

## Requirements (evolving)

- 明确学生端概念口径：
  - 项目：诗文学习容器。
  - 会话：项目下与 AI 的一次连续对话过程。
  - 布鲁姆认知路径：学生在对话或挑战中随时间触达的层级轨迹。
  - 布鲁姆认知分布统计：项目/会话内各层级占比或数量。
  - 挑战：通过出题核查并推动 L1→L6 攀升的训练闭环。
- 对话链路负责“观察认知”：记录真实提问、返回 Bloom 分类、展示会话层级与项目层级统计。
- 挑战链路负责“核查并攀升认知”：从 L1 开始出题，达标才进入下一层，未达标停留补强。
- 项目详情页要能让学生理解：问题记录是画像来源，练习/挑战记录是能力核查证据。
- 挑战体验要以项目为上下文，不能脱离诗文项目生成泛题。
- TDD 优先：先补测试或可验证断言，再实现最小改动。

## Acceptance Criteria (evolving)

- [ ] 学生端 UI 文案清楚区分“对话画像”和“挑战核查/攀升”。
- [ ] 项目详情页能展示项目下的认知路径、分布统计、挑战进度，并说明它们的关系。
- [ ] 挑战入口以项目为单位启动，挑战题目按 L1→L6 递进。
- [ ] L1 未达标时不会进入 L2；任一层达标后才能建议下一层。
- [ ] 挑战题目和评判都保留在真实 `practice_records` 记录中。
- [ ] 新增或更新测试覆盖挑战层级递进、未达标停留、达标推进、分布统计计算。
- [ ] `npm run lint` 通过。
- [ ] `npm run build` 通过，或记录明确阻塞原因。
- [ ] 前端变更需启动 dev server 并用浏览器验证核心路径：项目详情 → 启动挑战 → 提交答案 → 查看反馈/下一层提示。

## Definition of Done (team quality bar)

- Tests added/updated first where practical, and implementation keeps tests green.
- Lint/typecheck/build verification run with output evidence.
- Student golden path manually verified in browser if UI changes land.
- No model/provider fallback hacks; missing provider config must surface as blocked state.
- No broad refactor beyond this task’s concept and challenge-climb scope.

## Out of Scope (explicit)

- 不引入新的数据库迁移，除非实现中证明现有 `practice_records` 无法表达最低闭环。
- 不实现教师端深度审计改造。
- 不实现复杂自适应题库或长期学习曲线模型。
- 不替换现有 AI SDK/provider registry。
- 不把对话画像当成最终能力证明；能力证明必须来自挑战核查。

## Technical Notes

- Likely impacted files:
  - `web/src/lib/challenge-engine.ts`
  - `web/src/lib/data/student.ts`
  - `web/src/components/workbench/student-chat-client.tsx`
  - `web/src/app/student/projects/[projectId]/page.tsx`
  - `web/src/app/student/challenge/page.tsx`
- Current challenge engine has single-target-level generation and evaluation, but no progression state helper.
- Current challenge page redirects away, so UI entry/experience likely needs new route behavior or project-scoped challenge entry from project detail.
- Current package lacks a general unit test runner; implementation may need a minimal Node/TypeScript test script or focus tests around pure helper functions if dependency additions are undesirable.

## Expansion Sweep

### Future evolution

- Later可以把挑战从单次 L1→L6 扩展成阶段性闯关、错因标签、间隔复习。
- 后续可以让教师查看“对话画像 vs 挑战核查”的偏差，发现会说但不会做的学生。

### Related scenarios

- 项目列表、项目详情、学生首页的概念文案要一致。
- API route 和 server action 的错误状态要沿用现有 blocked/error state 模式。

### Failure & edge cases

- Provider 未配置时不能静默生成假题。
- AI 评判输出格式异常时需要保留可解释反馈，不应推进层级。
- 已评判挑战不能重复提交，现有 `evaluateAnswer` 已有保护。

## Decision (ADR-lite)

**Context**: 当前系统已有对话 Bloom 分类和单题挑战，但产品心智混在一起，缺少“挑战真实核查并逐层攀升”的闭环。

**Decision**: MVP 采用项目内 L1→L6 顺序挑战。对话负责画像；挑战负责核查。每一层达标才显示下一层行动，未达标停留当前层并反馈补强。

**Consequences**: 实现范围可控，可以复用现有 `practice_records` 和 `challenge-engine`；不足是暂不做复杂自适应算法，但先保证认知概念正确、闭环可验证。
