-- 回滚存档：20260916132900 之前的 rebuild_scenario_provider_capabilities 原文
--
-- 为什么要存：那个迁移把 rebuild 改成「按作用域分层」，而 rebuild 会 DELETE 再 INSERT
-- 7 行派生的 provider_capabilities —— 产出为空就是**所有模型调用 503**。
-- 免费档没有 Branching，迁移不可回滚；出事后唯一的恢复手段是换回旧函数体并重跑。
-- 事到临头再从 git 历史里翻旧文件太慢，所以原文存这里。
--
-- 用法（确认派生能力行数异常时）：
--   1. 在 Studio SQL Editor 执行下面整个函数定义；
--   2. select public.rebuild_scenario_provider_capabilities();
--   3. select capability, count(*) from public.provider_capabilities group by 1 order by 1;
--      期望 7 个对话类能力各 1 行（学校自带 Provider 生效时会有额外的学校行）。
-- 注意：旧函数体不认 school_id，回滚后学校自带的 Provider 不会生效（回退到公司级），
-- 但不会报错 —— 这正是回滚该有的行为。

CREATE OR REPLACE FUNCTION "public"."rebuild_scenario_provider_capabilities"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.provider_capabilities
  where capability in (
    'student_chat'::public.provider_capability,
    'teacher_chat'::public.provider_capability,
    'bloom_classification'::public.provider_capability,
    'project_classification'::public.provider_capability,
    'practice_generation'::public.provider_capability,
    'practice_evaluation'::public.provider_capability,
    'audit_assist'::public.provider_capability
  );

  insert into public.provider_capabilities (provider_id, capability, model_id, is_enabled, metadata)
  select
    mtb.provider_id,
    stb.scenario,
    trim(mtb.model_id),
    true,
    jsonb_build_object('synced_from', 'scenario_tier_bindings', 'tier', stb.tier)
  from public.scenario_tier_bindings stb
  join public.model_tier_bindings mtb on mtb.tier = stb.tier and mtb.is_enabled
  where stb.is_enabled
    and stb.scenario in (
      'student_chat'::public.provider_capability,
      'teacher_chat'::public.provider_capability,
      'bloom_classification'::public.provider_capability,
      'project_classification'::public.provider_capability,
      'practice_generation'::public.provider_capability,
      'practice_evaluation'::public.provider_capability,
      'audit_assist'::public.provider_capability
    )
    and nullif(trim(mtb.model_id), '') is not null;
end $$;

-- 回滚后 school_id 列会留在表上（有默认值 NULL），无害：
-- 旧函数体不写它，解析 RPC 若已更新则会退化为「只看公司级」（因为学校行不存在）。
