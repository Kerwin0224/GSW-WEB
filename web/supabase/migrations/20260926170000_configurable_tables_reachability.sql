-- ═══════════════════════════════════════════════════════════════════════════
-- 配置表读策略与档位绑定：让「租户可配置」真的可配置
-- ═══════════════════════════════════════════════════════════════════════════
-- 上一批把评价维度、评价层级、科目词表、空间协作者进表，但几条 SELECT 策略
-- 写漏了。这类漏法的共同点是**静默**：RLS 过滤成空集，页面显示「没有数据」，
-- 应用层走进降级分支继续用旧口径，租户在界面上配了却一点没生效，也没有任何提示。
--
-- 1. rubric_levels_read 三路条件全部要求 school_id 或 space_id 非空，
--    平台默认那六行（两者皆空）对任何客户端都读不到——库里那份是死的；
--    且学校级行只有管理员能读，教师读自己学校的层级也拿不到。
-- 2. review_dimensions_read 写成 `school_id is null or can_admin_school_scope(school_id)`，
--    而 AI 预审是以**教师**身份跑的。教师查本校维度被判空 → loadReviewDimensions
--    降级 → 继续用那句写死的 bullet。
-- 3. subjects_read 只放行管理员，教师打开科目词表下拉被过滤成空集，
--    只能退回「自己空间里已用的科目」——「同一科目不再因写法不同长出两个空间」
--    这条承诺对教师侧失效。
-- 4. space_collaborators 没给协作者本人读策略，协作边是「两位老师共带一班」
--    这个场景的全部信息载体，读不到等于功能不存在。
-- 5. save_scenario_tier_bindings_and_sync 只接受 provider_capability 里的 7 个键，
--    往 teaching_scenarios 新插一个场景在矩阵里能显示但改不了档位绑定——
--    「加一种教学形态不必发明一个模型能力」只做了一半。

-- ── 1. 维度表：平台默认与本校行对本校所有账号可读 ──────────────────────
-- 写侧仍只给管理员：维度是租户的教学承诺，不该由教师随手改。
drop policy if exists "review_dimensions_read" on public.review_dimensions;
create policy "review_dimensions_read" on public.review_dimensions for select
  using (
    school_id is null
    or school_id = public.current_school_id()
    or public.can_admin_school_scope(school_id)
  );

-- ── 2. 层级表：三层各自放行 ────────────────────────────────────────────
--   平台默认（两者皆空） → 所有已登录账号
--   学校级              → 本校所有账号
--   空间级              → 空间 owner / 协作者 / 学生成员
drop policy if exists "rubric_levels_read" on public.rubric_levels;
create policy "rubric_levels_read" on public.rubric_levels for select
  using (
    (school_id is null and space_id is null)
    or (school_id is not null and (
          school_id = public.current_school_id()
          or public.can_admin_school_scope(school_id)))
    or (space_id is not null and (
          public.teacher_can_access_space(space_id)
          or exists (select 1 from public.space_members sm
                      where sm.space_id = rubric_levels.space_id
                        and sm.student_id = public.current_app_user_id())))
  );

-- ── 3. 科目词表与空间协作者、空间成员 ──────────────────────────────────
-- 词表：读放开给本校所有账号；写仍只给管理员。
drop policy if exists "subjects_read" on public.subjects;
create policy "subjects_read" on public.subjects for select
  using (
    school_id = public.current_school_id()
    or public.can_admin_school_scope(school_id)
  );

drop policy if exists "space_collaborators_self_read" on public.space_collaborators;
create policy "space_collaborators_self_read" on public.space_collaborators for select
  using (
    profile_id = public.current_app_user_id()
    or public.teacher_can_access_space(space_id)
    or public.can_admin_school_scope(
         (select sc.school_id from public.spaces sc where sc.id = space_collaborators.space_id))
  );

drop policy if exists "space_collaborators_admin_write" on public.space_collaborators;
create policy "space_collaborators_admin_write" on public.space_collaborators for all
  using (public.teacher_can_access_space(space_id) or public.is_admin())
  with check (public.teacher_can_access_space(space_id) or public.is_admin());

drop policy if exists "space_members_teacher_read" on public.space_members;
create policy "space_members_teacher_read" on public.space_members for select
  using (public.teacher_can_access_space(space_id));

-- ── 4. 档位绑定接受任意教学场景 ────────────────────────────────────────
-- scenario 列是 provider_capability 枚举且 NOT NULL，保留它做兼容；
-- 真正生效的是 scenario_key。键不在 teaching_scenarios 里就拒——
-- 一条拼错的 key 静默写进表里、路由回落默认档位，没人会发现。
create or replace function public.save_scenario_tier_bindings_and_sync(p_bindings jsonb)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  binding record;
  v_enum_value public.provider_capability;
begin
  if not public.is_org_admin() then
    raise exception 'org admin role required' using errcode = '42501';
  end if;

  select e.enumlabel::public.provider_capability into v_enum_value
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'provider_capability'
   order by e.enumsortorder
   limit 1;
  if v_enum_value is null then
    raise exception 'provider_capability enum is empty' using errcode = '55000';
  end if;

  for binding in
    select * from jsonb_to_recordset(p_bindings) as input(scenario text, tier text)
  loop
    if not exists (select 1 from public.teaching_scenarios s where s.key = binding.scenario) then
      raise exception 'unknown teaching scenario: %', binding.scenario using errcode = '22023';
    end if;
    if binding.tier not in ('flash','advanced') then
      raise exception 'unsupported tier: %', binding.tier using errcode = '22023';
    end if;

    -- 旧枚举只覆盖 7 个能力键。场景与能力解耦后，新增场景在这里用
    -- 字典序最小的真实能力值占位，让 NOT NULL 约束继续成立；
    -- 生效的是 scenario_key。
    insert into public.scenario_tier_bindings (scenario, scenario_key, tier, is_enabled, metadata)
    values (v_enum_value, binding.scenario, binding.tier, true,
            jsonb_build_object('synced_from', 'admin_scenario_mapping'))
    on conflict (scenario_key) do update set
      tier = excluded.tier,
      is_enabled = true,
      metadata = excluded.metadata;
  end loop;

  perform public.rebuild_scenario_provider_capabilities();
end;
$$;

-- 一行一个场景的真正唯一约束。旧代码用 on conflict (scenario)，
-- 而 scenario 列存的是占位枚举值——多场景会互相覆盖。
delete from public.scenario_tier_bindings where scenario_key is not null;

alter table public.scenario_tier_bindings
  add constraint scenario_tier_bindings_scenario_key_uniq unique (scenario_key)
  where scenario_key is not null;

-- 旧行（scenario_key 为 NULL）按枚举值回填一次，保持原行为
update public.scenario_tier_bindings
   set scenario_key = scenario::text
 where scenario_key is null
   and scenario::text in (select key from public.teaching_scenarios);

do $$
declare
  v_p text;
begin
  if (select count(*) from public.rubric_levels where school_id is null and space_id is null) <> 6 then
    raise exception 'platform rubric levels must remain exactly 6';
  end if;
  if (select count(*) from public.review_dimensions where school_id is null) <> 6 then
    raise exception 'platform review dimensions must remain exactly 6';
  end if;
  for v_p in array['review_dimensions_read', 'rubric_levels_read', 'subjects_read',
                    'space_collaborators_self_read', 'space_members_teacher_read'] loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and policyname = v_p
    ) then
      raise exception 'policy % missing', v_p;
    end if;
  end loop;
  raise notice '配置表读策略与档位绑定已修正';
end $$;
