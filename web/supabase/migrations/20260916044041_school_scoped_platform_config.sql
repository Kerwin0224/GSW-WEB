-- 平台配置的租户维度：学校可自带 Provider 与 MCP，「本校优先、回退公司级」。
--
-- ADR-0002 当时的裁定是「模型网关按公司统一采购」，所以 provider_configs / model_tier_bindings /
-- mcp_servers / prompt_presets 全都没有租户列。产品推翻了该裁定：这是给多所学校用的 SaaS，
-- 学校要能带自己的网关与工具。
--
-- 顺带修掉两条实锤越权（不是理论风险）：
--   · prompt_presets 的 presets_app_admin_all 用 is_admin()，无学校谓词
--     → A 校管理员可以读改 B 校的预设。
--   · presets_app_published_read 收窄成了 purpose='chat'，但仍无租户谓词
--     → 任何已登录用户可读任何学校的备课模板。
--
-- 统一形状：`school_id IS NULL` = **公司级模板**（所有校可见可用），非空 = 某校自带。
-- 注意这与 20260915231533 修的「未划归落 null 导致泄漏」是两回事：那里 null 是事故源，
-- 这里 null 是设计意图。迁移里必须写死这个区别，否则下一个人会把两者当成同一回事。
--
-- 风险最高的地方是 rebuild_scenario_provider_capabilities：它 DELETE 再 INSERT 派生的
-- 7 行能力，产出为空就是所有模型调用 503。函数体内 delete+insert 同事务，要么一致地好
-- 要么一致地坏（不存在闪断），迁移末尾有计数自检兜门禁。旧函数体已存档于
-- docs/prod-data-fixes/，回滚只需一条新迁移换回去并重跑。

-- ── 1. 加列 ──────────────────────────────────────────────────────────────────

alter table public.provider_configs add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.mcp_servers      add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.model_tier_bindings add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.provider_capabilities add column if not exists school_id uuid references public.schools(id) on delete cascade;

alter table public.prompt_presets add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.prompt_presets add column if not exists school_id uuid references public.schools(id) on delete cascade;

-- 根表的两处默认值：让**尚未更新的旧代码**（插入时不传 school_id）自动落到写入者的学校。
-- 有它，本迁移落地瞬间行为就是对的，不必等代码部署；org_admin 的 current_school_id() 为 NULL，
-- 于是他建的是公司级模板 —— 正是想要的。
alter table public.provider_configs alter column school_id set default public.current_school_id();
alter table public.mcp_servers      alter column school_id set default public.current_school_id();

comment on column public.provider_configs.school_id is
  'NULL = 公司级模板（所有校可用）；非空 = 该校自带。默认值按写入者会话推断，使未显式传参的写入路径自动归属。';
comment on column public.mcp_servers.school_id is '同上。学校自带的 MCP 与公司级模板的取舍见 get_role_mcp_servers。';

create index if not exists provider_configs_school_idx on public.provider_configs (school_id);
create index if not exists mcp_servers_school_idx on public.mcp_servers (school_id);
create index if not exists model_tier_bindings_school_idx on public.model_tier_bindings (school_id);
create index if not exists prompt_presets_school_idx on public.prompt_presets (school_id);

-- ── 2. 叶子表：capability 的租户归属永远跟随其 provider ──────────────────────
-- 必须用触发器而不是列默认值：org_admin 在 /org 里给 B 校的 provider 配 embedding 时，
-- 他的 current_school_id() 是 NULL，用会话默认值会产生一行 school_id=NULL 却指向 B 校 provider
-- 的能力行 —— 所有学校都能通过回退拿到 B 校的 Provider，是跨校泄漏。从 provider 继承则写不错。

create or replace function public.sync_provider_capability_school() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
begin
  if new.school_id is null then
    new.school_id := (select p.school_id from public.provider_configs p where p.id = new.provider_id);
  end if;
  return new;
end $$;

revoke all on function public.sync_provider_capability_school() from public, anon, authenticated;

drop trigger if exists provider_capabilities_sync_school on public.provider_capabilities;
create trigger provider_capabilities_sync_school
  before insert or update of provider_id on public.provider_capabilities
  for each row execute function public.sync_provider_capability_school();

