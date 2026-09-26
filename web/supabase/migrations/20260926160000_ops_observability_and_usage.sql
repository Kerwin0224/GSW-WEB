-- ═══════════════════════════════════════════════════════════════════════════
-- 运维可观测：租户维度、真实延迟、用量计量
-- ═══════════════════════════════════════════════════════════════════════════
-- 旧模型的日志表只有 12 列，没有 school_id 也没有 duration_ms：
--   · 多租户下所有学校的日志混在同一张表，org_admin 看不到自己公司的边界
--   · withApiLogging 算出了 durationMs 并塞进事件对象，DB 写入路径丢弃它；
--     serverless 下本地文件通道又必然失败，所以生产环境的 durationMs 恒为
--     undefined —— p95、AI 服务 SLA 全部无从计算
-- 另有一处更根本的：无 token / 成本核算、无租户配额、无 AI 调用限流。
-- 平台方无法回答「B 学校这个月烧了多少 token、flash 档被谁打爆了」。

-- ── 1. 日志补租户与延迟 ─────────────────────────────────────────────────
alter table public.app_log_events add column if not exists school_id uuid references public.schools(id) on delete set null;
alter table public.app_log_events add column if not exists duration_ms integer
  check (duration_ms is null or duration_ms >= 0);
alter table public.app_log_events add column if not exists organization_id uuid;

create index if not exists app_log_events_school_created_idx
  on public.app_log_events (school_id, created_at desc);
create index if not exists app_log_events_duration_idx
  on public.app_log_events (duration_ms desc) where duration_ms is not null;

-- 读取策略：此前只有 using (public.is_admin())，公司管理员能看全表。
-- 改成分校收敛；platform 级事件（school_id IS NULL）仍对公司管理员可见，
-- 否则「平台自己挂了」这类事件谁都看不到。
drop policy if exists "app_log_events_read" on public.app_log_events;
create policy "app_log_events_read" on public.app_log_events for select
  using (
    school_id is not null and public.can_admin_school_scope(school_id)
    or (school_id is null and public.is_org_admin())
  );

-- 写入函数：新参数一律**追加在末尾并带默认值**。
-- 改参数顺序会静默错位——旧的 12 个调用点仍按位置传参，
-- 新签名里 school_id 会收到 p_event_id，表现是「日志全丢」而不是报错。
-- 签名校验与 search_path='' 逐字保留：这是 serverless 侧唯一的写入口，
-- 放松任何一项等于把日志表开放给任意调用方。
drop function if exists public.write_app_log_event(
  uuid, text, text, text, text, text, integer, text, text, text, jsonb, text
);

create or replace function public.write_app_log_event(
  p_event_id uuid,
  p_level text,
  p_area text,
  p_event text,
  p_route text,
  p_method text,
  p_status integer,
  p_request_id text,
  p_message text,
  p_digest text,
  p_context jsonb,
  p_server_signature text,
  p_school_id uuid default null,
  p_organization_id uuid default null,
  p_duration_ms integer default null
)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
begin
  if not coalesce(
    p_server_signature = (
      select encode(
        extensions.hmac(('log:' || p_event_id::text)::bytea, secrets.value::bytea, 'sha256'),
        'hex'
      )
      from private.runtime_secrets as secrets
      where secrets.name = 'cwb_auth_secret'
    ),
    false
  ) then
    raise exception 'server log signature required' using errcode = '42501';
  end if;

  insert into public.app_log_events (
    id, level, area, event, route, method, status, request_id,
    message, digest, context, school_id, organization_id, duration_ms
  ) values (
    p_event_id, p_level, p_area, p_event, p_route, p_method, p_status,
    p_request_id, p_message, p_digest, p_context,
    p_school_id, p_organization_id, p_duration_ms
  );
end
$$;

revoke all on function public.write_app_log_event(
  uuid, text, text, text, text, text, integer, text, text, text, jsonb, text,
  uuid, uuid, integer
) from public, authenticated;
grant execute on function public.write_app_log_event(
  uuid, text, text, text, text, text, integer, text, text, text, jsonb, text,
  uuid, uuid, integer
) to anon, service_role;

-- ── 2. 用量计量：先有计量，再谈配额 ─────────────────────────────────────
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  school_id uuid references public.schools(id) on delete set null,
  organization_id uuid,
  profile_id uuid references public.profiles(id) on delete set null,
  scenario text not null,
  model_id text,
  provider_id uuid references public.provider_configs(id) on delete set null,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  request_id text,
  error_code text
);

