-- ═══════════════════════════════════════════════════════════════════════════
-- 学习实体的租户锚点：班级 → 学校 + 空间
-- ═══════════════════════════════════════════════════════════════════════════
-- 旧模型的 RLS 租户锚点事实上是 school_id + class_id **两列的组合**，缺任何一列
-- 就失明：无行政班的学生（1v1、成人、跨校教研、机构小班）conversations.class_id
-- 为 NULL → can_admin_class 判否 → 学生会话对全部管理员**静默过滤成空集**，
-- 页面显示「暂无记录」而不是报错。audit_records.class_id 更是 NOT NULL，导致
-- 这类学生根本无法产生任何一条核实记录。
--
-- 改法：四张学习实体各自带 school_id（租户锚点）与 space_id（教学作用域），
-- class_id 降级为可选的分组维度。管理员按学校收敛，教师按「任教班级 ∪ 空间归属」收敛。
-- 详见 CONTEXT.md「学习记录的作用域」。

-- ── 1. 加列 ────────────────────────────────────────────────────────────────
alter table public.conversations   add column if not exists school_id uuid references public.schools(id);
alter table public.projects        add column if not exists school_id uuid references public.schools(id);
alter table public.practice_records add column if not exists school_id uuid references public.schools(id);
alter table public.practice_records add column if not exists class_id  uuid references public.classes(id);
alter table public.practice_records add column if not exists space_id  uuid references public.spaces(id);
alter table public.audit_records    add column if not exists school_id uuid references public.schools(id);
alter table public.audit_records    add column if not exists space_id  uuid references public.spaces(id);

create index if not exists conversations_school_idx   on public.conversations (school_id, updated_at desc);
create index if not exists projects_school_idx        on public.projects (school_id);
create index if not exists practice_records_school_idx on public.practice_records (school_id);
create index if not exists audit_records_school_idx    on public.audit_records (school_id);

-- ── 2. 写入时推导，保证任何路径产生的行都带锚点 ──────────────────────────────
-- 顺序无关紧要：audit_records 走 source_message_id 回查会话，因此即使本触发器
-- 先于 validate_audit_record_contract 触发也拿得到锚点。
create or replace function public.sync_learning_school_scope() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_school uuid;
  v_space  uuid;
  v_class  uuid;
  v_owner  uuid;
begin
  if tg_table_name = 'projects' then
    v_space := new.space_id;
    v_class := new.class_id;
    v_owner := new.owner_id;

  elsif tg_table_name = 'conversations' then
    select p.space_id, p.class_id into v_space, v_class
      from public.projects p where p.id = new.project_id;
    v_space := coalesce(v_space, new.space_id);
    v_class := coalesce(v_class, new.class_id);
    v_owner := new.owner_id;

  elsif tg_table_name = 'practice_records' then
    select p.space_id, p.class_id into v_space, v_class
      from public.projects p where p.id = new.project_id;
    v_owner := new.student_id;

  else -- audit_records：锚点属于学生，不属于审计人
    select c.school_id, c.space_id, c.class_id, c.owner_id
      into v_school, v_space, v_class, v_owner
      from public.conversations c
     where c.id = coalesce(
             new.source_conversation_id,
             (select m.conversation_id from public.conversation_messages m
               where m.id = new.source_message_id));
  end if;

  if new.space_id is null then new.space_id := v_space; end if;

  new.school_id := coalesce(
    new.school_id,
    v_school,
    (select c.school_id from public.classes c where c.id = v_class),
    (select s.school_id from public.spaces s where s.id = new.space_id),
    (select p.school_id from public.profiles p where p.id = v_owner)
  );

  return new;
end $$;

-- 本函数是零校验的 definer 触发器函数：给它 anon 可执行等于开一个能改任意行
-- school_id 的面。触发器由 PG 直接调用，不看调用者 EXECUTE，所以这里可以收回
-- （与 20260916160943 建立的约定一致）。
revoke execute on function public.sync_learning_school_scope() from public, anon, authenticated;

drop trigger if exists projects_sync_school_scope       on public.projects;
create trigger projects_sync_school_scope
  before insert or update on public.projects
  for each row execute function public.sync_learning_school_scope();

drop trigger if exists conversations_sync_school_scope  on public.conversations;
create trigger conversations_sync_school_scope
  before insert or update on public.conversations
  for each row execute function public.sync_learning_school_scope();

drop trigger if exists practice_sync_school_scope       on public.practice_records;
create trigger practice_sync_school_scope
  before insert or update on public.practice_records
  for each row execute function public.sync_learning_school_scope();

drop trigger if exists audit_sync_school_scope          on public.audit_records;
create trigger audit_sync_school_scope
  before insert or update on public.audit_records
  for each row execute function public.sync_learning_school_scope();

-- ── 3. 历史回填 ───────────────────────────────────────────────────────────
update public.projects p set school_id = coalesce(
  (select c.school_id from public.classes c where c.id = p.class_id),
  (select s.school_id from public.spaces s where s.id = p.space_id),
  (select pr.school_id from public.profiles pr where pr.id = p.owner_id))
