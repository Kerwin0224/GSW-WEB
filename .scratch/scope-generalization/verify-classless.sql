-- ═══════════════════════════════════════════════════════════════════════════
-- 无班级学生端到端验证：造样本 → 读 → 核实 → 整段回滚
-- ═══════════════════════════════════════════════════════════════════════════
-- 跑法：
--     cd web && supabase db query --linked -f ../.scratch/scope-generalization/verify-classless.sql
--
-- 为什么必须造样本：生产库里每个学生都有行政班（探针 p05_classless_conv_count = 0），
-- 所以「无班级学生的数据对管理员静默不可见」这个缺陷在真实数据上**测不出来**——
-- 修好修坏探针都是绿的。修复目标必须自己造一个无班级学生才能验证。
--
-- 全程包在事务里，末尾 rollback，生产库不留痕。

begin;

create or replace function pg_temp.act_as(p_user uuid) returns void
  language plpgsql as $fn$
declare
  v_subject text;
begin
  select case when p.session_version = 0 then p.id::text
              else p.id::text || ':' || p.session_version::text end
    into v_subject
    from public.profiles p
   where p.id = p_user and p.status = 'active';
  if v_subject is null then
    raise exception '探针：profile % 不存在或非 active，无法立身份', p_user;
  end if;
  perform set_config('request.headers', jsonb_build_object(
    'x-cwb-user-id', p_user::text,
    'x-cwb-session-signature',
    encode(hmac(v_subject::bytea,
                (select value from private.runtime_secrets where name = 'cwb_auth_secret')::bytea,
                'sha256'), 'hex')
  )::text, true);
end $fn$;

-- ── 以 postgres 身份造样本（绕过 RLS 的唯一合法用途）──────────────────────
-- 借一个真实的「教师 + 空间 + 学校」三元组，只新增一个没有 class_memberships 的学生。
select set_config('probe.teacher', coalesce((
  select s.owner_id::text from public.spaces s
   join public.profiles p on p.id = s.owner_id and p.role='teacher' and p.status='active'
   join public.classes c on c.school_id = s.school_id
  limit 1), ''), true);
select set_config('probe.admin', coalesce((
  select p.id::text from public.profiles p
   where p.role='admin' and p.status='active' limit 1), ''), true);
select set_config('probe.school', coalesce((
  select s.school_id::text from public.spaces s
   where s.owner_id = nullif(current_setting('probe.teacher', true),'')::uuid limit 1), ''), true);
select set_config('probe.space', coalesce((
  select s.id::text from public.spaces s
   where s.owner_id = nullif(current_setting('probe.teacher', true),'')::uuid limit 1), ''), true);

-- 造样本整体放进 DO 块：INSERT ... RETURNING ... INTO 是 plpgsql 专有语法，
-- 顶层 SQL 里写不了；顺带把四个 id 都落进 GUC 供后续身份模拟引用。
do $mk$
declare
  v_school uuid := nullif(current_setting('probe.school', true),'')::uuid;
  v_space  uuid := nullif(current_setting('probe.space', true),'')::uuid;
  v_student uuid;
  v_project uuid;
  v_conv    uuid;
  v_asst    uuid;
begin
  -- profiles.id 外键指向 auth.users，锚点行照 provision_school_account 的写法建
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (gen_random_uuid(), '99000001@accounts.internal', 'provisioned', now(), now(), now())
  returning id into v_student;

  insert into public.profiles (id, role, display_name, status, login_id, school_id, organization_id, password_hash)
  values (v_student, 'student', '探针无班级学生', 'active', '99000001', v_school,
          (select org_id from public.schools where id = v_school),
          extensions.crypt('99000001', extensions.gen_salt('bf')));
  perform set_config('probe.classless', v_student::text, true);

  -- 空间直接成员：空间是教师侧的兜底授权来源，必须能覆盖没有行政班的学生
  insert into public.space_members (space_id, student_id)
  values (v_space, v_student) on conflict do nothing;

  insert into public.projects (owner_id, name, class_id, space_id)
  values (v_student, '探针项目', null, v_space)
  returning id into v_project;

  insert into public.conversations (owner_id, title, source, project_id, space_id)
  values (v_student, '探针会话', 'student_chat', v_project, v_space)
  returning id into v_conv;
  perform set_config('probe.conv', v_conv::text, true);
  perform set_config('probe.project', v_project::text, true);
  perform set_config('probe.asst', 'x', true);

  insert into public.conversation_messages (conversation_id, role, content)
  values (v_conv, 'user', '探针提问');
  insert into public.conversation_messages (conversation_id, role, content)
  values (v_conv, 'assistant', '探针回答')
  returning id into v_asst;
  perform set_config('probe.asst', v_asst::text, true);
