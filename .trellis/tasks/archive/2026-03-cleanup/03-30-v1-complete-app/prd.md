# V1 完整应用交付

## 目标

基于当前 PRD v1.0 与 `.trellis/spec`，把“完整应用交付”收口成一个**可执行任务树入口**：父任务只负责总边界、验收口径和子任务编排，不直接承载所有实现细节。

## 父任务职责

- 维护 V1 总边界：角色、正式任务、正式结果对象、核心验收口径；其中 admin 管理后台能力属于 V1 范围，不再后置到独立版本
- 保证子任务拆分和 domain/backend spec 一致
- 为后续代理提供清晰入口，避免再次回头补需求
- 把真正可落地的实现主线下沉到子任务，尤其是后端主交付子任务

## 当前任务树重点

- `03-30-auth-accounts`：认证与账号体系
- `03-30-b`：路线选择与提示词模板
- `03-30-c`：本地检索与上下文模式
- `03-30-d`：结果格式与结果检查
- `03-30-e`：教师主链路
- `03-30-f`：学生提示梯度链路
- `03-30-f2`：学习轨迹与布鲁姆掌握度
- `03-30-g`：导出与模板
- `03-30-h`：运行记录、指标与专业模式
- `03-30-03-30-v1-backend-delivery`：V1 可直接执行后端交付主线

## 父任务验收标准

1. 子任务边界与 `.trellis/spec/domain/*.md` 一致，没有把 v2 能力混入 v1 正式范围。
2. 至少存在一个“后续代理可直接执行”的主交付子任务，能覆盖后端主链路而无需再次补 PRD。
3. `03-30-v1-complete-app` 下所有关键子任务都有明确 PRD、上下文和验收点。
4. v1 不得误接入 `practice_sheet`、`review_card`、`learning_summary` 作为正式能力。
5. 新代理读取 Trellis 后，能够直接按任务树推进实现，而不需要再回头补需求。

## 说明

- `frontend/`、管理后台、完整 UI 交互仍可由子任务继续拆分，但不应阻塞“后端可直接执行交付主线”的建立。
- 年龄阶段保持系统自动推断，不单独拆成“小学 / 初中 / 高中”产品线任务。

## 当前会话已确认

- 本次目标升级为：在现有父任务基础上，推进到“V1 完整应用交付”，而不只是后端主线收口。
- 代码应放入 `slm` 下新建的 agent 应用子目录中，不直接散落在仓库根目录；子目录名称由 AI 决定。
- 交付物需要可测试。
- 开发过程中需要按 git 工作流推进。
- 允许使用 skills 与 MCP 协助。

## 已知现状

- 当前仓库已有 `app/backend/` FastAPI 后端实现，可见登录、学生创建、任务执行、会话查询、导出等接口。
- 当前仓库已有 `app/frontend/` Next.js 前端工程，并存在 `app/frontend/package.json`。
- 当前关键问题已不再是“是否已有前端”，而是 Trellis 任务、PRD 与代码现状是否严格对齐，以及完整应用范围如何按任务树收口。

## 当前待确认问题

- 已确认采用“后端 + 完整 Web 前端”作为 V1 完整应用交付形态。
- 待进一步确认的是：本次 MVP 是否要把 admin 面板（trace / MCP / Skill / 模板管理）也一起做到可用首版，还是先保证 teacher + student 主链路可交付，再把 admin 收成简版。

## 扩展思考

### Future evolution

- 后续很可能从单机本地工作台扩展到“教师-学生-管理员”持续使用的长期系统，因此目录结构应允许前后端分层与后续继续拆模块。
- 后续 admin 配置、模板版本和 trace 面板会持续增强，所以前端工程需要保留清晰的路由与页面分区，而不是一次性演示页。

### Related scenarios

- teacher 端至少要和 student 端保持一致的登录、会话、结果查看和导出体验，避免角色切换后信息架构完全不同。
- admin 端如果进入本次 MVP，至少要与 backend 的 trace / skill / template 数据结构保持一致，不做只展示假数据的空壳页。

