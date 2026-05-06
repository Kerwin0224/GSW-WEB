begin;

create table if not exists public.data_quality_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  table_name text not null,
  record_count integer not null default 0,
  reason text not null,
  payload jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.data_quality_events enable row level security;

drop policy if exists data_quality_events_admin_all on public.data_quality_events;
create policy data_quality_events_admin_all on public.data_quality_events
  for all using (public.is_admin()) with check (public.is_admin());

with rows as (
  select ar.*
  from public.audit_records ar
  left join public.conversation_messages m on m.id = ar.source_message_id
  left join public.conversations c on c.id = coalesce(ar.source_conversation_id, m.conversation_id)
  where ar.source_message_id is null
    or m.id is null
    or m.role <> 'assistant'
    or c.id is null
    or c.source <> 'student_chat'::public.interaction_source
    or c.project_id is null
    or c.class_id is null
    or ar.source_conversation_id is distinct from m.conversation_id
    or ar.class_id is distinct from c.class_id
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_invalid_audit_records',
  'audit_records',
  record_count,
  'Removed records that violated CONTEXT.md: teacher Q&A and daily archive content must not enter learning-record verification or SFT/DPO export.',
  payload
from snapshot
where record_count > 0;

delete from public.audit_records ar
using public.conversation_messages m, public.conversations c
where ar.source_message_id = m.id
  and c.id = coalesce(ar.source_conversation_id, m.conversation_id)
  and (
    m.role <> 'assistant'
    or c.source <> 'student_chat'::public.interaction_source
    or c.project_id is null
    or c.class_id is null
    or ar.source_conversation_id is distinct from m.conversation_id
    or ar.class_id is distinct from c.class_id
  );

delete from public.audit_records ar
where ar.source_message_id is null
  or ar.source_conversation_id is null
  or ar.class_id is null
  or not exists (select 1 from public.conversation_messages m where m.id = ar.source_message_id)
  or not exists (select 1 from public.conversations c where c.id = ar.source_conversation_id);

with rows as (
  select *
  from public.audit_records
  where id not in (
    '70000000-0000-4000-8000-000000000131'::uuid,
    '70000000-0000-4000-8000-000000000132'::uuid
  )
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_non_minimal_audit_records',
  'audit_records',
  record_count,
  'Removed review/export samples outside the canonical minimal SFT/DPO pair before deleting their source conversations.',
  payload
from snapshot
where record_count > 0;

delete from public.audit_records
where id not in (
  '70000000-0000-4000-8000-000000000131'::uuid,
  '70000000-0000-4000-8000-000000000132'::uuid
);

with rows as (
  select *
  from public.export_batches
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_stale_export_batches',
  'export_batches',
  record_count,
  'Removed generated export batches so the minimal seed exposes current approved SFT/DPO samples as exportable data.',
  payload
from snapshot
where record_count > 0;

delete from public.export_batches;

with rows as (
  select *
  from public.document_chunks
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_non_minimal_document_chunks',
  'document_chunks',
  record_count,
  'Removed attachment/RAG chunks; the canonical minimal seed intentionally contains no uploaded attachment corpus.',
  payload
from snapshot
where record_count > 0;

delete from public.document_chunks;

with rows as (
  select *
  from public.documents
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_non_minimal_documents',
  'documents',
  record_count,
  'Removed attachment/RAG documents; the canonical minimal seed is conversation- and challenge-focused.',
  payload
from snapshot
where record_count > 0;

delete from public.documents;

with rows as (
  select c.*, (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb)
    from public.conversation_messages m
    where m.conversation_id = c.id
  ) as messages
  from public.conversations c
  where c.id not in (
    '70000000-0000-4000-8000-000000000101'::uuid,
    '70000000-0000-4000-8000-000000000201'::uuid,
    '70000000-0000-4000-8000-000000000301'::uuid
  )
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_non_minimal_conversations',
  'conversations',
  record_count,
  'Collapsed the database to the minimal CONTEXT.md product loop: one student project session, one teacher Q&A, and one daily archive session.',
  payload
from snapshot
where record_count > 0;

delete from public.conversations
where id not in (
  '70000000-0000-4000-8000-000000000101'::uuid,
  '70000000-0000-4000-8000-000000000201'::uuid,
  '70000000-0000-4000-8000-000000000301'::uuid
);

with rows as (
  select *
  from public.conversation_messages
  where id not in (
    '70000000-0000-4000-8000-000000000111'::uuid,
    '70000000-0000-4000-8000-000000000112'::uuid,
    '70000000-0000-4000-8000-000000000211'::uuid,
    '70000000-0000-4000-8000-000000000212'::uuid,
    '70000000-0000-4000-8000-000000000311'::uuid,
    '70000000-0000-4000-8000-000000000312'::uuid
  )
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_non_minimal_conversation_messages',
  'conversation_messages',
  record_count,
  'Removed messages outside the minimal student project, teacher Q&A, and daily archive transcripts.',
  payload
from snapshot
where record_count > 0;

delete from public.conversation_messages
where id not in (
  '70000000-0000-4000-8000-000000000111'::uuid,
  '70000000-0000-4000-8000-000000000112'::uuid,
  '70000000-0000-4000-8000-000000000211'::uuid,
  '70000000-0000-4000-8000-000000000212'::uuid,
  '70000000-0000-4000-8000-000000000311'::uuid,
  '70000000-0000-4000-8000-000000000312'::uuid
);

with rows as (
  select *
  from public.prompt_presets
  where id not in (
    '11111111-0504-4000-8000-000000000001'::uuid,
    '11111111-0504-4000-8000-000000000002'::uuid,
    '11111111-0504-4000-8000-000000000003'::uuid
  )
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_legacy_prompt_presets',
  'prompt_presets',
  record_count,
  'Removed legacy duplicate prompt presets; the minimal seed keeps the three role-correct teacher presets.',
  payload
from snapshot
where record_count > 0;

delete from public.prompt_presets
where id not in (
  '11111111-0504-4000-8000-000000000001'::uuid,
  '11111111-0504-4000-8000-000000000002'::uuid,
  '11111111-0504-4000-8000-000000000003'::uuid
);

with rows as (
  select *
  from public.practice_records
  where id not in (
    '70000000-0000-4000-8000-000000000119'::uuid,
    '70000000-0000-4000-8000-000000000120'::uuid,
    '70000000-0000-4000-8000-000000000121'::uuid
  )
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_non_minimal_practice_records',
  'practice_records',
  record_count,
  'Removed challenge records outside the minimal L1-L3 confirmed challenge climb.',
  payload
from snapshot
where record_count > 0;

delete from public.practice_records
where id not in (
  '70000000-0000-4000-8000-000000000119'::uuid,
  '70000000-0000-4000-8000-000000000120'::uuid,
  '70000000-0000-4000-8000-000000000121'::uuid
);

with rows as (
  select *
  from public.text_projects
  where id <> 'c0000000-0000-0000-0000-000000000101'::uuid
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_non_minimal_projects',
  'text_projects',
  record_count,
  'Removed orphan/duplicate projects; CONTEXT.md requires one stable student project per篇目 learning unit.',
  payload
from snapshot
where record_count > 0;

delete from public.text_projects
where id <> 'c0000000-0000-0000-0000-000000000101'::uuid;

with rows as (
  select *
  from public.class_memberships
  where not (
    class_id = 'b0000000-0000-0000-0000-000000000101'::uuid
    and profile_id in (
      'a0000000-0000-0000-0000-000000000002'::uuid,
      'a0000000-0000-0000-0000-000000000011'::uuid
    )
  )
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_non_minimal_class_memberships',
  'class_memberships',
  record_count,
  'Removed memberships outside the minimal class roster and the MVP single-class student contract.',
  payload
from snapshot
where record_count > 0;

delete from public.class_memberships
where not (
  class_id = 'b0000000-0000-0000-0000-000000000101'::uuid
  and profile_id in (
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'a0000000-0000-0000-0000-000000000011'::uuid
  )
);

with rows as (
  select *
  from public.classes
  where id <> 'b0000000-0000-0000-0000-000000000101'::uuid
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_non_minimal_classes',
  'classes',
  record_count,
  'Removed duplicate/non-minimal classes so teacher scope and student membership have one canonical class boundary.',
  payload
from snapshot
where record_count > 0;

delete from public.classes
where id <> 'b0000000-0000-0000-0000-000000000101'::uuid;

with rows as (
  select p.*
  from public.profiles p
  where p.id not in (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'a0000000-0000-0000-0000-000000000011'::uuid
  )
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_non_minimal_profiles',
  'profiles',
  record_count,
  'Removed extra demo accounts so the seed has exactly one admin, one teacher, and one student.',
  payload
from snapshot
where record_count > 0;

with rows as (
  select id, email, raw_user_meta_data, created_at
  from auth.users
  where id in (
    'a0000000-0000-0000-0000-000000000012'::uuid,
    'a0000000-0000-0000-0000-000000000013'::uuid,
    'a0000000-0000-0000-0000-000000000014'::uuid,
    'a0000000-0000-0000-0000-000000000015'::uuid,
    'a0000000-0000-0000-0000-000000000016'::uuid
  )
),
snapshot as (
  select count(*)::integer as record_count, coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) as payload
  from rows
)
insert into public.data_quality_events (event_type, table_name, record_count, reason, payload)
select
  'delete_non_minimal_auth_users',
  'auth.users',
  record_count,
  'Removed extra demo auth users matching the deleted non-minimal student profiles.',
  payload
from snapshot
where record_count > 0;

delete from auth.users
where id in (
  'a0000000-0000-0000-0000-000000000012'::uuid,
  'a0000000-0000-0000-0000-000000000013'::uuid,
  'a0000000-0000-0000-0000-000000000014'::uuid,
  'a0000000-0000-0000-0000-000000000015'::uuid,
  'a0000000-0000-0000-0000-000000000016'::uuid
);

delete from public.profiles
where id not in (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'a0000000-0000-0000-0000-000000000002'::uuid,
  'a0000000-0000-0000-0000-000000000011'::uuid
);

insert into public.profiles (id, login_id, display_name, role, status, password_hash)
select id, login_id, display_name, role, 'active', crypt(login_id, gen_salt('bf'))
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, '20240001', '教务管理员', 'admin'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, '20240002', '李老师', 'teacher'),
  ('a0000000-0000-0000-0000-000000000011'::uuid, '20260101', '王同学', 'student')
) as seed(id, login_id, display_name, role)
where exists (select 1 from auth.users u where u.id = seed.id)
on conflict (id) do update
set login_id = excluded.login_id,
    display_name = excluded.display_name,
    role = excluded.role,
    status = excluded.status,
    password_hash = excluded.password_hash,
    updated_at = now();

insert into public.classes (id, name, grade, status, created_by)
values (
  'b0000000-0000-0000-0000-000000000101'::uuid,
  '高一(1)班',
  '高一',
  'active',
  'a0000000-0000-0000-0000-000000000001'::uuid
)
on conflict (id) do update
set name = excluded.name,
    grade = excluded.grade,
    status = excluded.status,
    created_by = excluded.created_by,
    updated_at = now();

insert into public.class_memberships (class_id, profile_id, role)
values
  ('b0000000-0000-0000-0000-000000000101'::uuid, 'a0000000-0000-0000-0000-000000000002'::uuid, 'teacher'::public.app_role),
  ('b0000000-0000-0000-0000-000000000101'::uuid, 'a0000000-0000-0000-0000-000000000011'::uuid, 'student'::public.app_role)
on conflict (class_id, profile_id) do update
set role = excluded.role;

insert into public.prompt_presets (id, title, scenario, system_instruction, user_template, variables, target_role, status, version, created_by)
values
  (
    '11111111-0504-4000-8000-000000000001'::uuid,
    '古文精读追问导师',
    '教师课堂追问：围绕文言文关键字词、句读、章法和主题递进提问。',
    '你是文韵智途教师问答助手。只围绕古诗文篇目、字词、句读、章法、意象、情感和课堂追问给出可用于教学的建议。',
    '围绕《{{title}}》为{{grade}}学生设计三层课堂追问。',
    '["title","grade"]'::jsonb,
    'teacher'::public.app_role,
    'published'::public.prompt_preset_status,
    1,
    'a0000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    '11111111-0504-4000-8000-000000000002'::uuid,
    '文言知识点讲解教案',
    '教师备课：把文言知识点转成可讲、可练、可追问的微型教案。',
    '你是文韵智途备课助手。输出面向教师的古诗文知识点讲解结构，避免学生闲聊式回答。',
    '请把{{knowledge_point}}设计成一段可课堂讲解的微型教案。',
    '["knowledge_point"]'::jsonb,
    'teacher'::public.app_role,
    'published'::public.prompt_preset_status,
    1,
    'a0000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    '11111111-0504-4000-8000-000000000003'::uuid,
    '学生回答诊断与反馈',
    '教师处理：诊断学生古诗文回答质量，生成可操作反馈。',
    '你是文韵智途教学诊断助手。请帮助教师判断学生回答是否有文本证据、层次和误解风险。',
    '请诊断这段学生回答：{{student_answer}}',
    '["student_answer"]'::jsonb,
    'teacher'::public.app_role,
    'published'::public.prompt_preset_status,
    1,
    'a0000000-0000-0000-0000-000000000001'::uuid
  )
on conflict (id) do update
set title = excluded.title,
    scenario = excluded.scenario,
    system_instruction = excluded.system_instruction,
    user_template = excluded.user_template,
    variables = excluded.variables,
    target_role = excluded.target_role,
    status = excluded.status,
    version = excluded.version,
    created_by = excluded.created_by,
    updated_at = now();

insert into public.text_projects (id, owner_id, class_id, title, author, text_type, classification_state, highest_bloom_level)
values (
  'c0000000-0000-0000-0000-000000000101'::uuid,
  'a0000000-0000-0000-0000-000000000011'::uuid,
  'b0000000-0000-0000-0000-000000000101'::uuid,
  '静夜思',
  '李白',
  'poem',
  'classified',
  3
)
on conflict (id) do update
set owner_id = excluded.owner_id,
    class_id = excluded.class_id,
    title = excluded.title,
    author = excluded.author,
    text_type = excluded.text_type,
    classification_state = excluded.classification_state,
    highest_bloom_level = excluded.highest_bloom_level,
    updated_at = now();

insert into public.conversations (id, owner_id, class_id, project_id, source, prompt_preset_id, title)
values
  (
    '70000000-0000-4000-8000-000000000101'::uuid,
    'a0000000-0000-0000-0000-000000000011'::uuid,
    'b0000000-0000-0000-0000-000000000101'::uuid,
    'c0000000-0000-0000-0000-000000000101'::uuid,
    'student_chat'::public.interaction_source,
    null,
    '《静夜思》里为什么先写月光再写思乡？'
  ),
  (
    '70000000-0000-4000-8000-000000000201'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    null,
    null,
    'teacher_chat'::public.interaction_source,
    '11111111-0504-4000-8000-000000000001'::uuid,
    '围绕《山居秋暝》设计课堂追问。'
  ),
  (
    '70000000-0000-4000-8000-000000000301'::uuid,
    'a0000000-0000-0000-0000-000000000011'::uuid,
    null,
    null,
    'student_chat'::public.interaction_source,
    null,
    '这句怎么理解？'
  )
on conflict (id) do update
set owner_id = excluded.owner_id,
    class_id = excluded.class_id,
    project_id = excluded.project_id,
    source = excluded.source,
    prompt_preset_id = excluded.prompt_preset_id,
    title = excluded.title,
    updated_at = now();

insert into public.conversation_messages (id, conversation_id, role, content, parts, bloom_level, bloom_state, model_id)
values
  (
    '70000000-0000-4000-8000-000000000111'::uuid,
    '70000000-0000-4000-8000-000000000101'::uuid,
    'user',
    '《静夜思》里为什么先写月光再写思乡？',
    '[{"type":"text","text":"《静夜思》里为什么先写月光再写思乡？"}]'::jsonb,
    3,
    'classified',
    null
  ),
  (
    '70000000-0000-4000-8000-000000000112'::uuid,
    '70000000-0000-4000-8000-000000000101'::uuid,
    'assistant',
    '诗人先写月光，是先把触发情感的景物铺开；由“月光—疑霜—举头—低头”这一连串动作，乡愁才被一步步引出，所以属于典型的由景入情。',
    '[{"type":"text","text":"诗人先写月光，是先把触发情感的景物铺开；由“月光—疑霜—举头—低头”这一连串动作，乡愁才被一步步引出，所以属于典型的由景入情。"},{"type":"data-teacher-revision","data":{"revised":true}}]'::jsonb,
    null,
    'unclassified',
    'minimal-seed-model'
  ),
  (
    '70000000-0000-4000-8000-000000000211'::uuid,
    '70000000-0000-4000-8000-000000000201'::uuid,
    'user',
    '围绕《山居秋暝》设计两个课堂追问。',
    '[{"type":"text","text":"围绕《山居秋暝》设计两个课堂追问。"}]'::jsonb,
    null,
    'unclassified',
    null
  ),
  (
    '70000000-0000-4000-8000-000000000212'::uuid,
    '70000000-0000-4000-8000-000000000201'::uuid,
    'assistant',
    '可以追问：一是“明月松间照，清泉石上流”怎样用动静结合写出山居环境？二是诗人为什么在清幽景物后写“王孙自可留”？',
    '[{"type":"text","text":"可以追问：一是“明月松间照，清泉石上流”怎样用动静结合写出山居环境？二是诗人为什么在清幽景物后写“王孙自可留”？"}]'::jsonb,
    null,
    'unclassified',
    'minimal-seed-model'
  ),
  (
    '70000000-0000-4000-8000-000000000311'::uuid,
    '70000000-0000-4000-8000-000000000301'::uuid,
    'user',
    '这句怎么理解？',
    '[{"type":"text","text":"这句怎么理解？"}]'::jsonb,
    null,
    'unclassified',
    null
  ),
  (
    '70000000-0000-4000-8000-000000000312'::uuid,
    '70000000-0000-4000-8000-000000000301'::uuid,
    'assistant',
    '你还没有说明具体篇目或原句。请补充篇目名和原文句子，我再帮你结合古诗文语境解释。',
    '[{"type":"text","text":"你还没有说明具体篇目或原句。请补充篇目名和原文句子，我再帮你结合古诗文语境解释。"}]'::jsonb,
    null,
    'unclassified',
    'minimal-seed-model'
  )
on conflict (id) do update
set conversation_id = excluded.conversation_id,
    role = excluded.role,
    content = excluded.content,
    parts = excluded.parts,
    bloom_level = excluded.bloom_level,
    bloom_state = excluded.bloom_state,
    model_id = excluded.model_id;

insert into public.practice_records (id, student_id, project_id, target_bloom_level, prompt, answer, feedback, achieved, evaluation_state)
values
  (
    '70000000-0000-4000-8000-000000000119'::uuid,
    'a0000000-0000-0000-0000-000000000011'::uuid,
    'c0000000-0000-0000-0000-000000000101'::uuid,
    1,
    '目标核查：L1 记忆。请写出《静夜思》中直接写到月光和思乡动作的诗句。',
    '床前明月光，疑是地上霜。举头望明月，低头思故乡。',
    '能够准确回忆关键诗句，L1 达标。',
    true,
    'evaluated'
  ),
  (
    '70000000-0000-4000-8000-000000000120'::uuid,
    'a0000000-0000-0000-0000-000000000011'::uuid,
    'c0000000-0000-0000-0000-000000000101'::uuid,
    2,
    '目标核查：L2 理解。请解释“疑是地上霜”为什么能引出思乡。',
    '月光像霜一样清冷，让诗人从眼前景想到故乡夜色，所以自然引出思乡。',
    '能够用自己的话解释景物与情感之间的关系，L2 达标。',
    true,
    'evaluated'
  ),
  (
    '70000000-0000-4000-8000-000000000121'::uuid,
    'a0000000-0000-0000-0000-000000000011'::uuid,
    'c0000000-0000-0000-0000-000000000101'::uuid,
    3,
    '目标核查：L3 应用。请用“由景入情”的方法解释另一首思乡诗中的一个意象。',
    '可以先指出诗中的景物，再说明它怎样触发情感。例如看到月亮想到远方亲人，就是由景入情。',
    '能把《静夜思》的由景入情方法迁移到新语境，L3 达标。',
    true,
    'evaluated'
  )
on conflict (id) do update
set student_id = excluded.student_id,
    project_id = excluded.project_id,
    target_bloom_level = excluded.target_bloom_level,
    prompt = excluded.prompt,
    answer = excluded.answer,
    feedback = excluded.feedback,
    achieved = excluded.achieved,
    evaluation_state = excluded.evaluation_state;

insert into public.audit_records (
  id,
  source_message_id,
  source_conversation_id,
  auditor_id,
  class_id,
  kind,
  status,
  quality,
  prompt,
  original_answer,
  corrected_answer,
  chosen_answer,
  rejected_answer,
  rationale,
  metadata,
  exported_at
)
values
  (
    '70000000-0000-4000-8000-000000000131'::uuid,
    '70000000-0000-4000-8000-000000000112'::uuid,
    '70000000-0000-4000-8000-000000000101'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'b0000000-0000-0000-0000-000000000101'::uuid,
    'sft'::public.audit_kind,
    'approved'::public.audit_status,
    'needs_correction',
    '《静夜思》里为什么先写月光再写思乡？',
    '诗里先写月光，是先把眼前所见的清冷夜景摆出来；看到月色铺地，才自然引出后面的“疑是地上霜”和低头思乡。也就是说，月光是触发思乡的景物起点，思乡是由景入情的结果。',
    '诗人先写月光，是先把触发情感的景物铺开；由“月光—疑霜—举头—低头”这一连串动作，乡愁才被一步步引出，所以属于典型的由景入情。',
    null,
    null,
    '教师修订为更明确的由景入情表达。',
    '{"teacher_action":"revised","reviewed_at":"2026-05-05T17:33:40.015104Z","seed":"minimal_context_contract"}'::jsonb,
    null
  ),
  (
    '70000000-0000-4000-8000-000000000132'::uuid,
    '70000000-0000-4000-8000-000000000112'::uuid,
    '70000000-0000-4000-8000-000000000101'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'b0000000-0000-0000-0000-000000000101'::uuid,
    'dpo'::public.audit_kind,
    'approved'::public.audit_status,
    'needs_correction',
    '《静夜思》里为什么先写月光再写思乡？',
    '诗里先写月光，是先把眼前所见的清冷夜景摆出来；看到月色铺地，才自然引出后面的“疑是地上霜”和低头思乡。也就是说，月光是触发思乡的景物起点，思乡是由景入情的结果。',
    null,
    '诗人先写月光，是先把触发情感的景物铺开；由“月光—疑霜—举头—低头”这一连串动作，乡愁才被一步步引出，所以属于典型的由景入情。',
    '诗里先写月光，是先把眼前所见的清冷夜景摆出来；看到月色铺地，才自然引出后面的“疑是地上霜”和低头思乡。也就是说，月光是触发思乡的景物起点，思乡是由景入情的结果。',
    '教师修订为更明确的由景入情表达。',
    '{"teacher_action":"revised","reviewed_at":"2026-05-05T17:33:40.015104Z","seed":"minimal_context_contract"}'::jsonb,
    null
  )
on conflict (id) do update
set source_message_id = excluded.source_message_id,
    source_conversation_id = excluded.source_conversation_id,
    auditor_id = excluded.auditor_id,
    class_id = excluded.class_id,
    kind = excluded.kind,
    status = excluded.status,
    quality = excluded.quality,
    prompt = excluded.prompt,
    original_answer = excluded.original_answer,
    corrected_answer = excluded.corrected_answer,
    chosen_answer = excluded.chosen_answer,
    rejected_answer = excluded.rejected_answer,
    rationale = excluded.rationale,
    metadata = excluded.metadata,
    exported_at = excluded.exported_at,
    updated_at = now();

update public.conversation_messages m
set bloom_state = 'unclassified', bloom_level = null
from public.conversations c
where c.id = m.conversation_id
  and (
    m.role <> 'user'
    or c.source <> 'student_chat'::public.interaction_source
    or c.project_id is null
  );

update public.conversations c
set class_id = p.class_id
from public.text_projects p
where c.project_id = p.id
  and c.class_id is distinct from p.class_id;

update public.text_projects p
set highest_bloom_level = levels.highest_bloom_level,
    updated_at = now()
from (
  select project_id, max(target_bloom_level)::integer as highest_bloom_level
  from public.practice_records
  where achieved = true and evaluation_state = 'evaluated'
  group by project_id
) levels
where p.id = levels.project_id
  and p.highest_bloom_level is distinct from levels.highest_bloom_level;

update public.text_projects p
set highest_bloom_level = null,
    updated_at = now()
where not exists (
  select 1
  from public.practice_records pr
  where pr.project_id = p.id
    and pr.achieved = true
    and pr.evaluation_state = 'evaluated'
);

alter table public.conversations
  add column if not exists deleted_at timestamptz;

alter table public.documents
  add column if not exists updated_at timestamptz not null default now();

drop index if exists public.text_projects_owner_title_normalized_key;
alter table public.text_projects
  drop constraint if exists text_projects_owner_id_title_author_key;
create unique index text_projects_owner_title_normalized_key
  on public.text_projects (owner_id, lower(trim(title)));

drop trigger if exists profiles_touch on public.profiles;
drop trigger if exists classes_touch on public.classes;
drop trigger if exists provider_configs_touch on public.provider_configs;
drop trigger if exists prompt_presets_touch on public.prompt_presets;
drop trigger if exists text_projects_touch on public.text_projects;
drop trigger if exists conversations_touch on public.conversations;
drop trigger if exists documents_touch on public.documents;
drop trigger if exists audit_records_touch on public.audit_records;
drop trigger if exists mcp_servers_touch on public.mcp_servers;
drop trigger if exists model_tier_bindings_touch on public.model_tier_bindings;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger classes_touch before update on public.classes for each row execute function public.touch_updated_at();
create trigger provider_configs_touch before update on public.provider_configs for each row execute function public.touch_updated_at();
create trigger prompt_presets_touch before update on public.prompt_presets for each row execute function public.touch_updated_at();
create trigger text_projects_touch before update on public.text_projects for each row execute function public.touch_updated_at();
create trigger conversations_touch before update on public.conversations for each row execute function public.touch_updated_at();
create trigger documents_touch before update on public.documents for each row execute function public.touch_updated_at();
create trigger audit_records_touch before update on public.audit_records for each row execute function public.touch_updated_at();
create trigger mcp_servers_touch before update on public.mcp_servers for each row execute function public.touch_updated_at();
create trigger model_tier_bindings_touch before update on public.model_tier_bindings for each row execute function public.touch_updated_at();

create or replace function public.validate_class_membership_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_role text;
begin
  select p.role into profile_role
  from public.profiles p
  where p.id = new.profile_id;

  if profile_role is null then
    raise exception 'class membership profile % does not exist', new.profile_id;
  end if;

  if profile_role <> new.role::text then
    raise exception 'class membership role % does not match profile role % for %', new.role, profile_role, new.profile_id;
  end if;

  if new.role not in ('teacher'::public.app_role, 'student'::public.app_role) then
    raise exception 'class membership role must be teacher or student';
  end if;

  return new;
end
$$;

drop trigger if exists class_memberships_validate_contract on public.class_memberships;
create trigger class_memberships_validate_contract
before insert or update on public.class_memberships
for each row execute function public.validate_class_membership_contract();

create or replace function public.sync_text_project_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_role text;
  membership_class_id uuid;
begin
  new.title = trim(new.title);
  new.author = nullif(trim(coalesce(new.author, '')), '');

  if new.title = '' then
    raise exception 'project title cannot be empty';
  end if;

  if new.title in ('自动识别中的篇目', '未定篇目', '待自动归属', '待归属篇目', '未知篇目', '未识别篇目', '默认篇目', '示例篇目', '篇目标题', '篇目项目', '日常会话归档') then
    raise exception 'placeholder title % cannot be persisted as a text project', new.title;
  end if;

  select p.role into owner_role
  from public.profiles p
  where p.id = new.owner_id;

  if owner_role is distinct from 'student' then
    raise exception 'text project owner % must be a student profile', new.owner_id;
  end if;

  select cm.class_id into membership_class_id
  from public.class_memberships cm
  where cm.profile_id = new.owner_id
    and cm.role = 'student'::public.app_role
  limit 1;

  if new.class_id is null and membership_class_id is not null then
    new.class_id = membership_class_id;
  elsif new.class_id is not null and membership_class_id is null then
    raise exception 'project class % cannot be set because student % has no class membership', new.class_id, new.owner_id;
  elsif new.class_id is not null and new.class_id <> membership_class_id then
    raise exception 'project class % must match student membership class %', new.class_id, membership_class_id;
  end if;

  return new;
end
$$;

drop trigger if exists text_projects_sync_contract on public.text_projects;
create trigger text_projects_sync_contract
before insert or update on public.text_projects
for each row execute function public.sync_text_project_contract();

create or replace function public.validate_conversation_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_role text;
  project_owner_id uuid;
  project_class_id uuid;
  preset_role public.app_role;
begin
  select p.role into owner_role
  from public.profiles p
  where p.id = new.owner_id;

  if owner_role is null then
    raise exception 'conversation owner % does not exist', new.owner_id;
  end if;

  if owner_role = 'student' and new.source <> 'student_chat'::public.interaction_source then
    raise exception 'student conversations must use student_chat source';
  end if;

  if owner_role = 'teacher' and new.source <> 'teacher_chat'::public.interaction_source then
    raise exception 'teacher conversations must use teacher_chat source';
  end if;

  if new.source = 'student_chat'::public.interaction_source then
    if owner_role <> 'student' then
      raise exception 'student_chat conversations must be owned by student profiles';
    end if;

    if new.prompt_preset_id is not null then
      raise exception 'student conversations cannot bind teacher prompt presets';
    end if;

    if new.project_id is null then
      new.class_id = null;
    else
      select p.owner_id, p.class_id into project_owner_id, project_class_id
      from public.text_projects p
      where p.id = new.project_id;

      if project_owner_id is null then
        raise exception 'conversation project % does not exist', new.project_id;
      end if;

      if project_owner_id <> new.owner_id then
        raise exception 'conversation owner % must match project owner %', new.owner_id, project_owner_id;
      end if;

      new.class_id = project_class_id;
    end if;
  elsif new.source = 'teacher_chat'::public.interaction_source then
    if owner_role <> 'teacher' then
      raise exception 'teacher_chat conversations must be owned by teacher profiles';
    end if;

    if new.project_id is not null or new.class_id is not null then
      raise exception 'teacher Q&A conversations cannot bind student projects or classes';
    end if;

    if new.prompt_preset_id is not null then
      select pp.target_role into preset_role
      from public.prompt_presets pp
      where pp.id = new.prompt_preset_id;

      if preset_role is distinct from 'teacher'::public.app_role then
        raise exception 'teacher Q&A prompt preset must target teacher role';
      end if;
    end if;
  else
    raise exception 'conversation source % is deprecated for product conversations', new.source;
  end if;

  return new;
end
$$;

drop trigger if exists conversations_validate_contract on public.conversations;
create trigger conversations_validate_contract
before insert or update on public.conversations
for each row execute function public.validate_conversation_contract();

create or replace function public.prevent_text_project_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'text projects are stable learning units and cannot be hard-deleted';
end
$$;

drop trigger if exists text_projects_prevent_delete on public.text_projects;
create trigger text_projects_prevent_delete
before delete on public.text_projects
for each row execute function public.prevent_text_project_delete();

create or replace function public.validate_conversation_message_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_source public.interaction_source;
  conversation_project_id uuid;
begin
  select c.source, c.project_id into conversation_source, conversation_project_id
  from public.conversations c
  where c.id = new.conversation_id;

  if conversation_source is null then
    raise exception 'message conversation % does not exist', new.conversation_id;
  end if;

  if new.role <> 'user'
    or conversation_source <> 'student_chat'::public.interaction_source
    or conversation_project_id is null then
    new.bloom_state = 'unclassified';
    new.bloom_level = null;
  elsif new.bloom_state <> 'classified' then
    new.bloom_level = null;
  elsif new.bloom_level is null then
    raise exception 'classified student project questions require bloom_level';
  end if;

  return new;
end
$$;

drop trigger if exists conversation_messages_validate_contract on public.conversation_messages;
create trigger conversation_messages_validate_contract
before insert or update on public.conversation_messages
for each row execute function public.validate_conversation_message_contract();

create or replace function public.validate_practice_record_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_owner_id uuid;
begin
  if new.project_id is null then
    raise exception 'challenge records must belong to a text project';
  end if;

  select p.owner_id into project_owner_id
  from public.text_projects p
  where p.id = new.project_id;

  if project_owner_id is null then
    raise exception 'challenge project % does not exist', new.project_id;
  end if;

  if project_owner_id <> new.student_id then
    raise exception 'challenge student % must match project owner %', new.student_id, project_owner_id;
  end if;

  if new.achieved = true and new.evaluation_state <> 'evaluated' then
    raise exception 'achieved challenges must be evaluated';
  end if;

  return new;
end
$$;

drop trigger if exists practice_records_validate_contract on public.practice_records;
create trigger practice_records_validate_contract
before insert or update on public.practice_records
for each row execute function public.validate_practice_record_contract();

create or replace function public.refresh_project_highest_bloom_level(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_project_id is null then
    return;
  end if;

  update public.text_projects p
  set highest_bloom_level = (
    select max(pr.target_bloom_level)::integer
    from public.practice_records pr
    where pr.project_id = p_project_id
      and pr.achieved = true
      and pr.evaluation_state = 'evaluated'
  )
  where p.id = p_project_id;
end
$$;

create or replace function public.sync_project_highest_bloom_from_practice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_project_highest_bloom_level(old.project_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_project_highest_bloom_level(new.project_id);
  end if;

  return null;
end
$$;

drop trigger if exists practice_records_sync_project_bloom on public.practice_records;
create trigger practice_records_sync_project_bloom
after insert or update or delete on public.practice_records
for each row execute function public.sync_project_highest_bloom_from_practice();

create or replace function public.validate_audit_record_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  message_role text;
  message_conversation_id uuid;
  conversation_source public.interaction_source;
  conversation_project_id uuid;
  conversation_class_id uuid;
  current_user_id uuid;
begin
  select m.role, m.conversation_id into message_role, message_conversation_id
  from public.conversation_messages m
  where m.id = new.source_message_id;

  if message_role is null then
    raise exception 'audit source message % does not exist', new.source_message_id;
  end if;

  if message_role <> 'assistant' then
    raise exception 'only assistant answers can enter learning-record verification';
  end if;

  if new.source_conversation_id is null then
    new.source_conversation_id = message_conversation_id;
  elsif new.source_conversation_id <> message_conversation_id then
    raise exception 'audit source conversation must match source message conversation';
  end if;

  select c.source, c.project_id, c.class_id
  into conversation_source, conversation_project_id, conversation_class_id
  from public.conversations c
  where c.id = new.source_conversation_id;

  if conversation_source <> 'student_chat'::public.interaction_source
    or conversation_project_id is null
    or conversation_class_id is null then
    raise exception 'only student project conversations can enter learning-record verification';
  end if;

  if new.class_id is null then
    new.class_id = conversation_class_id;
  elsif new.class_id <> conversation_class_id then
    raise exception 'audit class must match source conversation class';
  end if;

  current_user_id = public.current_app_user_id();
  if current_user_id is not null and not public.is_admin() then
    if new.auditor_id is distinct from current_user_id then
      raise exception 'teacher audit auditor_id must match current user';
    end if;

    if not public.teacher_can_access_class(new.class_id) then
      raise exception 'teacher cannot audit records outside assigned class';
    end if;
  end if;

  if new.status in ('approved'::public.audit_status, 'exported'::public.audit_status) then
    if new.kind = 'sft'::public.audit_kind
      and nullif(trim(coalesce(new.corrected_answer, new.original_answer, new.chosen_answer, '')), '') is null then
      raise exception 'approved/exported SFT records require an assistant answer';
    end if;

    if new.kind = 'dpo'::public.audit_kind then
      if nullif(trim(coalesce(new.chosen_answer, new.corrected_answer, '')), '') is null
        or nullif(trim(coalesce(new.rejected_answer, new.original_answer, '')), '') is null then
        raise exception 'approved/exported DPO records require chosen and rejected answers';
      end if;

      if trim(coalesce(new.chosen_answer, new.corrected_answer, '')) = trim(coalesce(new.rejected_answer, new.original_answer, '')) then
        raise exception 'DPO chosen and rejected answers must differ';
      end if;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists audit_records_validate_contract on public.audit_records;
create trigger audit_records_validate_contract
before insert or update on public.audit_records
for each row execute function public.validate_audit_record_contract();

create or replace function public.validate_document_scope_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_owner_id uuid;
  conversation_class_id uuid;
  conversation_project_id uuid;
begin
  if new.conversation_id is not null then
    select c.owner_id, c.class_id, c.project_id
    into conversation_owner_id, conversation_class_id, conversation_project_id
    from public.conversations c
    where c.id = new.conversation_id;

    if conversation_owner_id is null then
      raise exception 'document conversation % does not exist', new.conversation_id;
    end if;

    if new.owner_id <> conversation_owner_id then
      raise exception 'document owner must match conversation owner';
    end if;

    new.class_id = conversation_class_id;
    new.project_id = conversation_project_id;
  end if;

  return new;
end
$$;

drop trigger if exists documents_validate_scope_contract on public.documents;
create trigger documents_validate_scope_contract
before insert or update on public.documents
for each row execute function public.validate_document_scope_contract();

create or replace function public.validate_document_chunk_scope_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  document_owner_id uuid;
  document_class_id uuid;
  document_project_id uuid;
  document_conversation_id uuid;
begin
  select d.owner_id, d.class_id, d.project_id, d.conversation_id
  into document_owner_id, document_class_id, document_project_id, document_conversation_id
  from public.documents d
  where d.id = new.document_id;

  if document_owner_id is null then
    raise exception 'chunk document % does not exist', new.document_id;
  end if;

  new.owner_id = document_owner_id;
  new.class_id = document_class_id;
  new.project_id = document_project_id;
  new.conversation_id = document_conversation_id;
  return new;
end
$$;

drop trigger if exists document_chunks_validate_scope_contract on public.document_chunks;
create trigger document_chunks_validate_scope_contract
before insert or update on public.document_chunks
for each row execute function public.validate_document_chunk_scope_contract();

alter table public.practice_records
  alter column project_id set not null;

alter table public.audit_records
  alter column source_message_id set not null,
  alter column source_conversation_id set not null,
  alter column class_id set not null;

alter table public.conversations
  drop constraint if exists conversations_project_id_fkey;
alter table public.conversations
  add constraint conversations_project_id_fkey
  foreign key (project_id) references public.text_projects(id) on delete restrict;

alter table public.practice_records
  drop constraint if exists practice_records_project_id_fkey;
alter table public.practice_records
  add constraint practice_records_project_id_fkey
  foreign key (project_id) references public.text_projects(id) on delete restrict;

alter table public.audit_records
  drop constraint if exists audit_records_source_message_id_fkey;
alter table public.audit_records
  add constraint audit_records_source_message_id_fkey
  foreign key (source_message_id) references public.conversation_messages(id) on delete restrict;

alter table public.audit_records
  drop constraint if exists audit_records_source_conversation_id_fkey;
alter table public.audit_records
  add constraint audit_records_source_conversation_id_fkey
  foreign key (source_conversation_id) references public.conversations(id) on delete restrict;

create index if not exists conversations_active_owner_idx
  on public.conversations (owner_id, updated_at desc)
  where deleted_at is null;

create index if not exists conversations_daily_archive_idx
  on public.conversations (owner_id, updated_at desc)
  where source = 'student_chat'::public.interaction_source
    and project_id is null
    and deleted_at is null;

create index if not exists audit_records_exportable_idx
  on public.audit_records (kind, status, updated_at desc)
  where status in ('approved'::public.audit_status, 'exported'::public.audit_status);

select public.refresh_project_highest_bloom_level('c0000000-0000-0000-0000-000000000101'::uuid);

notify pgrst, 'reload schema';
commit;
