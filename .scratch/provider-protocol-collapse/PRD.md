# PRD: Provider 协议收敛 + 模型选择可搜索化

日期：2026-09-05 · 状态：approved · 决策记录：docs/adr/0001-provider-protocol-collapse.md

## 背景

- UI 的 provider_type 下拉有 10 个选项（两处还不一致），运行时只认 2 种，`anthropic` 是假支持，`local-lmstudio` 会被 DB 约束直接拒绝。
- 现网 provider_configs 只有 2 行 `openai-compatible`（Nvidia、Poolside），其余类型零数据。
- 模型选择用原生 `<datalist>`（浏览器补全），无法边输边筛；"拉取模型"按钮拉完只弹 toast，需重进对话框才能看到候选。

## 需求

### R1 协议枚举收敛为 3 种

`anthropic`（Messages API，真实现）/ `openai-responses`（OpenAI Responses API）/ `openai-compatible`（Chat Completions，兼容一切 OpenAI 风格端点）。部署位置与厂商标签不再是协议。

### R2 三处协议实现

- 运行时 `resolveLanguageModel`：三分支（createAnthropic / .responses / .chat）；删除 gateway 分支与 `AI_GATEWAY_BASE_URL` 回退。
- `retrieval.ts resolveEmbeddingModel`：删除 gateway 分支；anthropic 不提供 Embedding，遇到返回 null。
- `list-models` 与 `health-check`：按协议取 URL 与鉴权头（anthropic: `/v1/models` + `x-api-key` + `anthropic-version`；openai 系: `/models` + Bearer），抽公共 helper。

### R3 数据库

新迁移文件：CHECK 约束 9 值 → 3 值。现网数据全部是 `openai-compatible`，无需数据映射。

### R4 模型选择统一为可搜索 combobox

cmdk + Popover（依赖已存在），行为：输入即本地过滤；从已拉取模型列表点选；拉不到时可直接手输任意 model id。替换 `TierAssignmentDialog` 与 `CapabilityAssignmentDialog`（Embedding）两处的 Input+datalist。`FetchModelsButton` 拉取成功后就地刷新数据（router.refresh），不再只弹 toast。

### R5 供应商对话框

新建/编辑对话框的协议下拉收敛为 3 项（消灭 local-lmstudio bug）；base_url 默认值/占位符按协议切换；提示语说明本地部署（Ollama/LM Studio）填本机地址即可。

## 验收标准

1. `supabase db reset` 零报错；迁移后 CHECK 只接受 3 值。
2. typecheck、lint、现有测试全绿。
3. UI 两处模型选择均为 combobox，输入即过滤；协议下拉仅 3 项。
4. detect_changes 无意外符号受影响；push 后 Vercel 构建 READY。