### Failure and edge cases

- 首次登录、无数据冷启动、导出失败回退、非法角色访问、`draft` 结果不可导出，都属于必须考虑的 v1 关键边界。
- 前后端分离后要明确 token、remember me、403/401 处理，以及后端未就绪时前端的降级展示。

## 当前倾向

- 你已确认本次范围升级为：teacher + student + admin 三端都做到完整首版。
- 因此本任务不再只收敛主链路，而是要补齐完整 Web 应用工程、角色页面与后台管理页面。

## Research Notes

### Constraints from current repo/project

- 当前仓库已有 `app/` FastAPI 后端原型，适合作为 API 服务继续演进。
- 当前仓库已有可运行的 `app/frontend/` Next.js 工程，后续工作应基于现有前端继续补齐与收口。
- 前端规范已明确给出 `frontend/app/...` 目录结构、`SWR`、`lib/api.ts`、`lib/types.ts`、六状态结果区等约束。
- 类型安全规范要求前后端边界使用 Zod 校验，且禁止旧枚举与 `any`。
- 当前 `.trellis/spec/frontend` 明显更贴近 React/Next 风格文件组织，而不是纯模板页。

### Feasible approaches here

**Approach A: Next.js App Router + TypeScript + SWR** (Recommended)

- How it works:
  - 在新 agent 应用目录下创建 `frontend/`（Next.js）与现有 FastAPI 后端并存。
  - 前端使用 App Router、SWR、Zod、shadcn/ui 风格组件组织页面与权限视图。
  - 通过 `lib/api.ts` 调用 FastAPI，统一处理 token、401/403、导出和错误格式。
- Pros:
  - 与现有 spec 的 `frontend/app/...` 目录约定高度一致。
  - 路由、布局、角色页、admin 面板都容易组织。
  - 后续继续扩充 teacher/student/admin 页面成本最低。
- Cons:
  - 需要初始化 Node 工程、构建配置和前后端联调。
  - 比纯 SPA 稍重。

**Approach B: Vite + React Router + TypeScript + SWR**

- How it works:
  - 创建轻量 React SPA，使用 React Router 做页面切换。
  - 保留与 spec 接近的目录结构，但需要手动贴合 `app/` 路由语义。
- Pros:
  - 初始化更快，构建更轻。
  - 对纯客户端交互场景足够。
- Cons:
  - 与 spec 中 `frontend/app/...` 结构不完全对齐。
  - 多布局、admin 分区、后续扩展体验弱于 Next.js。

**Approach C: FastAPI 提供模板页面 + 少量前端增强**

- How it works:
  - 不单独建现代前端工程，直接用后端模板渲染页面，再局部增强交互。
- Pros:
  - 工程数量少。
- Cons:
  - 与前端 spec 明显不匹配。
  - 不利于复杂角色视图、状态管理和后续演进。
  - 不适合作为“完整 Web 前端”交付。

## 初步技术建议

- 已确认采用 Approach A：Next.js App Router + TypeScript + SWR。
- 在 `slm/` 下新建一个 agent 应用目录，后续把前后端应用代码都收口到该目录中，而不是继续直接堆在仓库根目录。
- 为降低整理风险，默认做法是：保留当前根目录原型代码作为参考源，在新 agent 应用目录内重组/吸纳可复用代码，而不是直接覆盖式搬移现有根目录文件。
- git 方面按本地仓库工作流推进：新目录建好后，把应用代码集中在该目录下，后续以清晰的阶段性提交组织实现。

## 仍需收敛的范围点

- 虽然目标是 V1 完整应用交付，但 `.trellis/spec/domain/product-scope.md` 中同时存在 P0/P1/P2 能力。
- 当前任务树已覆盖认证、主链路、检索、导出、轨迹、admin 等模块，因此还需要明确：这次是否要求把 P1 能力也一起做进首轮交付，还是以 P0 全量 + 关键 P1 首版为准。
