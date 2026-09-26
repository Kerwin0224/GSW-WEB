-- ═══════════════════════════════════════════════════════════════════════════
-- 修策略递归：42P17 infinite recursion detected in policy
-- ═══════════════════════════════════════════════════════════════════════════
-- 现场报错（本仓最贵的一类坑，求值期才炸，迁移与 CI 全绿）：
--   ERROR: 42P17: infinite recursion detected in policy for relation "space_collaborators"
--
-- 成因不是函数，是**策略里的裸子查询**。RLS 策略以调用者身份求值，策略表达式里写
--   or public.can_admin_school_scope((select sc.school_id from public.spaces sc where ...))
-- 时，内层那个 select 读的是带 RLS 的 spaces，spaces 的策略又含
--   or exists (select 1 from public.space_collaborators sc where sc.space_id = id ...)
-- 于是 space_collaborators → spaces → space_collaborators 闭环。
--
-- 为什么同文件的 public.teacher_can_access_space() 不会：它带 SECURITY DEFINER 且
-- 属主是 postgres，函数体内的查询不走调用者的 RLS。**安全的做法是把子查询搬进
-- definer 函数，而不是把函数搬出策略**——前者是既有约定，后者会漏。

create or replace function public.space_school_id(p_space_id uuid)
returns uuid
language sql stable security definer
set search_path to 'public'
as $$
  select s.school_id from public.spaces s where s.id = p_space_id
$$;

grant execute on function public.space_school_id(uuid) to anon, authenticated, service_role;

create or replace function public.is_space_member(p_space_id uuid, p_profile_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.space_members sm
     where sm.space_id = p_space_id and sm.student_id = p_profile_id
  )
$$;

grant execute on function public.is_space_member(uuid, uuid) to anon, authenticated, service_role;

-- 协作边的读：全部改走 definer 函数，策略里不再有裸子查询
drop policy if exists "space_collaborators_self_read" on public.space_collaborators;
drop policy if exists "space_collaborators_read" on public.space_collaborators;
create policy "space_collaborators_read" on public.space_collaborators for select
  using (
    profile_id = public.current_app_user_id()
    or public.teacher_can_access_space(space_id)
    or public.can_manage_space(space_id)
    or public.can_admin_school_scope(public.space_school_id(space_id))
  );

-- 层级表的读：成员判定同样搬进 definer
drop policy if exists "rubric_levels_read" on public.rubric_levels;
create policy "rubric_levels_read" on public.rubric_levels for select
  using (
    (school_id is null and space_id is null)
    or (school_id is not null and (
          school_id = public.current_school_id()
          or public.can_admin_school_scope(school_id)))
    or (space_id is not null and (
          public.teacher_can_access_space(space_id)
          or public.is_space_member(space_id, public.current_app_user_id())))
  );

do $$
begin
  -- 再犯的检测点写进迁移本身：策略表达式里出现裸的 exists/select 就是闭环的开始。
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and policyname in ('space_collaborators_read', 'rubric_levels_read')
       and qual ~ '(?is)exists\s*\(\s*select'
  ) then
    raise exception 'policy still contains a bare subquery — that is the recursion source';
  end if;
  raise notice '策略递归已断开：子查询全部移入 SECURITY DEFINER 函数';
end $$;
