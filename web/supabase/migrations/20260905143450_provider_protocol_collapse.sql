-- Provider 协议类型收敛（ADR-0001）
-- 协议枚举从 9 值收敛为 3 值：anthropic / openai-responses / openai-compatible。
-- 现网 provider_configs 仅存在 openai-compatible 行（目标值之一），无需数据映射。
-- cloud/local/proxy/ollama/azure/lm-studio 等部署位置与厂商标签不是协议，
-- 统一以 openai-compatible + 各自 base_url 表达。

ALTER TABLE public.provider_configs
  DROP CONSTRAINT provider_configs_provider_type_check;

ALTER TABLE public.provider_configs
  ADD CONSTRAINT provider_configs_provider_type_check
  CHECK (provider_type = ANY (ARRAY['anthropic'::text, 'openai-responses'::text, 'openai-compatible'::text]));