create index if not exists ai_usage_school_time_idx on public.ai_usage (school_id, occurred_at desc);
create index if not exists ai_usage_scenario_idx  on public.ai_usage (scenario, occurred_at desc);
create index if not exists ai_usage_time_idx      on public.ai_usage (occurred_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_read" on public.ai_usage;
create policy "ai_usage_read" on public.ai_usage for select
  using (
    (school_id is not null and public.can_admin_school_scope(school_id))
    or (school_id is null and public.is_org_admin())
  );

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
-- 写入只经由 definer 的记量函数：用量行不能由调用方自己编。

create or replace function public.record_ai_usage(
  p_school_id uuid,
  p_organization_id uuid,
  p_profile_id uuid,
  p_scenario text,
  p_model_id text,
  p_provider_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_request_id text default null,
  p_error_code text default null
) returns void
language sql security definer
set search_path to 'public'
as $$
  insert into public.ai_usage (
    school_id, organization_id, profile_id, scenario, model_id, provider_id,
    input_tokens, output_tokens, total_tokens, request_id, error_code
  ) values (
    p_school_id, p_organization_id, p_profile_id, p_scenario, p_model_id, p_provider_id,
    p_input_tokens, p_output_tokens,
    coalesce(p_input_tokens, 0) + coalesce(p_output_tokens, 0),
    p_request_id, p_error_code
  );
$$;

grant execute on function public.record_ai_usage(
  uuid, uuid, uuid, text, text, uuid, integer, integer, text, text
) to anon, authenticated, service_role;

-- 日用量汇总：/admin 与 /org 各加一张「按学校 × 天」的卡，限量与对账从此有依据
create or replace function public.ai_usage_daily(
  p_from timestamptz,
  p_to timestamptz
) returns table (
  school_id uuid,
  school_name text,
  day date,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  errors bigint
)
language sql stable security definer
set search_path to 'public'
as $$
  select u.school_id,
         (select sc.name from public.schools sc where sc.id = u.school_id),
         date_trunc('day', u.occurred_at)::date,
         count(*),
         coalesce(sum(u.input_tokens), 0),
         coalesce(sum(u.output_tokens), 0),
         coalesce(sum(u.total_tokens), 0),
         count(*) filter (where u.error_code is not null)
    from public.ai_usage u
   where u.occurred_at >= p_from and u.occurred_at < p_to
     and (u.school_id is null or public.can_admin_school_scope(u.school_id))
   group by u.school_id, date_trunc('day', u.occurred_at)::date
   order by 3 desc, 1
$$;

grant execute on function public.ai_usage_daily(timestamptz, timestamptz) to anon, authenticated, service_role;

-- ── 3. 教学场景与模型能力拆成两个枚举 ───────────────────────────────────
-- 此前 scenario_tier_bindings.scenario 与 provider_capabilities.capability
-- 共用同一个 provider_capability 枚举，于是「加一种教学形态」必须同时
-- 「发明一个模型能力」：PG enum / database.types.ts / admin.ts 白名单 /
-- 能力矩阵 UI 四处要改，漏改任何一处症状都是静默的——新场景不出现在矩阵页，
-- 或 getCapability 报 unknown capability 503。
--
-- 改法：场景进表（可增可禁用），模型能力留在枚举里（稳定、少数几项）。
-- 旧 scenario 列保留不删：provider_capabilities 仍在用同一个枚举，
-- 一次动两个表的枚举类型收益不抵风险。应用层优先读 scenario_key。
create table if not exists public.teaching_scenarios (
  key text primary key,
  display_name text not null,
  description text,
  sort_order integer not null default 100,
  enabled boolean not null default true
);

insert into public.teaching_scenarios (key, display_name, description, sort_order) values
  ('student_chat',           '学生学习提问', '学生向 AI 提问的主链路', 10),
  ('teacher_chat',           '教师备课问答', '教师个人通用 AI 交互', 20),
  ('project_classification', '学习主题归属', '把首问归到项目', 30),
  ('challenge_generation',   '挑战出题',     '按目标层级生成挑战题', 40),
  ('challenge_evaluation',   '挑战评阅',     '判定挑战作答是否通过', 50),
  ('pre_review',             'AI 预审',      '全会话教学正确性预审', 60)
on conflict (key) do nothing;

alter table public.scenario_tier_bindings
  add column if not exists scenario_key text references public.teaching_scenarios(key) on delete cascade;

-- 旧枚举与新表键名一致的直接回填；不一致的（bloom_classification、
-- practice_generation/evaluation、audit_assist、embedding）留空由应用层回落，
-- 凭空造映射等于替租户决定「哪类调用该走哪一档」。
update public.scenario_tier_bindings
   set scenario_key = scenario::text
 where scenario_key is null
   and scenario::text in (select key from public.teaching_scenarios);

create index if not exists scenario_tier_bindings_scenario_key_idx
  on public.scenario_tier_bindings (scenario_key);

alter table public.teaching_scenarios enable row level security;
drop policy if exists "teaching_scenarios_read" on public.teaching_scenarios;
create policy "teaching_scenarios_read" on public.teaching_scenarios for select
  using (public.current_app_user_id() is not null);

drop policy if exists "teaching_scenarios_admin_write" on public.teaching_scenarios;
create policy "teaching_scenarios_admin_write" on public.teaching_scenarios for all
  using (public.is_org_admin())
  with check (public.is_org_admin());

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='app_log_events' and column_name='duration_ms'
  ) then
    raise exception 'app_log_events.duration_ms missing';
  end if;
  if (select count(*) from public.ai_usage) > 0 then
    raise notice 'ai_usage 已有历史行，汇总口径以 occurred_at 为准';
  end if;
  if (select count(*) from public.teaching_scenarios) < 6 then
    raise exception 'teaching scenarios must be seeded at least 6';
  end if;
  raise notice '运维可观测就位：日志租户+延迟 + 用量计量 + 场景/能力拆分';
end $$;
