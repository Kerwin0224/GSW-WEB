-- 空间增强：教师科目、空间视觉身份、按学生加入空间、会话绑定空间。

-- 1. 教师资料与空间元数据 -------------------------------------------------
alter table public.profiles
  add column if not exists subject text;

alter table public.spaces
  add column if not exists subject text,
  add column if not exists color_key text not null default 'pine';

update public.spaces s
   set subject = p.subject
  from public.profiles p
 where p.id = s.owner_id
   and s.subject is null
   and p.subject is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_subject_check'
  ) then
    alter table public.profiles
      add constraint profiles_subject_check
      check (subject is null or char_length(btrim(subject)) between 1 and 40);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.spaces'::regclass
       and conname = 'spaces_subject_check'
  ) then
    alter table public.spaces
      add constraint spaces_subject_check
      check (subject is null or char_length(btrim(subject)) between 1 and 40);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.spaces'::regclass
       and conname = 'spaces_color_key_check'
  ) then
    alter table public.spaces
      add constraint spaces_color_key_check
      check (color_key in ('ink', 'pine', 'cinnabar', 'moon', 'bamboo', 'plum'));
  end if;
end $$;

create index if not exists profiles_subject_idx
  on public.profiles (subject)
  where role = 'teacher' and subject is not null;

-- 2. 直接成员：班级派生成员仍保留，额外允许老师挑单个学生加入空间。
create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (space_id, student_id)
);

create index if not exists space_members_student_idx
  on public.space_members (student_id, space_id);

alter table public.space_members enable row level security;

create or replace function public.valid_space_member(p_space_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.spaces s
      join public.profiles p on p.id = p_student_id
     where s.id = p_space_id
       and s.status = 'active'
       and p.role = 'student'
       and p.status = 'active'
       and p.school_id is not distinct from s.school_id
  );
$$;

drop policy if exists "space_members_manage" on public.space_members;
create policy "space_members_manage" on public.space_members
for all
  using (public.can_manage_space(space_id))
  with check (
    public.can_manage_space(space_id)
    and public.valid_space_member(space_id, student_id)
  );

-- 让空间老师能读取直接成员的学生档案；普通成员仍走原有班级成员策略。
drop policy if exists "profiles_space_member_read" on public.profiles;
create policy "profiles_space_member_read" on public.profiles
for select
  using (
    exists (
      select 1
        from public.space_members sm
       where sm.student_id = profiles.id
         and public.can_manage_space(sm.space_id)
    )
  );

-- 3. 会话绑定空间 ---------------------------------------------------------
alter table public.conversations
  add column if not exists space_id uuid references public.spaces(id) on delete set null;

create index if not exists conversations_space_id_idx
  on public.conversations (space_id)
  where space_id is not null;

create or replace function public.validate_conversation_space_contract()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.space_id is not null then
    if tg_op = 'INSERT' then
      if new.source <> 'student_chat'
         or new.owner_id <> public.current_app_user_id()
         or not public.is_my_space(new.space_id)
      then
        raise exception 'conversation space is not accessible to its student owner'
          using errcode = '42501';
      end if;
    elsif new.space_id is distinct from old.space_id then
      if new.source <> 'student_chat'
         or new.owner_id <> public.current_app_user_id()
         or not public.is_my_space(new.space_id)
      then
        raise exception 'conversation space is not accessible to its student owner'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_validate_space_contract on public.conversations;
create trigger conversations_validate_space_contract
before insert or update on public.conversations
for each row execute function public.validate_conversation_space_contract();

-- 4. 更新空间可见性：班级派生成员 + 直接成员都生效。
create or replace function public.is_my_space(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.spaces s
     where s.id = p_space_id
       and s.status = 'active'
       and (
         exists (
           select 1
             from public.space_classes sc
             join public.classes c
               on c.id = sc.class_id
              and (c.school_id is null or c.school_id = s.school_id)
             join public.class_memberships cm
               on cm.class_id = sc.class_id
            where sc.space_id = s.id
              and cm.profile_id = public.current_app_user_id()
              and cm.role = 'student'
              and exists (
                select 1
                  from public.class_memberships mt
                 where mt.class_id = sc.class_id
                   and mt.profile_id = s.owner_id
                   and mt.role = 'teacher'
              )
         )
         or exists (
           select 1
             from public.space_members sm
             join public.profiles owner
               on owner.id = s.owner_id
              and owner.role = 'teacher'
              and owner.status = 'active'
              and owner.school_id is not distinct from s.school_id
            where sm.space_id = s.id
              and sm.student_id = public.current_app_user_id()
         )
       )
  );
