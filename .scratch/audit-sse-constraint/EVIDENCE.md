# 「所接网关只正常服务 SSE」这条约束的证据链

同目录下的 `q-*.sql` / `0*-*.sql` 是取证时跑过的查询（`supabase db query --linked -f <文件>`），
留着是为了复核，不是为了重跑。

## 结论

约束**成立**，且不是历史包袱。但它只约束**非流式**请求，不约束结构化输出本身。

## 四环证据

1. **断言原文**：`web/src/lib/classification-prompts.ts:112`（准确，说的是"非流式 JSON 会直接抛错"）
   与 `web/src/lib/student-chat-classifiers.ts`（原文范围过宽，已收窄）。

2. **事故实锤**：`app_log_events` 里唯一带错误原文的记录 —— 2026-09-11 12:40:47 UTC，
   event `project_classification_fallback`，`request_id api_2c9b422f`，
   context `{"detail":"Invalid JSON response","reason":"model-error"}`。
   **决定性对照**：同一个 `api_2c9b422f` 下 `student_chat_completed` 是 200（12:40:44），3 秒后归类才炸。
   同一次请求、同一个 provider，流式正常、非流式抛错。

3. **错误串只可能来自非流式路径**（SDK 源码闭环）：
   - `ai/dist/index.js` — `generateObject` 走 `model.doGenerate`
   - `@ai-sdk/anthropic/dist/index.js` — `doGenerate` 发 `stream: false`，用 `createJsonResponseHandler` 解析
   - 同文件 `doStream` 发 `stream: true`，用 `createEventSourceResponseHandler` 解 SSE，永不碰 JSON
   - `@ai-sdk/provider-utils/src/response-handler.ts` — 该 handler 解析失败时抛的 message 逐字就是
     `Invalid JSON response`

4. **provider 没换**：`provider_configs` 现网三行，`rednotes` / `https://note3-prev-api.askdiandian.com` /
   `anthropic`，与事故当天同一行。七个 LLM 能力（含 `project_classification`、`practice_generation`）
   两跳全部落在它上面，无 school 级覆盖。

## 修复后的观测

- 三次 `project_classification_fallback` 全是 `unclassified`（文本拿到了、只是解析器没匹配），
  `model-error` **零次** —— 流式确实通。
- 唯一一次非流式调用：`challenge/generate` 于 2026-09-14 05:39:24 返回 **502**
  （该路由唯一 502 分支），距同 provider 上一次流式成功仅 22 分钟。

## 什么时候该重新读这份证据

约束会在**换掉 rednotes 网关**那天过期。但 `provider_configs` 换行只是必要条件，
不是约束消失的证明 —— 换了哪家、能不能做结构化输出，只能实测。

两个触发条件：
- `challenge` 第一次**成功**生成（说明当时的判断有偏差，重新读第 3 环）
- 或第一次失败得**不像**传输问题（例如耗时长、像 schema 不匹配）

## 已知的方法论缺口

2026-09-14 那次 502 的**确切错误原文拿不到**：`withApiLogging` 只记 status，路由把 `error.message`
只写进 HTTP 响应体。所以无法区分它是 `APICallError "Invalid JSON response"`（网关不供非流式）
还是 `NoObjectGeneratedError`（模型返回的 JSON 不匹配 schema）。那次耗时 46 秒（同类前两次 21 秒 / 17 秒），
时长更倾向 schema/tool 类失败。**该缺口已在 `challenge/generate` 与 `challenge/evaluate` 的 catch 里补上**
（`challenge_generate_failed` / `challenge_evaluate_failed` 事件），下次同类失败会留下原文。

网关方是否在 2026-09-11 之后**静默改过行为**，仓库无从判断：`provider_configs` 没有变更审计表。
唯一能证伪的方法是现在直接打一次非流式请求，那需要 Vault 里的密钥（按纪律未读取、未探测）。
