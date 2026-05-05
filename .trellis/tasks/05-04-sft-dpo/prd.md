# SFT 与 DPO 数据教师审计和管理员导出

## Goal

测试并完善完整 SFT/DPO 数据治理 pipeline：从模拟真实师生/学生 AI 交互获得可追溯轨迹数据，到教师端友好审计与最终数据预览，再到管理员端执行正式 JSONL 导出。教师负责复核、修正、偏好标注和预览自己的最终数据，管理员负责跨班级治理与真实导出。

## What I already know

* 用户希望覆盖 SFT 与 DPO 数据。
* 教师端需要“友好的审计”。
* 管理员端需要“导出”。
* 用户强调“测试功能并完善”和“追求 SOTA”。
* 用户明确要求“整个 pipeline 都要测试”，要模仿交互并获得真实轨迹数据，再让教师审计。
* 用户明确要求教师端可以友好预览自己最终的数据，但导出只在管理员端。
* 当前项目是 Next.js/Supabase 全栈工作台，已有 teacher/admin/student 页面和日志相关接口。
* 当前工作树已有 `/teacher/audit` 审计 UI、`/admin/exports` 导出 UI、`/api/admin/datasets/export` 预览/导出 API，以及 `web/src/lib/dataset-export.ts` 导出格式化模块。
* 当前工作树已有两套导出路径：新的 `dataset-export.ts` 使用 SFT chat `messages` / DPO `prompt/chosen/rejected`；旧的 `createExportBatch()` 使用 SFT `prompt/completion`，存在契约分歧。

## Assumptions (temporary)

* SFT 数据指真实交互轨迹中可用于监督微调的 prompt/response 样本。
* DPO 数据指教师基于真实轨迹或修正结果形成的偏好对比样本，至少包含 chosen/rejected 响应和偏好理由。
* “真实轨迹数据”在测试中应通过项目公共交互入口生成或以最接近生产数据形态的 fixture/seed 流程产生，不能只测试 formatter 的孤立对象。
* 教师端优先服务人工复核、筛选、标注质量风险、可追溯上下文和最终数据预览。
* 管理员端导出优先提供 JSONL，并在真正导出前展示 preview、coverage、invalid count 和样例行。

## Open Questions

* 无阻塞问题；默认锁定完整 pipeline MVP：真实/仿真实交互轨迹 → 教师审计 → 教师最终数据预览 → 管理员 JSONL preview/export。

## Requirements

* Pipeline 测试必须覆盖从交互轨迹生成、audit_records 进入队列、教师审计提交、教师预览最终 SFT/DPO 数据、管理员预览与导出的完整链路；不得用只测 formatter、孤立对象快照或伪造成功状态替代上下游功能测试。
* 模拟交互应产生与生产一致的 source conversation/message/audit trace：conversation、conversation_messages、audit_records、class/student/project/Bloom metadata 在审计和导出中可追溯。
* 教师端能区分并审计 SFT 与 DPO 数据。
* 教师端审计应有面向教学场景的摘要、状态、质量信号和可追溯来源。
* 教师端应保留源对话上下文、班级、学生、篇目、Bloom 信息、消息时间和被审消息高亮。
* SFT 标注应支持准确入库、修正后入库、拒绝入库，并持久化质量、修正答案和理由。
* DPO 标注应支持 chosen/rejected 对比和偏好理由，并阻止空值或 chosen/rejected 相同。
* 教师端应能友好预览“自己最终会贡献的数据”，包括 SFT JSONL row preview、DPO JSONL row preview、有效/无效样本提示、来源追踪和状态；教师端不得提供正式导出按钮。
* 管理员端能按 SFT/DPO 预览并导出已审核通过数据。
* 管理员端导出应采用训练框架友好的 JSONL：SFT 使用 chat-style `messages`，DPO 使用 `prompt/chosen/rejected`，并保留 `source_record_id`。
* 管理员端导出前应展示样例、覆盖统计、分布和无有效样本禁用状态。
* 新旧导出路径必须统一到同一 SFT/DPO formatter，避免 row shape 分歧。
* 测试应优先覆盖公共接口和用户可观察行为，而不是内部实现。

## Acceptance Criteria

* [ ] 测试能从仿真实交互轨迹构造出 conversation、assistant message、pending audit record，并验证教师审计队列可见。
* [ ] 教师可在审计界面查看 SFT 样本的关键字段、来源、质量状态和完整源上下文。
* [ ] 教师可提交 SFT 审计，修正后的最终 SFT row 预览使用 chat `messages`，并保留 `source_record_id`。
* [ ] 教师可提交 DPO 审计，最终 DPO row 预览使用 `prompt/chosen/rejected`，并保留 `source_record_id`。
* [ ] 教师最终数据预览只展示当前教师可见/负责的数据，并明确“导出由管理员执行”。
* [ ] 教师端没有正式导出入口。
* [ ] 教师审计队列不会丢失已自动创建的 pending audit records。
* [ ] 管理员可 preview SFT JSONL，看到 chat `messages` 样例、coverage、invalid count 和分布。
* [ ] 管理员可 preview DPO JSONL，看到 `prompt/chosen/rejected` 样例、coverage、invalid count 和分布。
* [ ] 管理员可导出 SFT 数据，导出记录可追溯到 source record。
* [ ] 管理员可导出 DPO 数据，导出记录可追溯到 source record。
* [ ] 新旧导出路径不存在 SFT/DPO row shape 分歧，或旧路径下线/委托到统一 formatter。
* [ ] 关键行为有先红后绿的测试覆盖。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Full pipeline test or closest available integration test covers interaction trace → teacher audit → teacher preview → admin preview/export.
* Lint / typecheck / CI green.
* Relevant UI path manually exercised in browser if frontend changes are made.
* Docs/notes updated if behavior changes.
* Rollout/rollback considered if risky.

