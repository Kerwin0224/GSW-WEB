-- ═══════════════════════════════════════════════════════════════════════════
-- 教学形态：任务可下发、核实有回执、终态可继续
-- ═══════════════════════════════════════════════════════════════════════════
-- 旧模型把「学生向 AI 提问 → 教师事后核实」焊成唯一且不可逆的主循环：
--   · 全仓无 assignment / submission 任何表，教师无法为学生预置挑战、指定层级、
--     下发题目或设截止时间；换成任务驱动课堂，学生端等于空壳
--   · 核实结论的唯一产物是「改写 AI 回答 + 物化 SFT/DPO」，教师想说
--     「你这题推理跳步了」只能把答案重写一遍，学生看不到任何评语
--   · finalized_at 一个字段同时表达「核实完成」和「禁止学生继续追问」，
--     一次草率的核实就永久封口，且没有申诉路径

-- ── 1. assignments：教师发起 → 学生完成 ──────────────────────────────────
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.spaces(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  school_id uuid references public.schools(id),
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  instructions text,
  kind text not null default 'practice'
    check (kind in ('practice', 'question', 'reading', 'project_work')),
  target_level integer,
  due_at timestamptz,
  status text not null default 'open'
    check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignments_title_not_blank check (length(trim(title)) > 0)
);

create index if not exists assignments_space_idx  on public.assignments (space_id, created_at desc);
create index if not exists assignments_class_idx  on public.assignments (class_id);
create index if not exists assignments_school_idx on public.assignments (school_id);

alter table public.assignments enable row level security;

drop trigger if exists assignments_touch on public.assignments;
create trigger assignments_touch
  before update on public.assignments
  for each row execute function public.touch_updated_at();

-- assignments 同样不共用 sync_learning_school_scope：没有 assignments 分支，
-- 落进 else 会去读本表不存在的 source_conversation_id / source_message_id。
create or replace function public.sync_assignment_scope() returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  new.school_id := coalesce(
    new.school_id,
    (select c.school_id from public.classes c where c.id = new.class_id),
    (select s.school_id from public.spaces s where s.id = new.space_id),
    (select p.school_id from public.profiles p where p.id = new.created_by)
  );
  return new;
end $$;

drop trigger if exists assignments_sync_scope on public.assignments;
create trigger assignments_sync_scope
  before insert or update on public.assignments
  for each row execute function public.sync_assignment_scope();

revoke execute on function public.sync_assignment_scope() from public, anon, authenticated;

-- 任务的受众：整班、或点名若干学生。空 recipients = 面向空间的全体成员。
create table if not exists public.assignment_recipients (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (assignment_id, profile_id)
);

create index if not exists assignment_recipients_profile_idx
  on public.assignment_recipients (profile_id, completed_at);

alter table public.assignment_recipients enable row level security;

-- submissions 指向任务
alter table public.submissions
  add constraint submissions_assignment_fk foreign key (assignment_id)
  references public.assignments(id) on delete set null;

-- 挑战记录也可由教师发起（此前只能学生自助点「生成挑战」）
alter table public.practice_records
  add column if not exists assigned_by uuid references public.profiles(id) on delete set null;
alter table public.practice_records
  add column if not exists source text not null default 'self'
    check (source in ('self', 'assigned'));

-- ── 2. 会话核实终态：拆成「核实进度」与「是否锁问」 ───────────────────────
-- 原来一个 finalized_at 同时承担两件事：教师点完提交，学生立刻被封口。
-- 探究型、异步答疑、复核后追问都需要「核实完成但还能继续问」。
alter table public.conversations
  add column if not exists locked_at timestamptz;
alter table public.conversations
  add column if not exists review_state text not null default 'pending'
    check (review_state in ('pending', 'in_review', 'changes_requested', 'finalized'));
alter table public.conversations
  add column if not exists teacher_comment text;
alter table public.conversations
  add column if not exists finalized_by uuid references public.profiles(id) on delete set null;

create index if not exists conversations_locked_idx on public.conversations (locked_at)
  where locked_at is not null;

-- 历史行回填：此前 finalized_at 非空即「已核实」，review_state 同步。
update public.conversations set review_state = 'finalized' where finalized_at is not null;

-- ── 3. 核实记录承载评语与维度打标 ───────────────────────────────────────
-- 教师想说「你这题推理跳步了、论据只有一个」，此前只能把答案重写一遍。
-- metadata 已有 jsonb，直接在 metadata 里加形状，不新建表。
-- 加列是给查询用的：教师端要按维度统计，所以维度键提到列上。
alter table public.audit_records
  add column if not exists dimension_key text;
alter table public.audit_records
  add column if not exists teacher_comment text;

create index if not exists audit_records_dimension_idx
  on public.audit_records (dimension_key) where dimension_key is not null;

-- ── 4. 申诉：学生可以反驳核实结论 ───────────────────────────────────────
-- 此前核实是不可逆终点：学生不知道自己被核实过，更没有渠道说「AI 那句是对的」。
create table if not exists public.verification_appeals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  raised_by uuid not null references public.profiles(id) on delete cascade,
  school_id uuid references public.schools(id),
  space_id uuid references public.spaces(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  body text not null,
  state text not null default 'open' check (state in ('open', 'upheld', 'withdrawn')),
  resolution_note text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_appeals_body_not_blank check (length(trim(body)) > 0)
);

create index if not exists verification_appeals_conversation_idx
  on public.verification_appeals (conversation_id, created_at desc);
create index if not exists verification_appeals_state_idx
  on public.verification_appeals (state) where state = 'open';