update public.provider_capabilities pc
   set school_id = p.school_id
  from public.provider_configs p
 where p.id = pc.provider_id
   and pc.school_id is distinct from p.school_id;

-- ── 3. 唯一约束：从「全局一行」改为「每作用域一行」────────────────────────────
-- PG15+ 的 NULLS NOT DISTINCT 让 NULL 参与去重，这样 on conflict (school_id, tier)
-- 才能命中公司级那一行（否则 NULL 永不相等，每次 upsert 都会插新行）。

alter table public.model_tier_bindings drop constraint if exists model_tier_bindings_tier_key;
alter table public.model_tier_bindings
  add constraint model_tier_bindings_school_tier_key unique nulls not distinct (school_id, tier);

-- 旧键 (provider_id, capability, model_id) 在新模型下必然冲突：B 校与 C 校都回退到同一个
-- 公司级 Provider 时会生成两行同键行。
alter table public.provider_capabilities
  drop constraint if exists provider_capabilities_provider_id_capability_model_id_key;
alter table public.provider_capabilities
  add constraint provider_capabilities_school_provider_capability_model_key
  unique nulls not distinct (school_id, provider_id, capability, model_id);

-- ── 4. 解析链：本校优先、回退公司级 ──────────────────────────────────────────
-- 返回列名与顺序**逐字不变** —— 改返回类型必须 DROP+CREATE，会让迁移窗口里的旧代码调用直接失败。
--
-- 「回退」不需要调用方做任何事：函数返回全部候选行且本校行排在前，而
-- src/lib/data/common.ts 的 getProviderCapability 本来就是「逐行尝试，第一个 ready 的胜出」。
-- 学校自建密钥坏掉 → 跳过 → 落到公司级行 → 不 503。这是刻意的降级，不是静默失败。

create or replace function public.get_provider_capability_provider(p_capability public.provider_capability)
returns table(capability public.provider_capability, model_id text, provider_name text, provider_type text, base_url text, secret_ref text, health_status text)
    language plpgsql stable security definer
    set search_path to 'public'
    as $$
declare
  v_school uuid := public.current_school_id();
begin
  if not public.has_valid_app_session_signature() then
    raise exception 'server session signature required' using errcode = '42501';
  end if;

  return query
  select pc.capability, pc.model_id, p.name, p.provider_type, p.base_url, p.secret_ref, p.health_status
  from public.provider_capabilities pc
  join public.provider_configs p on p.id = pc.provider_id
  where pc.capability = p_capability
    and pc.is_enabled
    and p.is_enabled
    -- v_school 为 NULL（org_admin / 平台账号 / 未划归）时，等于只看公司级行
    -- —— 此时 `pc.school_id = v_school` 求值为 NULL 而非 true，天然把非空行滤掉。
    and (pc.school_id is null or pc.school_id = v_school)
  order by (pc.school_id is null), pc.provider_id, pc.model_id;
end $$;

create or replace function public.get_model_tier_provider(p_tier text)
returns table(tier text, model_id text, binding_enabled boolean, provider_id uuid, provider_name text, provider_type text, base_url text, secret_ref text, health_status text, provider_enabled boolean)
    language plpgsql stable security definer
    set search_path to 'public'
    as $$
declare
  v_school uuid := public.current_school_id();
begin
  if not public.has_valid_app_session_signature() then
    raise exception 'server session signature required' using errcode = '42501';
  end if;

  return query
  select mtb.tier, mtb.model_id, mtb.is_enabled, p.id, p.name, p.provider_type,
         p.base_url, p.secret_ref, p.health_status, p.is_enabled
  from public.model_tier_bindings mtb
  join public.provider_configs p on p.id = mtb.provider_id
  where mtb.tier = p_tier
    and (mtb.school_id is null or mtb.school_id = v_school)
  order by (mtb.school_id is null)
  limit 1;
end $$;

create or replace function public.get_role_mcp_servers(p_role public.app_role)
returns table(id uuid, name text, connection_ref text, secret_ref text, enabled_tools jsonb, health_status text, school_id uuid)
    language plpgsql stable security definer
    set search_path to 'public'
    as $$
declare
  v_school uuid := public.current_school_id();