## Out of Scope

* 实际发起模型训练任务。
* 连接外部标注平台。
* 引入新的第三方数据治理服务。
* CSV、Parquet、Hugging Face Hub 上传等多格式/远端导出。
* 多人协同标注分配与一致性评分。
* 教师端正式下载/导出文件。

## Research References

* [`research/sft-dpo-audit-export-patterns.md`](research/sft-dpo-audit-export-patterns.md) — SOTA patterns converge on context-rich human review, explicit SFT vs DPO field contracts, preview/validation before JSONL export, and source-ID traceability.

## Research Notes

### What similar tools do

* OpenAI chat fine-tuning examples use JSONL `messages` and validate format/statistics before upload.
* Hugging Face TRL separates SFT and preference/DPO dataset contracts; DPO standard shape is `prompt/chosen/rejected`.
* Label Studio and Argilla emphasize task/source context, human rationale, filtering, metadata, and traceable IDs through export.

### Constraints from our repo/project

* Existing teacher audit UI already uses a three-pane queue/context/form pattern.
* Existing admin export UI/API already supports preview-first workflow.
* Existing database has `audit_records` and `export_batches` with audit/export statuses.
* Tests are currently not established in `web/package.json`, so TDD likely needs minimal test tooling or use existing lint/typecheck plus focused pure-function tests if a test runner already exists elsewhere.

### Feasible approaches here

**Approach A: Consolidate and harden existing SOTA path** (Chosen)

* How it works: keep `/teacher/audit`, `/admin/exports`, `/api/admin/datasets/export`, and `dataset-export.ts`; add behavior tests around pipeline and export formatter/API contracts; fix queue/export contract gaps; add teacher-side final-data preview without export.
* Pros: minimal churn, preserves current UI work, fastest path to verified SOTA baseline, matches admin-only export boundary.
* Cons: does not introduce advanced annotation workflows like inter-rater review.

**Approach B: Build a fuller data-governance module now**

* How it works: add audit assignment, richer quality rubric, export versioning, and multi-format export in one pass.
* Pros: more complete platform story.
* Cons: larger scope, harder to finish cleanly with TDD in this task, more product decisions required.

**Approach C: Export-only hardening**

* How it works: focus only on admin JSONL export schemas and tests; leave teacher audit UX mostly unchanged.
* Pros: smallest implementation.
* Cons: under-delivers user’s full pipeline and teacher-friendly audit goal.

## Technical Approach

Use Approach A: consolidate the existing implementation, write tests against public pipeline/export/audit contracts first, then make minimal fixes for pending queue visibility, teacher final-data preview, SFT/DPO row shape consistency, and UI affordances needed by acceptance criteria.

## Decision (ADR-lite)

**Context**: The repo already contains most target surfaces, but tests, teacher final-data preview, and contract alignment lag behind implementation. User explicitly wants the whole pipeline tested with realistic interaction traces, teacher audit, teacher preview, and admin-only export.
**Decision**: Consolidate and harden the existing SOTA path, adding teacher preview but keeping export admin-only.
**Consequences**: We prioritize verified end-to-end behavior and role boundaries over adding external annotation services or multi-format export.

## Implementation Plan

* PR1 / tracer bullet: add minimal test runner if needed and one failing pipeline/export test for SFT trace → teacher audit visibility → final SFT row preview/formatter.
* PR2: implement minimal SFT path fixes, including pending audit visibility and teacher final-data preview without export.
* PR3: add DPO pipeline test and implement DPO preview path.
* PR4: unify admin export formatter paths and add admin preview/export tests.
* PR5: run lint/typecheck/tests and manually exercise teacher/admin UI.

## Technical Notes

* Inspected `web/src/lib/data/teacher.ts`: `getTeacherAuditQueue()` derives queue from assistant messages and attached audit rows.
* Inspected `web/src/components/workbench/teacher-audit-client.tsx`: filters, context panel, SFT/DPO tabs, and form validation affordances already exist.
* Inspected `web/src/lib/data/admin.ts`: legacy `createExportBatch()` still serializes SFT as `prompt/completion` while newer export module uses `messages`.
* Verified current tree has `web/src/app/admin/exports/page.tsx`, `web/src/app/admin/exports/dataset-export-client.tsx`, `web/src/app/api/admin/datasets/export/route.ts`, and `web/src/lib/dataset-export.ts`.