end $mk$;

select set_config('probe.z1_project_school_anchor', coalesce((
  select case when school_id is not null then '是' else '否 —— 触发器没生效' end
    from public.projects where id = nullif(current_setting('probe.project', true),'')::uuid), '（无）'), true);
select set_config('probe.z1_conv_class_is_null', coalesce((
  select case when class_id is null then '是（无班级会话）' else '否' end
    from public.conversations where id = nullif(current_setting('probe.conv', true),'')::uuid), '（无）'), true);

-- 1 · 教师能否读到自己空间里无班级学生的会话（空间分支）
select pg_temp.act_as(nullif(current_setting('probe.teacher', true), '')::uuid);
set local role anon;
select set_config('probe.a_teacher_reads_conv', (
  select case when count(*) > 0 then '是（读到 ' || count(*)::text || ' 条）' else '否 —— 读不到' end
    from public.conversations where id = nullif(current_setting('probe.conv', true),'')::uuid), true);
select set_config('probe.a_teacher_reads_msg', (
  select count(*)::text from public.conversation_messages where conversation_id = nullif(current_setting('probe.conv', true),'')::uuid), true);
select set_config('probe.a_teacher_reads_project', (
  select count(*)::text from public.projects where id = nullif(current_setting('probe.project', true),'')::uuid), true);
reset role;

-- 2 · 校管理员能否读到（此前这一路对无班级学生恒为空集）
select pg_temp.act_as(nullif(current_setting('probe.admin', true), '')::uuid);
set local role anon;
select set_config('probe.b_admin_reads_conv', (
  select case when count(*) > 0 then '是（读到 ' || count(*)::text || ' 条）' else '否 —— 仍然静默不可见' end
    from public.conversations where id = nullif(current_setting('probe.conv', true),'')::uuid), true);
select set_config('probe.b_admin_reads_project', (
  select count(*)::text from public.projects where id = nullif(current_setting('probe.project', true),'')::uuid), true);

-- 3 · 能否为无班级会话产生核实记录（此前 audit_records.class_id NOT NULL 直接挡住）
-- 真正执行 INSERT：异常会被 RLS 抛出来，用 exception 捕获写进 GUC，否则整段中止看不出原因。
do $ins$
begin
  insert into public.audit_records (
    source_message_id, source_conversation_id, class_id, kind, quality,
    prompt, original_answer, auditor_id
  ) values (
    nullif(current_setting('probe.asst', true),'')::uuid,
    nullif(current_setting('probe.conv', true),'')::uuid,
    null, 'sft', 'accurate',
    '探针提问', '探针回答',
    public.current_app_user_id()
  );
  perform set_config('probe.c_audit_write', 'INSERT 无异常', true);
exception when others then
  perform set_config('probe.c_audit_write', 'INSERT 被拒：' || sqlerrm, true);
end $ins$;

select set_config('probe.c_audit_insert', coalesce((
  select case when count(*) > 0 then '成功（写入 ' || count(*)::text || ' 条，class_id='
                    || coalesce((array_agg(class_id::text))[1], 'NULL') || '）' else '失败：0 条' end
    from public.audit_records
   where source_conversation_id = nullif(current_setting('probe.conv', true),'')::uuid
     and source_message_id = nullif(current_setting('probe.asst', true),'')::uuid
     and auditor_id = public.current_app_user_id()
     and kind = 'sft'), '（异常）'), true);