$$;

-- 5. 教师可设置自己的科目；空字符串表示清除科目。
create or replace function public.update_own_subject(p_subject text)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_subject text;
begin
  if v_user_id is null or public.current_profile_role() is distinct from 'teacher' then
    raise exception 'only an active teacher can update subject' using errcode = '42501';
  end if;

  v_subject := nullif(btrim(coalesce(p_subject, '')), '');
  if v_subject is not null and char_length(v_subject) > 40 then
    raise exception 'subject is too long' using errcode = '22023';
  end if;

  update public.profiles
     set subject = v_subject
   where id = v_user_id
     and role = 'teacher'
     and status = 'active'
  returning subject into v_subject;

  if not found then
    raise exception 'teacher profile not found' using errcode = '42501';
  end if;
  return v_subject;
end;
$$;

revoke all on function public.valid_space_member(uuid, uuid) from public, authenticated;
grant execute on function public.valid_space_member(uuid, uuid) to anon, service_role;
revoke all on function public.update_own_subject(text) from public, authenticated;
grant execute on function public.update_own_subject(text) to anon, service_role;

-- 6. 新建空间时直接写入科目和颜色；旧的 3 参数 RPC 保留兼容。
create or replace function public.create_space_v2(
  p_name text,
  p_theme text,
  p_class_id uuid default null,
  p_subject text default null,
  p_color_key text default 'pine'
) returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_theme text := nullif(btrim(coalesce(p_theme, '')), '');
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_color_key text := coalesce(nullif(btrim(coalesce(p_color_key, '')), ''), 'pine');
  v_space_id uuid;
begin
  if v_name = '' then
    raise exception 'space name cannot be empty' using errcode = '22023';
  end if;
  if public.current_profile_role() is distinct from 'teacher' then
    raise exception 'only a teacher can create a space' using errcode = '42501';
  end if;
  if public.current_school_id() is null then
    raise exception 'teacher has no school; a space must belong to a school' using errcode = '42501';
  end if;
  if v_subject is not null and char_length(v_subject) > 40 then
    raise exception 'space subject is too long' using errcode = '22023';
  end if;
  if v_color_key not in ('ink', 'pine', 'cinnabar', 'moon', 'bamboo', 'plum') then
    raise exception 'invalid space color' using errcode = '22023';
  end if;

  select id into v_space_id
    from public.spaces
   where owner_id = public.current_app_user_id()
     and name = v_name
     and status = 'active';

  if v_space_id is null then
    insert into public.spaces (school_id, owner_id, name, theme, subject, color_key)
    values (public.current_school_id(), public.current_app_user_id(), v_name, coalesce(v_theme, ''), v_subject, v_color_key)
    returning id into v_space_id;
  else
    update public.spaces
       set theme = coalesce(v_theme, theme),
           subject = coalesce(v_subject, subject),
           color_key = v_color_key
     where id = v_space_id;
  end if;

  if p_class_id is not null then
    perform public.pull_class_into_space(v_space_id, p_class_id);
  end if;
  return v_space_id;
end;
$$;

grant execute on function public.create_space_v2(text, text, uuid, text, text) to anon, authenticated, service_role;

-- 7. 结构自检 ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'subject') then
    raise exception 'profiles.subject missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'spaces' and column_name = 'color_key') then
    raise exception 'spaces.color_key missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'conversations' and column_name = 'space_id') then
    raise exception 'conversations.space_id missing';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'space_members' and table_type = 'BASE TABLE') then
    raise exception 'space_members table missing';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'space_members' and policyname = 'space_members_manage') then
    raise exception 'space_members_manage policy missing';
  end if;
  raise notice 'space subject/color/direct members/conversation binding ready';
end $$;
