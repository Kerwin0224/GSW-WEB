-- 空间成为学生学习数据的一级作用域：空间 → 项目 → 会话。
-- 旧数据按学生可见的第一个活跃空间回填；没有可见空间的数据保留 space_id=null，
-- 由界面明确归入“未归类”，不静默混入任意空间。

alter table public.projects
  add column if not exists space_id uuid references public.spaces(id) on delete set null;

create index if not exists projects_space_id_idx
  on public.projects (space_id)
  where space_id is not null;

drop index if exists public.projects_owner_name_normalized_key;
create unique index if not exists projects_owner_space_name_normalized_key
  on public.projects (owner_id, coalesce(space_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(both from name)));

-- 先替换旧触发器：回填由 postgres 执行，旧触发器会把维护身份误判成越权。
create or replace function public.validate_conversation_space_contract()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_project_space uuid;
begin
  if new.source = 'student_chat' and new.project_id is not null then
    select p.space_id into v_project_space
      from public.projects p
     where p.id = new.project_id;
    if v_project_space is not null then
      if new.space_id is null then
        new.space_id := v_project_space;
      elsif new.space_id is distinct from v_project_space then
        raise exception 'conversation space % must match project space %', new.space_id, v_project_space
          using errcode = '42501';
      end if;
    end if;
  end if;

  if new.space_id is not null
     and public.current_app_user_id() is not null
     and (
       new.source <> 'student_chat'
       or new.owner_id <> public.current_app_user_id()
       or not public.is_my_space(new.space_id)
     ) then
    raise exception 'conversation space is not accessible to its student owner'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


-- 项目回填：优先直接成员空间，其次班级派生空间，最后按创建时间取第一个。
with candidate as (
  select p.id,
         (
           select s.id
             from public.spaces s
             join public.profiles owner on owner.id = s.owner_id
            where s.status = 'active'
              and owner.school_id = student.school_id
              and (
                exists (
                  select 1
                    from public.space_members sm
                   where sm.space_id = s.id
                     and sm.student_id = p.owner_id
                )
                or exists (
                  select 1
                    from public.space_classes sc
                    join public.class_memberships cm
                      on cm.class_id = sc.class_id
                     and cm.profile_id = p.owner_id
                     and cm.role = 'student'
                    join public.class_memberships mt
                      on mt.class_id = sc.class_id
                     and mt.profile_id = s.owner_id
                     and mt.role = 'teacher'
                   where sc.space_id = s.id
                )
              )
            order by s.created_at asc, s.id
            limit 1
         ) as space_id
    from public.projects p
    join public.profiles student on student.id = p.owner_id
   where p.space_id is null
     and student.role = 'student'
)
update public.projects p
   set space_id = candidate.space_id
  from candidate
 where p.id = candidate.id
   and candidate.space_id is not null;

-- 项目会话继承项目空间。
update public.conversations c
   set space_id = p.space_id
  from public.projects p
 where c.project_id = p.id
   and c.source = 'student_chat'
   and c.space_id is null
   and p.space_id is not null;

-- 未归项目会话也回填到学生可见的第一个空间；没有空间的学生仍保留 null。
with candidate as (
  select c.id,
         (
           select s.id
             from public.spaces s
             join public.profiles owner on owner.id = s.owner_id
            where s.status = 'active'
              and owner.school_id = student.school_id
              and (
                exists (
                  select 1
                    from public.space_members sm
                   where sm.space_id = s.id
                     and sm.student_id = c.owner_id
                )
                or exists (
                  select 1
                    from public.space_classes sc
                    join public.class_memberships cm
                      on cm.class_id = sc.class_id
                     and cm.profile_id = c.owner_id
                     and cm.role = 'student'
                    join public.class_memberships mt
                      on mt.class_id = sc.class_id
                     and mt.profile_id = s.owner_id
                     and mt.role = 'teacher'
                   where sc.space_id = s.id
                )
              )
            order by s.created_at asc, s.id
            limit 1
         ) as space_id
    from public.conversations c
    join public.profiles student on student.id = c.owner_id
   where c.source = 'student_chat'
     and c.project_id is null
     and c.space_id is null
     and student.role = 'student'
)
update public.conversations c
   set space_id = candidate.space_id
  from candidate
 where c.id = candidate.id
   and candidate.space_id is not null;

-- 新项目写入时，空间必须属于项目学生的学校；应用身份还要确实可见。
create or replace function public.validate_project_space_contract()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_space_school uuid;
  v_owner_school uuid;
begin
  if new.space_id is not null then
    select s.school_id into v_space_school
      from public.spaces s
     where s.id = new.space_id
       and s.status = 'active';
    select p.school_id into v_owner_school
      from public.profiles p
     where p.id = new.owner_id;
    if v_space_school is null or v_owner_school is distinct from v_space_school then
      raise exception 'project space % is not in the owner school', new.space_id
        using errcode = '42501';
    end if;
    if public.current_app_user_id() is not null
       and not public.is_my_space(new.space_id) then
      raise exception 'project space % is not accessible to the owner', new.space_id
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_validate_space_contract on public.projects;
create trigger projects_validate_space_contract
before insert or update of space_id on public.projects
for each row execute function public.validate_project_space_contract();


drop trigger if exists conversations_validate_space_contract on public.conversations;
create trigger conversations_validate_space_contract
before insert or update on public.conversations
for each row execute function public.validate_conversation_space_contract();