begin
  if not public.has_valid_app_session_signature() then
    raise exception 'server session signature required' using errcode = '42501';
  end if;

  return query
  select s.id, s.name, s.connection_ref, s.secret_ref, s.enabled_tools, s.health_status, s.school_id
  from public.mcp_servers s
  where s.is_enabled
    and p_role = any (s.allowed_roles)
    -- MCP 是整体替换而非叠加：本校只要配了可用 Server，就只用本校这一套。
    -- （工具包叠加看似更「全」，但那样学校无法屏蔽公司级工具，与「自带」的语义相反。）
    and case
          when v_school is not null and exists (
            select 1 from public.mcp_servers o
            where o.is_enabled and o.school_id = v_school and p_role = any (o.allowed_roles)
          ) then s.school_id = v_school
          else s.school_id is null
        end
  order by s.created_at;
end $$;

-- ── 5. 写入 RPC：作用域由调用者推断，不新增参数（迁移落地即生效，与代码版本无关）──

create or replace function public.save_model_tier_binding_and_sync(p_tier text, p_provider_id uuid, p_model_id text)
returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_school uuid := public.current_school_id();
begin
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if p_tier not in ('flash','advanced') then
    raise exception 'unsupported tier: %', p_tier;
  end if;
  if nullif(trim(p_model_id), '') is null then
    raise exception 'model_id is required';
  end if;
  -- 目标 Provider 必须是公司级模板或本校自带，禁止指向他校。
  if not exists (
    select 1 from public.provider_configs p
    where p.id = p_provider_id and (p.school_id is null or p.school_id = v_school)
  ) then
    raise exception 'provider not in caller scope' using errcode = '42501';
  end if;

  insert into public.model_tier_bindings (school_id, tier, provider_id, model_id, is_enabled, metadata)
  values (v_school, p_tier, p_provider_id, trim(p_model_id), true,
          jsonb_build_object('source_of_truth','scenario_tier_bindings','synced_from','admin_model_tier_binding'))
  on conflict (school_id, tier) do update set
    provider_id = excluded.provider_id,
    model_id    = excluded.model_id,
    is_enabled  = true,
    metadata    = excluded.metadata;

  perform public.rebuild_scenario_provider_capabilities();
end $$;

-- 回退按钮的后端。没有它，「本校优先」是单向的 —— 学校改错了也回不到公司级。
create or replace function public.clear_school_model_tier_binding(p_tier text)
returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_school uuid := public.current_school_id();
begin
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if v_school is null then
    raise exception 'school-scoped account required' using errcode = '42501';
  end if;

  delete from public.model_tier_bindings where school_id = v_school and tier = p_tier;
  perform public.rebuild_scenario_provider_capabilities();
end $$;

-- 场景路由是公司级资产：它决定「哪个场景走哪个 tier」，改它会影响所有学校。
-- 学校要换的是 tier 绑到哪个 Provider（上面那个 RPC），不是这套映射。
-- 这一行收紧在迁移里就生效，不依赖代码部署。
create or replace function public.save_scenario_tier_bindings_and_sync(p_bindings jsonb)
returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  binding record;
begin
  if not public.is_org_admin() then
    raise exception 'org admin role required' using errcode = '42501';
  end if;

  for binding in
    select * from jsonb_to_recordset(p_bindings) as input(scenario text, tier text)
  loop
    if binding.scenario not in ('student_chat','teacher_chat','bloom_classification','project_classification','practice_generation','practice_evaluation','audit_assist') then
      raise exception 'unsupported scenario: %', binding.scenario;
    end if;
    if binding.tier not in ('flash','advanced') then
      raise exception 'unsupported tier: %', binding.tier;
    end if;

    insert into public.scenario_tier_bindings (scenario, tier, is_enabled, metadata)
    values (binding.scenario::public.provider_capability, binding.tier, true, jsonb_build_object('synced_from', 'admin_scenario_mapping'))
    on conflict (scenario) do update set
      tier = excluded.tier,
      is_enabled = true,
      metadata = excluded.metadata;
  end loop;

  perform public.rebuild_scenario_provider_capabilities();
end $$;

-- ── 6. 重建派生表：按作用域分层 ──────────────────────────────────────────────

