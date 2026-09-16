-- 会话核实状态归位：从 audit_records 的 JSON metadata 迁到 conversations 列。
--
-- 第一性原理：状态和事件是两回事。
--   conversations.finalized_at  —— 会话当前是否已被教师最终核实（1:1，就是列）
--   audit_records               —— SFT/DPO 教学样本（事件流，1:N）
-- 此前把「已核实」塞进 audit_records.metadata->>'teacher_action'，等于用事件日志
-- 表达当前状态，代价是所有读者都要扫日志推导：
--   · 学生继续追问 / 回滚：要 join audit_records 扫 JSON 才能判断
--   · 教师审核队列：只能「取 500 条消息 → JS 推导会话状态 → 截前 30 个」，
--     而截断发生在推导之前，已核实的会话照样占坑，把未核实的静默挤出去（真 bug）
--   · 导出：还要再按 metadata 二次过滤
-- 归位后这些读者都变成对列的直接判断，教师队列也能在 SQL 里按「未核实」分页。

-- ── 1. 加列 ─────────────────────────────────────────────────────────────────

alter table public.conversations
  add column if not exists finalized_at timestamptz;

comment on column public.conversations.finalized_at is
  '教师完成整个会话核实并最终提交的时刻；NULL 表示未核实。学生侧据此禁止继续追问。'
  '来源已由 audit_records.metadata 回填；此后由 finalizeLearningConversation 写入。';

-- ── 2. 回填：取每个会话最后一次 conversation_finalized 事件 ────────────────

update public.conversations c
set finalized_at = sub.finalized_at
from (
  select
    ar.source_conversation_id as conversation_id,
    max(coalesce((ar.metadata ->> 'finalized_at')::timestamptz, ar.created_at)) as finalized_at
  from public.audit_records ar
  where ar.kind = 'metadata'
    and ar.status in ('approved', 'exported')
    and ar.metadata ->> 'teacher_action' = 'conversation_finalized'
    and ar.source_conversation_id is not null
  group by ar.source_conversation_id
) sub
where c.id = sub.conversation_id
  and c.finalized_at is null;

-- ── 3. 队列索引：教师审核队列的核心查询是「我这些班里未核实的会话，按新到旧」──
-- 部分索引只覆盖未核实行，随核实推进自动缩小。

create index if not exists "conversations_pending_audit_idx"
  on public.conversations (class_id, updated_at desc)
  where finalized_at is null
    and deleted_at is null
    and source = 'student_chat';

-- ── 4. RPC 改读列：去掉 join audit_records 扫 JSON ─────────────────────────
-- 语义不变（仍限本人、仍限 student_chat、仍限未删除），只是不再扫事件日志。

create or replace function public.is_student_conversation_finalized(p_conversation_id uuid) returns boolean
  language sql stable security definer
  set search_path to 'public'
  as $$
    select exists (
      select 1
      from public.conversations c
      where c.id = p_conversation_id
        and c.owner_id = public.current_app_user_id()
        and c.source = 'student_chat'
        and c.deleted_at is null
        and c.finalized_at is not null
    )
  $$;

-- ── 6. 教师必须能读到本班学生档案 ───────────────────────────────────────────
-- 真 bug：profiles 上的 select 策略是「本人 or can_admin_profile(id)」，而
-- can_admin_profile 只有 admin / org_admin 分支 —— 教师读不到任何学生档案。
-- 后果：教师审核队列里 profiles(display_name) 被 RLS 过滤成 null，
-- 每个学生都显示成兜底文案「学生」，教师根本无法知道这是谁的对话。
--
-- 第一性表述：教师可以读「自己所教班级的成员」的档案。
-- 复用已有的 teacher_can_access_class（已含学校边界），不新增判定维度。

drop policy if exists "profiles_class_member_read" on public.profiles;
create policy "profiles_class_member_read" on public.profiles for select
  using (
    exists (
      select 1 from public.class_memberships cm
      where cm.profile_id = profiles.id
        and public.teacher_can_access_class(cm.class_id)
    )
  );

-- ── 7. 自检 ─────────────────────────────────────────────────────────────────

do $$
declare
  v_backfilled integer;
begin
  select count(*) into v_backfilled from public.conversations where finalized_at is not null;
  raise notice 'conversations.finalized_at 就位；回填 % 条已核实会话', v_backfilled;
  if not exists (
    select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_class_member_read'
  ) then
    raise exception 'profiles_class_member_read missing after migration';
  end if;
  raise notice 'profiles: 教师可读本班成员档案';
end $$;