where p.school_id is null;

update public.conversations c set school_id = coalesce(
  (select p.school_id from public.projects p where p.id = c.project_id),
  (select cl.school_id from public.classes cl where cl.id = c.class_id),
  (select s.school_id from public.spaces s where s.id = c.space_id),
  (select pr.school_id from public.profiles pr where pr.id = c.owner_id))
where c.school_id is null;

update public.practice_records r set school_id = coalesce(
  (select p.school_id from public.projects p where p.id = r.project_id),
  (select pr.school_id from public.profiles pr where pr.id = r.student_id))
where r.school_id is null;

update public.audit_records a set school_id = coalesce(
  (select c.school_id from public.conversations c where c.id = a.source_conversation_id),
  (select cl.school_id from public.classes cl where cl.id = a.class_id))
where a.school_id is null;

-- 空间锚点回填：挑战与核实记录都挂在学生项目下，空间由项目决定。
update public.practice_records r set space_id = p.space_id
  from public.projects p
 where p.id = r.project_id and r.space_id is null and p.space_id is not null;

update public.practice_records r set class_id = p.class_id
  from public.projects p
 where p.id = r.project_id and r.class_id is null and p.class_id is not null;

update public.audit_records a set space_id = c.space_id
  from public.conversations c
 where c.id = a.source_conversation_id and a.space_id is null and c.space_id is not null;

-- ── 4. class_id 不再是核实的前提 ──────────────────────────────────────────
-- 无行政班的学生此前**无法产生任何核实记录**：trigger 拒（class 为空）+ 列 NOT NULL。
-- 班级退为分组维度后，核实记录靠 school_id + space_id 定位。
alter table public.audit_records alter column class_id drop not null;

create or replace function public.validate_audit_record_contract() returns trigger
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  message_role text;
  message_conversation_id uuid;
  conversation_source public.interaction_source;
  conversation_project_id uuid;
  conversation_class_id uuid;
  current_user_id uuid;
BEGIN
  SELECT m.role, m.conversation_id
    INTO message_role, message_conversation_id
    FROM public.conversation_messages m
    WHERE m.id = new.source_message_id;

  IF message_role IS NULL THEN
    RAISE EXCEPTION 'audit source message % does not exist', new.source_message_id;
  END IF;
  IF message_role <> 'assistant' THEN
    RAISE EXCEPTION 'only assistant answers can enter learning-record verification';
  END IF;

  IF new.source_conversation_id IS NULL THEN
    new.source_conversation_id = message_conversation_id;
  ELSIF new.source_conversation_id <> message_conversation_id THEN
    RAISE EXCEPTION 'audit source conversation must match source message conversation';
  END IF;

  SELECT c.source, c.project_id, c.class_id
    INTO conversation_source, conversation_project_id, conversation_class_id
    FROM public.conversations c
    WHERE c.id = new.source_conversation_id;

  -- 无行政班是合法形态：只要求是带项目的学生会话，不再要求 class。
  IF conversation_source <> 'student_chat'::public.interaction_source
      OR conversation_project_id IS NULL THEN
    RAISE EXCEPTION 'only student project conversations can enter learning-record verification';
  END IF;

  IF new.class_id IS NULL THEN
    new.class_id = conversation_class_id;
  ELSIF conversation_class_id IS NOT NULL AND new.class_id <> conversation_class_id THEN
    RAISE EXCEPTION 'audit class must match source conversation class';
  END IF;

  current_user_id = public.current_app_user_id();
  IF current_user_id IS NOT NULL AND NOT public.is_admin() THEN
    IF new.auditor_id IS DISTINCT FROM current_user_id THEN
      RAISE EXCEPTION 'teacher audit auditor_id must match current user';
    END IF;
    -- 教师的核实范围：任教班级 ∪ 自己拥有的空间。空间这一路让无行政班的学生
    -- 也能被其任课教师核实，而不必先给每个学生造一个班级。
    IF NOT public.teacher_can_access_class(new.class_id)
       AND NOT public.teacher_can_access_space(new.space_id) THEN
      RAISE EXCEPTION 'teacher cannot audit records outside assigned class or owned space';
    END IF;
  END IF;

  IF new.kind = 'sft'::public.audit_kind
      AND nullif(trim(coalesce(new.corrected_answer, new.original_answer, new.chosen_answer, '')), '') IS NULL THEN
    RAISE EXCEPTION 'SFT records require an assistant answer';
  END IF;
  IF new.kind = 'dpo'::public.audit_kind THEN
    IF nullif(trim(coalesce(new.chosen_answer, new.corrected_answer, '')), '') IS NULL
        OR nullif(trim(coalesce(new.rejected_answer, new.original_answer, '')), '') IS NULL THEN
      RAISE EXCEPTION 'DPO records require chosen and rejected answers';
    END IF;
    IF trim(coalesce(new.chosen_answer, new.corrected_answer, ''))
         = trim(coalesce(new.rejected_answer, new.original_answer, '')) THEN
      RAISE EXCEPTION 'DPO chosen and rejected answers must differ';
    END IF;
  END IF;

  RETURN new;