alter table public.verification_appeals enable row level security;

drop trigger if exists verification_appeals_touch on public.verification_appeals;
create trigger verification_appeals_touch
  before update on public.verification_appeals
  for each row execute function public.touch_updated_at();

-- 申诉的锚点来自被申诉的会话：raised_by 是学生，但租户归属看的是会话。
create or replace function public.sync_appeal_scope() returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  select coalesce(c.space_id, new.space_id), coalesce(c.class_id, new.class_id)
    into new.space_id, new.class_id
    from public.conversations c where c.id = new.conversation_id;

  new.school_id := coalesce(
    new.school_id,
    (select c.school_id from public.conversations c where c.id = new.conversation_id),
    (select cl.school_id from public.classes cl where cl.id = new.class_id)
  );
  return new;
end $$;

drop trigger if exists appeals_sync_scope on public.verification_appeals;
create trigger appeals_sync_scope
  before insert or update on public.verification_appeals
  for each row execute function public.sync_appeal_scope();

revoke execute on function public.sync_appeal_scope() from public, anon, authenticated;

drop policy if exists "appeals_student_read" on public.verification_appeals;
create policy "appeals_student_read" on public.verification_appeals for select
  using (raised_by = public.current_app_user_id());

drop policy if exists "appeals_student_write" on public.verification_appeals;
create policy "appeals_student_write" on public.verification_appeals for insert
  with check (
    raised_by = public.current_app_user_id()
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and c.owner_id = public.current_app_user_id()
         and c.finalized_at is not null
    )
  );

drop policy if exists "appeals_teacher_read" on public.verification_appeals;
create policy "appeals_teacher_read" on public.verification_appeals for select
  using (
    (school_id is not null and public.can_admin_school_scope(school_id))
    or (class_id is not null and public.teacher_can_access_class(class_id))
    or (space_id is not null and public.teacher_can_access_space(space_id))
  );

drop policy if exists "appeals_teacher_resolve" on public.verification_appeals;
create policy "appeals_teacher_resolve" on public.verification_appeals for update
  using (
    (school_id is not null and public.can_admin_school_scope(school_id))
    or (class_id is not null and public.teacher_can_access_class(class_id))
    or (space_id is not null and public.teacher_can_access_space(space_id))
  )
  with check (resolved_by = public.current_app_user_id());

-- ── 5. 任务可见性 ─────────────────────────────────────────────────────
drop policy if exists "assignments_student_read" on public.assignments;
create policy "assignments_student_read" on public.assignments for select
  using (
    created_by = public.current_app_user_id()
    or (class_id is not null and exists (
          select 1 from public.class_memberships cm
           where cm.class_id = assignments.class_id
             and cm.profile_id = public.current_app_user_id()
             and cm.role = 'student'))
    or (space_id is not null and exists (
          select 1 from public.space_members sm
           where sm.space_id = assignments.space_id
             and sm.student_id = public.current_app_user_id()))
  );

drop policy if exists "assignments_teacher_write" on public.assignments;
create policy "assignments_teacher_write" on public.assignments for insert
  with check (
    created_by = public.current_app_user_id()
    and ((space_id is not null and public.teacher_can_access_space(space_id))
      or (class_id is not null and public.teacher_can_access_class(class_id)))
  );

drop policy if exists "assignments_teacher_update" on public.assignments;
create policy "assignments_teacher_update" on public.assignments for update
  using (
    created_by = public.current_app_user_id()
    or (school_id is not null and public.can_admin_school_scope(school_id))
  )
  with check (
    created_by = public.current_app_user_id()
    or (school_id is not null and public.can_admin_school_scope(school_id))
  );

-- 同一套判据给 recipients：谁被布置了，只有他自己、任课教师和管理员能看见。
drop policy if exists "assignment_recipients_read" on public.assignment_recipients;
create policy "assignment_recipients_read" on public.assignment_recipients for select
  using (
    profile_id = public.current_app_user_id()
    or exists (
      select 1 from public.assignments a
       where a.id = assignment_id
         and (a.created_by = public.current_app_user_id()
           or (a.school_id is not null and public.can_admin_school_scope(a.school_id))
           or (a.class_id is not null and public.teacher_can_access_class(a.class_id))
           or (a.space_id is not null and public.teacher_can_access_space(a.space_id)))
    )
  );

drop policy if exists "assignment_recipients_write" on public.assignment_recipients;
create policy "assignment_recipients_write" on public.assignment_recipients for insert
  with check (exists (
    select 1 from public.assignments a
     where a.id = assignment_id and a.created_by = public.current_app_user_id()
  ));

drop policy if exists "assignment_recipients_update" on public.assignment_recipients;
create policy "assignment_recipients_update" on public.assignment_recipients for update
  using (
    profile_id = public.current_app_user_id()
    or exists (
      select 1 from public.assignments a
       where a.id = assignment_id
         and (a.created_by = public.current_app_user_id()
           or (a.school_id is not null and public.can_admin_school_scope(a.school_id))
           or (a.class_id is not null and public.teacher_can_access_class(a.class_id))
           or (a.space_id is not null and public.teacher_can_access_space(a.space_id)))
    )
  );

do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema='public' and table_name='assignments'
  ) then
    raise exception 'public.assignments missing';
  end if;
  if not exists (
    select 1 from information_schema.tables
     where table_schema='public' and table_name='verification_appeals'
  ) then
    raise exception 'public.verification_appeals missing';
  end if;
  raise notice '教学形态就位：任务下发 + 评语回执 + 申诉 + 终态拆分';
end $$;
