-- 区分老师默认的学期空间与阶段性专题空间。
alter table public.spaces
  add column if not exists space_kind text not null default 'term';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.spaces'::regclass
       and conname = 'spaces_kind_check'
  ) then
    alter table public.spaces
      add constraint spaces_kind_check check (space_kind in ('term', 'topic'));
  end if;
end $$;

create index if not exists spaces_kind_idx
  on public.spaces (owner_id, space_kind, created_at)
  where status = 'active';

-- 新版建空间入口保留旧 RPC，新增带类型参数的 v3。
create or replace function public.create_space_v3(
  p_name text,
  p_theme text,
  p_class_id uuid default null,
  p_subject text default null,
  p_color_key text default 'pine',
  p_space_kind text default 'term'
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
  v_space_kind text := coalesce(nullif(btrim(coalesce(p_space_kind, '')), ''), 'term');
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
  if v_space_kind not in ('term', 'topic') then
    raise exception 'invalid space kind' using errcode = '22023';
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
    insert into public.spaces (school_id, owner_id, name, theme, subject, color_key, space_kind)
    values (public.current_school_id(), public.current_app_user_id(), v_name, coalesce(v_theme, ''), v_subject, v_color_key, v_space_kind)
    returning id into v_space_id;
  else
    update public.spaces
       set theme = coalesce(v_theme, theme),
           subject = coalesce(v_subject, subject),
           color_key = v_color_key,
           space_kind = v_space_kind
     where id = v_space_id;
  end if;

  if p_class_id is not null then
    perform public.pull_class_into_space(v_space_id, p_class_id);
  end if;
  return v_space_id;
end;
$$;

grant execute on function public.create_space_v3(text, text, uuid, text, text, text) to anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'spaces' and column_name = 'space_kind') then
    raise exception 'spaces.space_kind missing';
  end if;
end $$;