select set_config('probe.c_audit_teacher_readback', (
  select case when count(*) > 0 then '是' else '否' end from public.audit_records
   where source_conversation_id = nullif(current_setting('probe.conv', true),'')::uuid), true);
reset role;

-- 4 · 学生本人仍能读自己的数据（收窄过头检查）
select pg_temp.act_as(nullif(current_setting('probe.classless', true),'')::uuid);
set local role anon;
select set_config('probe.d_student_reads_own', (
  select case when count(*) > 0 then '是' else '否 —— 误伤' end
    from public.conversations where id = nullif(current_setting('probe.conv', true),'')::uuid), true);
reset role;

-- 5 · 越权检查：另一个班的教师不能读到这条无班级会话
select set_config('probe.other_teacher', coalesce((
  select cm.profile_id::text from public.class_memberships cm
   join public.profiles p on p.id = cm.profile_id and p.role='teacher' and p.status='active'
   join public.spaces s on s.owner_id = cm.profile_id
   join public.classes c on c.school_id = s.school_id and c.id = cm.class_id
  limit 1), ''), true);
select pg_temp.act_as(nullif(current_setting('probe.other_teacher', true), '')::uuid);
set local role anon;
select set_config('probe.e_unrelated_teacher_blocked', coalesce((
  select case when count(*) = 0 then '是（读不到）' else '否 —— 越权泄漏 ' || count(*)::text || ' 条' end
    from public.conversations where id = nullif(current_setting('probe.conv', true),'')::uuid), '（无对照教师样本，跳过）'), true);
reset role;

-- ── 汇总（必须在 rollback 之前，本地 GUC 会随回滚丢弃）────────────────────
select * from (values
  ('0 造样本', '教师存在',              case when current_setting('probe.teacher', true) = '' then '无样本' else '是' end),
  ('0 造样本', '学校 / 空间已定位',       case when current_setting('probe.space', true) = '' then '否' else '是' end),
  ('0 造样本', '项目自动带上 school_id',  coalesce(nullif(current_setting('probe.z1_project_school_anchor', true), ''), '（无）')),
  ('0 造样本', '会话 class_id 确为 NULL',  coalesce(nullif(current_setting('probe.z1_conv_class_is_null', true), ''), '（无）')),
  ('1 教师',   '读无班级学生会话',        coalesce(nullif(current_setting('probe.a_teacher_reads_conv', true), ''), '（未执行）')),
  ('1 教师',   '读该会话的消息',          coalesce(nullif(current_setting('probe.a_teacher_reads_msg', true), ''), '（未执行）')),
  ('1 教师',   '读该项目',              coalesce(nullif(current_setting('probe.a_teacher_reads_project', true), ''), '（未执行）')),
  ('2 校admin','读无班级学生会话（修复目标）', coalesce(nullif(current_setting('probe.b_admin_reads_conv', true), ''), '（未执行）')),
  ('2 校admin','读该学生项目',            coalesce(nullif(current_setting('probe.b_admin_reads_project', true), ''), '（未执行）')),
  ('3 核实',   'INSERT 语句本身',          coalesce(nullif(current_setting('probe.c_audit_write', true), ''), '（未执行）')),
  ('3 核实',   '为无班级会话写核实记录',     coalesce(nullif(current_setting('probe.c_audit_insert', true), ''), '（未执行）')),
  ('3 核实',   '写完能被读回',            coalesce(nullif(current_setting('probe.c_audit_teacher_readback', true), ''), '（未执行）')),
  ('4 收窄',   '学生本人仍读得到自己',       coalesce(nullif(current_setting('probe.d_student_reads_own', true), ''), '（未执行）')),
  ('5 越权',   '无关教师读不到',           coalesce(nullif(current_setting('probe.e_unrelated_teacher_blocked', true), ''), '（未执行）'))
) report("分区", "检查项", "结果");

rollback;