END $$;

-- ── 5. 教师的空间作用域 ───────────────────────────────────────────────────
create or replace function public.teacher_can_access_space(p_space_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.spaces s
    where s.id = p_space_id
      and s.owner_id = public.current_app_user_id()
      and (s.school_id is null or s.school_id = public.current_school_id())
  )
$$;

grant execute on function public.teacher_can_access_space(uuid) to anon, authenticated, service_role;

-- ── 6. RLS 改锚点 ─────────────────────────────────────────────────────────
-- 全部写成「学校 OR 班级」并集：新列给无班级学生兜底，旧列维持既有行为，
-- 两路都是收窄方向（school_id is not null 才能命中管理员分支，避免 NULL 行的
-- 公司级管理员越界看到别家数据）。

create or replace function public.can_read_conversation(p_conversation_id uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
      select exists (
        select 1
        from public.conversations c
        where c.id = p_conversation_id
          and (
            c.owner_id = public.current_app_user_id()
            or (c.school_id is not null and public.can_admin_school_scope(c.school_id))
            or (c.class_id is not null and public.can_admin_class(c.class_id))
            or (c.class_id is not null and public.teacher_can_access_class(c.class_id))
            or (c.space_id is not null and public.teacher_can_access_space(c.space_id))
          )
      )
    $$;

grant execute on function public.can_read_conversation(uuid) to anon, authenticated, service_role;

drop policy if exists "conversations_owner_all" on public.conversations;
create policy "conversations_owner_all" on public.conversations
  using (
    owner_id = public.current_app_user_id()
    or (school_id is not null and public.can_admin_school_scope(school_id))
    or (class_id is not null and public.can_admin_class(class_id))
  )
  with check (
    owner_id = public.current_app_user_id()
    or (school_id is not null and public.can_admin_school_scope(school_id))
    or (class_id is not null and public.can_admin_class(class_id))
  );

drop policy if exists "audit_app_teacher_admin_read" on public.audit_records;
create policy "audit_app_teacher_admin_read" on public.audit_records for select
  using (
    auditor_id = public.current_app_user_id()
    or (school_id is not null and public.can_admin_school_scope(school_id))
    or (class_id is not null and public.can_admin_class(class_id))
    or (class_id is not null and public.teacher_can_access_class(class_id))
    or (space_id is not null and public.teacher_can_access_space(space_id))
  );

drop policy if exists "audit_app_teacher_update" on public.audit_records;
create policy "audit_app_teacher_update" on public.audit_records for update
  using (
    auditor_id = public.current_app_user_id()
    or (school_id is not null and public.can_admin_school_scope(school_id))
    or (class_id is not null and public.can_admin_class(class_id))
  )
  with check (
    auditor_id = public.current_app_user_id()
    or (school_id is not null and public.can_admin_school_scope(school_id))
    or (class_id is not null and public.can_admin_class(class_id))
  );

-- 挑战记录此前只有「本人 + 管理员」两路，任课教师读不到自己学生的任何挑战结果。
drop policy if exists "practice_app_student_all" on public.practice_records;
create policy "practice_app_student_all" on public.practice_records
  using (
    student_id = public.current_app_user_id()
    or public.can_admin_profile(student_id)
    or (school_id is not null and public.can_admin_school_scope(school_id))
    or (class_id is not null and public.teacher_can_access_class(class_id))
    or (space_id is not null and public.teacher_can_access_space(space_id))
  )
  with check (
    student_id = public.current_app_user_id()
    or (school_id is not null and public.can_admin_school_scope(school_id))
  );

drop policy if exists "projects_teacher_read" on public.projects;
create policy "projects_teacher_read" on public.projects for select
  using (
    (class_id is not null and public.teacher_can_access_class(class_id))
    or (space_id is not null and public.teacher_can_access_space(space_id))
  );

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'audit_records' and column_name = 'school_id'
  ) then
    raise exception 'audit_records.school_id missing';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'audit_records'
       and column_name = 'class_id' and is_nullable = 'NO'
  ) then
    raise exception 'audit_records.class_id must be nullable (no-class students cannot be verified)';
  end if;
  if not has_function_privilege('anon', 'public.teacher_can_access_space(uuid)'::regprocedure, 'execute') then
    raise exception 'anon (the app role) must be able to call teacher_can_access_space';
  end if;
  if has_function_privilege('anon', 'public.sync_learning_school_scope()'::regprocedure, 'execute') then
    raise exception 'sync_learning_school_scope must not be executable by anon (definer trigger function)';
  end if;
  raise notice '租户锚点就位：学校 + 空间，class_id 降为分组维度';
end $$;
