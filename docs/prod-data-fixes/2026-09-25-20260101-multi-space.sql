-- 为 20260101 演示学生补齐多空间体验：
--   沈立行（20240002，语文）→ 语文空间，派生高一(1)班
--   顾清晏（20180001，数学）→ 数学空间，派生高一(2)班，并直接加入 20260101
-- 脚本可重复执行；任何约束/RLS/触发器错误都会让事务整体回滚。
begin;

update public.profiles
   set subject = case login_id
     when '20240002' then '语文'
     when '20180001' then '数学'
   end
 where login_id in ('20240002', '20180001')
   and role = 'teacher'
   and status = 'active';

insert into public.spaces (school_id, owner_id, name, theme, subject, color_key)
select p.school_id,
       p.id,
       seed.name,
       seed.theme,
       seed.subject,
       seed.color_key
from (values
  ('20240002', '语文·篇目空间', '语文按学生实际在学的篇目归类：问题聚焦哪一篇就归到那篇；问知识点（虚词、句式、修辞）时归到知识点名称。', '语文', 'cinnabar'),
  ('20180001', '数学·知识点空间', '数学按知识点归类，例如一次函数、全等三角形；综合题归到最主要的那个知识点。', '数学', 'pine')
) as seed(owner_login, name, theme, subject, color_key)
join public.profiles p on p.login_id = seed.owner_login
where p.role = 'teacher'
  and p.status = 'active'
  and not exists (
    select 1
    from public.spaces existing
    where existing.owner_id = p.id
      and existing.school_id = p.school_id
      and existing.name = seed.name
      and existing.status = 'active'
  );

insert into public.space_classes (space_id, class_id, created_by)
select s.id, c.id, s.owner_id
from public.spaces s
join public.profiles teacher on teacher.id = s.owner_id
join public.classes c
  on c.school_id = s.school_id
 and c.name = case teacher.login_id
   when '20240002' then '高一(1)班'
   when '20180001' then '高一(2)班'
 end
where s.status = 'active'
  and s.name in ('语文·篇目空间', '数学·知识点空间')
  and teacher.login_id in ('20240002', '20180001')
on conflict (space_id, class_id) do nothing;

insert into public.space_members (space_id, student_id, created_by)
select s.id, student.id, s.owner_id
from public.spaces s
join public.profiles student on student.login_id = '20260101'
where s.status = 'active'
  and s.name = '数学·知识点空间'
on conflict (space_id, student_id) do nothing;

commit;

select
  s.name,
  s.subject,
  s.color_key,
  teacher.display_name as teacher,
  coalesce(string_agg(distinct c.name, '、' order by c.name), '未拉班') as classes,
  (select count(*) from public.space_members sm where sm.space_id = s.id and sm.student_id = (select id from public.profiles where login_id = '20260101')) as target_direct
from public.spaces s
join public.profiles teacher on teacher.id = s.owner_id
left join public.space_classes sc on sc.space_id = s.id
left join public.classes c on c.id = sc.class_id
where s.name in ('语文·篇目空间', '数学·知识点空间')
  and s.status = 'active'
group by s.id, s.name, s.subject, s.color_key, teacher.display_name
order by s.name;
