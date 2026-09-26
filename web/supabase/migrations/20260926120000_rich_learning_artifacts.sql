-- ═══════════════════════════════════════════════════════════════════════════
-- 学习产物形态：不再只有纯文本
-- ═══════════════════════════════════════════════════════════════════════════
-- 旧模型把「学生能交的东西」压成「一句提问 + 一段 AI 回答」：
--   · attachments 只收 txt/md/json，拍照选文件直接被 accept 过滤掉
--   · chat route 的 userText 只从 text part 取值，含图片的轮次判「消息不能为空」
--   · 没有提交物实体，实验报告、代码、扫描件一律无处安放
-- 数学的公式、编程的代码、英语的录音、试卷的扫描件，路径全断。
--
-- 改法：开一个私有存储桶承接文件类产物，新增 submissions 承载非对话式提交，
-- 挑战作答也能带附件。检索资料（documents）与学习成果（submissions）分表——
-- 混成一张会让「按空间清退/导出」要么漏要么越界。

-- ── 1. 私有存储桶：文件类学习产物 ──────────────────────────────────────────
-- 路径约定：{profile_id}/{用途}/{文件名}。按第一段判归属，策略里可以直接解析。
insert into storage.buckets (id, name, public, file_size_limit)
values ('learning-artifacts', 'learning-artifacts', false, 10485760)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      public = false;

-- split_part(...)::uuid 在非 uuid 路径上会直接抛错把整条策略搞挂，
-- 所以先用一个正则判形状再转。这不是洁癖：攻击者可以随手传任意 name。
create or replace function public.storage_path_owner(p_name text)
returns uuid
language sql immutable
as $$
  select case
    when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
    else null
  end
$$;

drop policy if exists "artifacts_owner_all" on storage.objects;
create policy "artifacts_owner_all" on storage.objects
  for all
  using (
    bucket_id = 'learning-artifacts'
    and public.storage_path_owner(name) = public.current_app_user_id()
  )
  with check (
    bucket_id = 'learning-artifacts'
    and public.storage_path_owner(name) = public.current_app_user_id()
  );

-- 管理员按被管辖的档案读：用于核实页面回看学生交上来的东西。
-- 写侧不给管理员——产物只有学生本人能交，这条不给绕开的口子。
drop policy if exists "artifacts_admin_read" on storage.objects;
create policy "artifacts_admin_read" on storage.objects
  for select
  using (
    bucket_id = 'learning-artifacts'
    and public.storage_path_owner(name) is not null
    and public.can_admin_profile(public.storage_path_owner(name))
  );

grant execute on function public.storage_path_owner(text) to anon, authenticated, service_role;

-- ── 2. submissions：非对话式学习产物 ──────────────────────────────────────
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  school_id uuid references public.schools(id),
  assignment_id uuid,
  kind text not null default 'file',
  title text not null,
  content text,
  parts jsonb not null default '[]'::jsonb,
  blob_paths text[] not null default '{}'::text[],
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  review_state text not null default 'pending'
    check (review_state in ('pending', 'reviewed', 'returned')),
  constraint submissions_title_not_blank check (length(trim(title)) > 0)
);

create index if not exists submissions_owner_idx      on public.submissions (owner_id, submitted_at desc);
create index if not exists submissions_space_idx      on public.submissions (space_id, submitted_at desc);
create index if not exists submissions_project_idx    on public.submissions (project_id, submitted_at desc);
create index if not exists submissions_school_idx     on public.submissions (school_id);
create index if not exists submissions_assignment_idx on public.submissions (assignment_id);

alter table public.submissions enable row level security;

drop trigger if exists submissions_touch on public.submissions;
create trigger submissions_touch
  before update on public.submissions
  for each row execute function public.touch_updated_at();

-- 锚点与归属：写入时推导，路径与上一批的 sync_learning_school_scope 同构，
-- 所以直接复用那一个函数而不是再抄一份。
create or replace function public.sync_submission_scope() returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare v_class uuid; v_space uuid;
begin
  select coalesce(p.class_id, new.class_id), coalesce(p.space_id, new.space_id)
    into v_class, v_space
    from public.projects p where p.id = new.project_id;

  if new.class_id is null then new.class_id := v_class; end if;
  if new.space_id is null then new.space_id := v_space; end if;

  new.school_id := coalesce(
    new.school_id,
    (select c.school_id from public.classes c where c.id = new.class_id),
    (select s.school_id from public.spaces s where s.id = new.space_id),
    (select pr.school_id from public.profiles pr where pr.id = new.owner_id)
  );
  return new;
end $$;

drop trigger if exists submissions_sync_scope on public.submissions;
create trigger submissions_sync_scope
  before insert or update on public.submissions
  for each row execute function public.sync_submission_scope();