create or replace function public.rebuild_scenario_provider_capabilities()
returns void
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_scenarios public.provider_capability[] := array[
    'student_chat','teacher_chat','bloom_classification','project_classification',
    'practice_generation','practice_evaluation','audit_assist'
  ]::public.provider_capability[];
begin
  delete from public.provider_capabilities where capability = any (v_scenarios);

  insert into public.provider_capabilities (school_id, provider_id, capability, model_id, is_enabled, metadata)
  with scopes as (
    -- 公司级一行 + 每所启用学校一行
    select null::uuid as school_id
    union all
    select s.id from public.schools s where s.status = 'active'
  ),
  resolved as (
    select
      sc.school_id,
      stb.scenario,
      stb.tier,
      coalesce(sb.provider_id, cb.provider_id) as provider_id,
      coalesce(sb.model_id,    cb.model_id)    as model_id,
      sb.provider_id is not null               as school_override
    from scopes sc
    cross join public.scenario_tier_bindings stb
    left join lateral (
      select b.provider_id, b.model_id from public.model_tier_bindings b
      where b.is_enabled and b.tier = stb.tier and b.school_id = sc.school_id
      limit 1
    ) sb on true
    left join lateral (
      select b.provider_id, b.model_id from public.model_tier_bindings b
      where b.is_enabled and b.tier = stb.tier and b.school_id is null
      limit 1
    ) cb on true
    where stb.is_enabled and stb.scenario = any (v_scenarios)
  )
  select r.school_id, r.provider_id, r.scenario, trim(r.model_id), true,
         jsonb_build_object('synced_from','scenario_tier_bindings','tier',r.tier,
                            'scope', case when r.school_id is null then 'company' else 'school' end)
  from resolved r
  where r.provider_id is not null
    and nullif(trim(r.model_id), '') is not null
    -- 学校没覆盖 tier 时不生成学校行：否则同一 provider 会有两行能力，
    -- /admin/providers 的 provider_capabilities(*) 嵌入会把它显示两遍。
    and (r.school_id is null or r.school_override);
end $$;

-- ── 7. 权限判定 helper + RLS ─────────────────────────────────────────────────

