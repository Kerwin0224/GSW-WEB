-- ═══════════════════════════════════════════════════════════════════════════
-- 组内学情：能力位授权范围内的核实聚合
-- ═══════════════════════════════════════════════════════════════════════════
-- 教师端此前只有「我任教班级的核实队列」这一条视线。年级组长要看全年级核实完成率、
-- 教研组长要看同组老师的核实质量、备课组长要看谁长期不核实，都没有入口。
--
-- 为什么用 definer RPC 而不是直接查：RLS 下教师读不到同事的会话正文，
-- 而「组内学情」需要的是**计数**不是原文。这里只在函数内按 role_grants 校验授权，
-- 对外只返回聚合数字——不给原文这条边界不能松，松了就是教师互相看学生对话。
-- 教师看学生对话的路径仍然只有「自己带的班级 / 自己拥有的空间」那两条。

create or replace function public.team_review_summary()
returns table (
  scope_type text,
  scope_id uuid,
  scope_label text,
  teacher_count bigint,
  student_count bigint,
  pending_count bigint,
  finalized_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  return query
    with granted as (
      select g.scope_type, g.scope_id
        from public.role_grants g
       where g.profile_id = public.current_app_user_id()
         and g.capability = 'review_team'
         and g.scope_type in ('class', 'space')
    ),
    labelled as (
      select g.scope_type, g.scope_id,
             case when g.scope_type = 'class' then c.name else s.name end as label
        from granted g
        left join public.classes c on g.scope_type = 'class' and c.id = g.scope_id
        left join public.spaces s on g.scope_type = 'space' and s.id = g.scope_id
    ),
    members as (
      -- 教学单元的教师
      select l.scope_type, l.scope_id, l.label, cm.profile_id
        from labelled l
        join public.class_memberships cm on l.scope_type = 'class' and cm.class_id = l.scope_id
       where cm.role = 'teacher'
      union all
      -- 空间的协作者与 owner
      select l.scope_type, l.scope_id, l.label, sc.profile_id
        from labelled l
        join public.space_collaborators sc on l.scope_type = 'space' and sc.space_id = l.scope_id
    ),
    unit_conversations as (
      select l.scope_type, l.scope_id,
             c.id, coalesce(c.finalized_at is not null, false) as is_finalized,
             c.owner_id
        from labelled l
        join public.conversations c
          on (l.scope_type = 'class' and c.class_id = l.scope_id)
          or (l.scope_type = 'space' and c.space_id = l.scope_id)
       where c.source = 'student_chat'
         and c.deleted_at is null
         and c.project_id is not null
    )
    select l.scope_type,
           l.scope_id,
           l.label,
           (select count(distinct m.profile_id) from members m
             where m.scope_type = l.scope_type and m.scope_id = l.scope_id),
           (select count(distinct u.owner_id) from unit_conversations u
             where u.scope_type = l.scope_type and u.scope_id = l.scope_id),
           (select count(*) from unit_conversations u
             where u.scope_type = l.scope_type and u.scope_id = l.scope_id and not u.is_finalized),
           (select count(*) from unit_conversations u
             where u.scope_type = l.scope_type and u.scope_id = l.scope_id and u.is_finalized)
      from labelled l
     order by l.label nulls last;
end;
$$;

grant execute on function public.team_review_summary() to anon, authenticated, service_role;

do $$
begin
  -- 授权校验在函数体内，不靠调用方先查一遍 role_grants。
  -- 调用方若漏掉那一步，这里会直接把别人教学单元的计数吐出去。
  if not exists (
    select 1 from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'team_review_summary'
  ) then
    raise exception 'team_review_summary missing';
  end if;
  raise notice '组内学情聚合函数就位';
end $$;
