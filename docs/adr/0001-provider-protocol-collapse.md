# 0001: Provider 对话协议收敛为三种

日期：2026-09-05 · 状态：accepted

## 背景

provider_type 曾有 9 个数据库枚举值（cloud/local/proxy/openai/openai-compatible/gateway/anthropic/ollama/azure），UI 还多出一个数据库会拒绝的 local-lmstudio。运行时只认两种：gateway 走 createGateway，其余全部按 OpenAI Chat Completions 调用——`anthropic` 选项是假的，选了也打不通。模型列表拉取与健康检查则对所有类型无差别使用 OpenAI 风格端点。

## 决策

1. **协议类型收敛为恰三种**：`anthropic`（Messages API）、`openai-responses`（Responses API）、`openai-compatible`（Chat Completions）。区分维度只有报文协议；端点位置由 base_url 表达。云/本地/中转等部署位置标签与 Ollama/Azure/LM Studio 等厂商标签一律不是协议——它们全都是 OpenAI 兼容端点，填 base_url 即可。
2. **三种协议全部真实实现**：运行时模型解析、模型列表拉取、健康检查三处均按协议分支。安装 `@ai-sdk/anthropic`。
3. **Gateway 移除**：现网零数据行，且 createGateway 本质也是 OpenAI 兼容端点，`AI_GATEWAY_BASE_URL` 回退一并删除。
4. **数据库只换约束不迁数据**：现网 provider_configs 仅存在 `openai-compatible` 行（目标值之一），CHECK 约束直接替换为三值。

## 后果

- 新增协议 = 改一处 helper + 三处实现点，而不是先膨胀标签再欠协议债。
- 管理员需要理解"协议 vs 端点"的区分：接 DeepSeek/Ollama/中转站选 openai-compatible 并填各自的 base_url。
- 若未来出现既非 Anthropic 也非 OpenAI 系的协议（如 Google Gemini 原生 API），再新增第四种枚举值，同样要求三处实现点同步。