-- 写：校 admin 只写本校行；org_admin 写本公司任意行（含公司级模板）。
-- school_id 为 NULL 的校管理员在这里写不了任何东西 —— 这是有意的：
-- 为了兼容它而放开「admin 可写公司级模板」，等于任何学校管理员都能改全校的模型路由。
create or replace function public.can_admin_school_scope(p_school_id uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
      select exists (
        select 1 from public.profiles me
        where me.id = public.current_app_user_id() and me.status = 'active'
          and (
            (me.role = 'admin'
              and p_school_id is not null and p_school_id = me.school_id)
            or (me.role = 'org_admin'
              and (p_school_id is null
                   or p_school_id in (select s.id from public.schools s where s.org_id = me.organization_id)))
          )
      )
    $$;

-- 读：公司级行对所有已登录账号可见；本校行对全校可见；org_admin 另见本公司各校。
create or replace function public.can_read_school_scope(p_school_id uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
      select public.current_app_user_id() is not null
         and (
           p_school_id is null
           or p_school_id = public.current_school_id()
           or exists (
             select 1 from public.profiles me
             where me.id = public.current_app_user_id() and me.status = 'active'
               and me.role = 'org_admin'
               and p_school_id in (select s.id from public.schools s where s.org_id = me.organization_id)
           )
         )
    $$;

-- provider_configs / mcp_servers 含 secret_ref（API Key 与 MCP Token 的密文），
-- 读仍限 admin：运行时不走这两张表（走 security definer 的解析 RPC），
-- 所以不必为了「运行时能取」而把密文放开给全体师生。
-- 要开放得走「视图 + 列级 GRANT」，那是独立的一件事。
drop policy if exists "provider_app_admin_all" on public.provider_configs;
create policy "provider_configs_scope_read" on public.provider_configs for select
  using (public.is_admin() and public.can_read_school_scope(school_id));
create policy "provider_configs_scope_write" on public.provider_configs for all
  using (public.can_admin_school_scope(school_id))
  with check (public.can_admin_school_scope(school_id));

drop policy if exists "mcp_app_admin_all" on public.mcp_servers;
create policy "mcp_servers_scope_read" on public.mcp_servers for select
  using (public.is_admin() and public.can_read_school_scope(school_id));
create policy "mcp_servers_scope_write" on public.mcp_servers for all
  using (public.can_admin_school_scope(school_id))
  with check (public.can_admin_school_scope(school_id));

-- provider_capabilities / model_tier_bindings 不含凭据，维持「已登录可读」但按作用域收敛。
drop policy if exists "provider_caps_admin_all" on public.provider_capabilities;
drop policy if exists "provider_caps_authenticated_read" on public.provider_capabilities;
create policy "provider_caps_scope_read" on public.provider_capabilities for select
  using (public.can_read_school_scope(school_id) and is_enabled);
create policy "provider_caps_scope_write" on public.provider_capabilities for all
  using (public.can_admin_school_scope(school_id))
  with check (public.can_admin_school_scope(school_id));

drop policy if exists "model_tier_bindings_admin_all" on public.model_tier_bindings;
drop policy if exists "model_tier_bindings_authenticated_read" on public.model_tier_bindings;
create policy "model_tier_bindings_scope_read" on public.model_tier_bindings for select
  using (public.can_read_school_scope(school_id) and is_enabled);
create policy "model_tier_bindings_scope_write" on public.model_tier_bindings for all
  using (public.can_admin_school_scope(school_id))
  with check (public.can_admin_school_scope(school_id));

-- ── 8. prompt_presets：租户收敛（修两条实锤越权）────────────────────────────
-- 回填：按创建者反查归属。查不到创建者（账号已删）的历史行留 NULL，
-- 结果是「谁也读不到」——安全的一侧。不要为了兼容它们保留 is_admin() 全域放行，
-- 那正好把这次要修的越权原样留下来。
update public.prompt_presets pp
   set organization_id = p.organization_id,
       school_id = p.school_id
  from public.profiles p
 where p.id = pp.created_by
   and (pp.organization_id is distinct from p.organization_id or pp.school_id is distinct from p.school_id);

drop policy if exists "presets_app_admin_all" on public.prompt_presets;
create policy "presets_admin_scope_all" on public.prompt_presets for all
  using (
    public.is_admin()
    and (school_id is null or public.can_admin_school_scope(school_id))
    and (organization_id is null or organization_id = (select me.organization_id from public.profiles me where me.id = public.current_app_user_id()))
  )
  with check (
    public.is_admin()
    and (school_id is null or public.can_admin_school_scope(school_id))
    and (organization_id is null or organization_id = (select me.organization_id from public.profiles me where me.id = public.current_app_user_id()))
  );

-- 已发布的备课模板：只给本校 + 本公司下发的公司级模板。此前是无租户谓词的全局放行。
drop policy if exists "presets_app_published_read" on public.prompt_presets;
create policy "presets_published_school_read" on public.prompt_presets for select
  using (
    purpose = 'chat'
    and status = 'published'
    and (
      school_id = public.current_school_id()
      or (
        school_id is null
        and organization_id is not null
        and organization_id = (select me.organization_id from public.profiles me where me.id = public.current_app_user_id())
      )
    )
  );

-- 自检 ───────────────────────────────────────────────────────────────────────

do $$
declare
  v_capabilities integer;
  v_tiers integer;
begin
  -- 派生能力行非空是硬门禁：它空了就是所有模型调用 503。
  select count(*) into v_capabilities from public.provider_capabilities
   where capability <> 'embedding'::public.provider_capability;
  if v_capabilities = 0 then
    raise exception 'rebuild produced zero derived capability rows; every model call would 503';
  end if;

  select count(*) into v_tiers from public.model_tier_bindings where is_enabled;
  if v_tiers = 0 then
    raise exception 'no enabled tier bindings; rebuild cannot derive any capability';
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'prompt_presets' and policyname = 'presets_published_school_read'
  ) then
    raise exception 'prompt_presets tenant-scoped read policy missing';
  end if;

  raise notice '平台配置已按校收敛：% 行派生能力，% 个启用的 tier 绑定', v_capabilities, v_tiers;
end $$;