revoke execute on function public.sync_submission_scope() from public, anon, authenticated;

-- 可见性：本人 / 管理员（按学校锚点）/ 任课教师（按班级或空间）。
-- 与会话同一套判据，差别只是这里没有 owner_id 之外的「提问人」概念。
drop policy if exists "submissions_scope_read" on public.submissions;
create policy "submissions_scope_read" on public.submissions for select
  using (
    owner_id = public.current_app_user_id()
    or (school_id is not null and public.can_admin_school_scope(school_id))
    or (class_id is not null and public.teacher_can_access_class(class_id))
    or (space_id is not null and public.teacher_can_access_space(space_id))
  );

drop policy if exists "submissions_owner_write" on public.submissions;
create policy "submissions_owner_write" on public.submissions for insert
  with check (owner_id = public.current_app_user_id());

drop policy if exists "submissions_owner_update" on public.submissions;
create policy "submissions_owner_update" on public.submissions for update
  using (owner_id = public.current_app_user_id())
  with check (owner_id = public.current_app_user_id());

drop policy if exists "submissions_owner_delete" on public.submissions;
create policy "submissions_owner_delete" on public.submissions for delete
  using (owner_id = public.current_app_user_id());

-- ── 3. 挑战作答可带附件 ──────────────────────────────────────────────────
-- 评价提示词只读 prompt 与 answer 两段纯文本，学生交了图片或代码时模型看不见。
alter table public.practice_records
  add column if not exists submission_parts jsonb not null default '[]'::jsonb;
alter table public.practice_records
  add column if not exists rubric_notes jsonb not null default '[]'::jsonb;

-- 硬上限移出列定义：题面 800 字符 / 作答 4000 字符是应用层的字符串长度校验，
-- 结构化多段（题干 + 材料 + 要求）以后走 parts，不再靠单字段硬顶。
alter table public.practice_records
  add constraint practice_records_answer_present check (
    nullif(trim(coalesce(answer, '')), '') is not null
    or jsonb_array_length(submission_parts) > 0
  ) not valid;
alter table public.practice_records validate constraint practice_records_answer_present;

-- ── 4. 检索资料挂上空间 ─────────────────────────────────────────────────
-- 空间已是学习数据的一级作用域，附件这条链没跟上：一份上传到某空间会话的资料，
-- 可见性判定仍只落在 owner_id + class_id，跨空间清退或导出时要么漏要么越界。
alter table public.documents add column if not exists space_id uuid references public.spaces(id) on delete set null;
alter table public.document_chunks add column if not exists space_id uuid references public.spaces(id) on delete set null;
create index if not exists documents_space_idx on public.documents (space_id);

update public.documents d set space_id = c.space_id
  from public.conversations c
 where c.id = d.conversation_id and d.space_id is null and c.space_id is not null;

update public.documents d set space_id = p.space_id
  from public.projects p
 where p.id = d.project_id and d.space_id is null and p.space_id is not null;

update public.document_chunks dc set space_id = d.space_id
  from public.documents d
 where d.id = dc.document_id and dc.space_id is null and d.space_id is not null;

-- 文档表不共用 sync_learning_school_scope：那个函数按 TG_TABLE_NAME 分支，
-- 没有 documents 分支，落进 else 会去读 documents 上并不存在的
-- source_conversation_id / source_message_id，触发器一跑就报字段不存在。
create or replace function public.sync_document_space() returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if new.space_id is null then
    select c.space_id into new.space_id
      from public.conversations c where c.id = new.conversation_id;
  end if;
  if new.space_id is null then
    select p.space_id into new.space_id
      from public.projects p where p.id = new.project_id;
  end if;
  if new.class_id is null then
    select p.class_id into new.class_id
      from public.projects p where p.id = new.project_id;
  end if;
  return new;
end $$;

drop trigger if exists documents_sync_space on public.documents;
create trigger documents_sync_space
  before insert or update on public.documents
  for each row execute function public.sync_document_space();

revoke execute on function public.sync_document_space() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'learning-artifacts') then
    raise exception 'storage bucket learning-artifacts missing';
  end if;
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'submissions'
  ) then
    raise exception 'public.submissions missing';
  end if;
  if not has_function_privilege('anon', 'public.storage_path_owner(text)'::regprocedure, 'execute') then
    raise exception 'anon (the app role) must be able to call storage_path_owner';
  end if;
  if has_function_privilege('anon', 'public.sync_submission_scope()'::regprocedure, 'execute') then
    raise exception 'sync_submission_scope must not be executable by anon (definer trigger function)';
  end if;
  raise notice '学习产物形态就位：私有存储桶 + submissions + 挑战附件';
end $$;
