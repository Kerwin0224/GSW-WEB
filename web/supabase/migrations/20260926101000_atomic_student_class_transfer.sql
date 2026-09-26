-- 学生迁班：一次事务做完，取代应用层的「删旧关系 → 插新关系 → 改 projects → 改 conversations」。
--
-- 事故：那条四步序列每步都是独立请求，中途失败就是**部分成功**——
-- 最难看的形态是「旧班关系已删、新班关系没插上」：学生不属于任何班，
-- 他的历史项目 class_id 还指着旧班，而新班教师一条都看不到，且没有任何提示。
-- 批量 CSV 导入里同样的序列跑 200 次，失败点之后的每一行都停在这个半迁移态。
--
-- 修法：收成一个 RPC。单个函数调用就是一个事务，要么全成要么全不成。
-- 保持 security **invoker**：RLS 仍是防线，RPC 只负责把多步收敛成一步
-- （与 create_space / pull_class_into_space 同一口径，见 20260916152531 文件头）。
-- 因此它天然只能作用于调用者管得到的行——校 admin 迁本校学生，org_admin 迁本公司。
--
-- 返回被改动的行数（关系 + 项目 + 未删除的学生会话），调用方据此在失败信息里
-- 说清「已迁班并同步 N 条历史记录」，而不是报一句笼统的失败。

create or replace function public.transfer_student_to_class(
  p_profile_id uuid,
  p_class_id uuid
)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_touched integer := 0;
  v_count integer;
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

  delete from public.class_memberships
   where profile_id = p_profile_id and role = 'student';
  get diagnostics v_count = row_count;
  v_touched := v_touched + v_count;

  insert into public.class_memberships (class_id, profile_id, role)
  values (p_class_id, p_profile_id, 'student');
  v_touched := v_touched + 1;

  -- 迁班后同步历史项目和会话的 class_id，使新班教师可见所有历史核实记录。
  update public.projects set class_id = p_class_id where owner_id = p_profile_id;
  get diagnostics v_count = row_count;
  v_touched := v_touched + v_count;

  update public.conversations
     set class_id = p_class_id
   where owner_id = p_profile_id
     and source = 'student_chat'
     and deleted_at is null;
  get diagnostics v_count = row_count;
  v_touched := v_touched + v_count;

  return v_touched;
end;
$$;

grant execute on function public.transfer_student_to_class(uuid, uuid) to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from information_schema.routines
     where routine_schema = 'public' and routine_name = 'transfer_student_to_class'
  ) then
    raise exception 'transfer_student_to_class missing';
  end if;
  if not has_function_privilege('anon', 'public.transfer_student_to_class(uuid, uuid)'::regprocedure, 'execute') then
    raise exception 'anon (the app role) must be able to call transfer_student_to_class';
  end if;
  raise notice 'transfer_student_to_class 就位：迁班 = 一个事务';
end $$;
