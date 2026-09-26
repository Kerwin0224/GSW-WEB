-- ═══════════════════════════════════════════════════════════════════════════
-- 一个学生可以同时属于多个教学单元
-- ═══════════════════════════════════════════════════════════════════════════
-- 旧模型：class_memberships_one_student_class_idx 让一个学生全局只能有一个
-- 行政班。走读生、跨年级选课、机构里「小班课 + 一对一」并行的学生，插入第二个
-- 班级关系直接撞 23505 —— 通用教育 SaaS 最常见的组织形态在这套 schema 里不存在。
--
-- 改法：主班唯一（部分唯一索引），其余班级关系允许并存。
-- transfer_student_to_class 保持原语义不动（迁班 = 离开旧班 + 全部历史归新班，
-- CONTEXT.md 的产品决策），这里只补上「加入第二个班」这条缺失的路径。

alter table public.class_memberships
  add column if not exists is_primary boolean not null default true;

drop index if exists public.class_memberships_one_student_class_idx;

-- 防御历史脏行：若库里已有同学生多行，只保留最早一行为主班。
-- uuid 没有 min()/max() 聚合，取「最早一行」要写成 order by + limit 1。
update public.class_memberships cm
   set is_primary = false
 where cm.role = 'student'
   and cm.is_primary
   and cm.id <> (
     select m.id
       from public.class_memberships m
      where m.profile_id = cm.profile_id
        and m.role = 'student'
      order by m.created_at, m.id
      limit 1
   );

create unique index if not exists class_memberships_primary_student_idx
  on public.class_memberships (profile_id)
  where role = 'student' and is_primary;

-- ── 项目归属：取主班，不再随机 limit 1 ───────────────────────────────────
-- 多重班级下 `limit 1` 会随机命中一个班，项目的 class_id 变得不可预测。改为
-- 优先主班；学生没有行政班时 class_id 留空（1v1、成人、跨校教研），
-- 不再抛 42501 —— 无班级是合法形态，不是数据错误。
create or replace function public.sync_project_contract() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare owner_role text; membership_class_id uuid;
begin
  new.name = trim(new.name);
  new.subtitle = nullif(trim(coalesce(new.subtitle, '')), '');
  if new.name = '' then raise exception 'project name cannot be empty'; end if;
  if new.name in ('自动识别中的篇目','未定篇目','待自动归属','待归属篇目','未知篇目','未识别篇目','默认篇目','示例篇目','篇目标题','篇目项目','日常会话归档','附件会话') then raise exception 'placeholder name % cannot be persisted as a project', new.name; end if;
  select p.role into owner_role from public.profiles p where p.id = new.owner_id;
  if owner_role is distinct from 'student' then raise exception 'project owner % must be a student profile', new.owner_id; end if;

  select cm.class_id into membership_class_id
    from public.class_memberships cm
   where cm.profile_id = new.owner_id
     and cm.role = 'student'::public.app_role
   order by cm.is_primary desc, cm.created_at, cm.id
   limit 1;

  if new.class_id is null then
    new.class_id = membership_class_id;
  elsif membership_class_id is not null
        and new.class_id <> membership_class_id
        and not exists (
          select 1 from public.class_memberships cm2
           where cm2.profile_id = new.owner_id
             and cm2.class_id = new.class_id
             and cm2.role = 'student'::public.app_role
        ) then
    raise exception 'project class % is not one of student % memberships', new.class_id, new.owner_id;
  end if;
  return new;
end $$;

-- ── 增量加入班级：不删旧关系，不改历史 ─────────────────────────────────────
-- 与 transfer_student_to_class 的区别就是「不动历史」。走班、选课、
-- 「行政班 + 一对一」并行都走这里。
create or replace function public.add_class_membership(
  p_profile_id uuid,
  p_class_id uuid,
  p_is_primary boolean default false
)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_touched integer := 0;
begin
  if p_profile_id is null or p_class_id is null then
    raise exception 'profile and class are required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = p_profile_id and p.role = 'student' and p.status = 'active'
  ) then
    raise exception 'target % is not an active student profile', p_profile_id using errcode = '42501';
  end if;

  if not exists (select 1 from public.classes c where c.id = p_class_id) then
    raise exception 'class % does not exist', p_class_id using errcode = '42501';
  end if;

  -- 已是该班成员则只调整主班标记，重复调用不报错。
  if exists (
    select 1 from public.class_memberships
     where profile_id = p_profile_id and class_id = p_class_id and role = 'student'
  ) then
    if p_is_primary then
      update public.class_memberships set is_primary = false
       where profile_id = p_profile_id and role = 'student' and is_primary;
      update public.class_memberships set is_primary = true
       where profile_id = p_profile_id and class_id = p_class_id and role = 'student';
      return 2;
    end if;
    return 0;
  end if;

  -- 提升为主班时，先撤掉原主班（部分唯一索引不允许两个主班）。
  if p_is_primary then
    update public.class_memberships set is_primary = false
     where profile_id = p_profile_id and role = 'student' and is_primary;
  end if;

  insert into public.class_memberships (class_id, profile_id, role, is_primary)
  values (p_class_id, p_profile_id, 'student', p_is_primary);

  return 1;
end;
$$;

grant execute on function public.add_class_membership(uuid, uuid, boolean) to anon, authenticated, service_role;

-- 移除单个班级关系（不再是「移出即清空全部」）。
create or replace function public.remove_class_membership(
  p_profile_id uuid,
  p_class_id uuid
)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare v_count integer;
begin
  delete from public.class_memberships
   where profile_id = p_profile_id
     and class_id = p_class_id
     and role = 'student';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.remove_class_membership(uuid, uuid) to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'class_memberships' and column_name = 'is_primary'
  ) then
    raise exception 'class_memberships.is_primary missing';
  end if;
  if to_regclass('public.class_memberships_one_student_class_idx') is not null then
    raise exception 'the one-student-one-class unique index must be dropped';
  end if;
  if not has_function_privilege('anon', 'public.add_class_membership(uuid, uuid, boolean)'::regprocedure, 'execute') then
    raise exception 'anon (the app role) must be able to call add_class_membership';
  end if;
  raise notice '多重班级归属就位：主班唯一，其余班级关系可并存';
end $$;
