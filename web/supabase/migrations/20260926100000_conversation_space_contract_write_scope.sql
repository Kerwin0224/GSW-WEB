-- conversations 的空间契约触发器：**归属判定只在归属真的变了的时候跑**。
--
-- 事故（20260926090000 引入）：那个触发器挂在 `before insert or update`（全列）上，
-- 于是它把「谁在改这一行」当成了「这一行归谁管」。两种写路径因此被打死：
--
--   1. 教师写 conversations.finalized_at（finalizeLearningConversation）
--      —— source='student_chat'、owner_id=学生、current_app_user_id()=教师，
--      `new.owner_id <> current_app_user_id()` 恒真 → 42501，核实状态永远写不进去。
--   2. 学生软删自己的会话（deleted_at）—— 只要他已被移出该空间，is_my_space 为假 → 42501。
--
-- 事实是：这一列（space_id / owner_id / source）没变时，"这条会话是不是这个学生
-- 自己空间里的学习记录" 这个命题根本没被重新表述过，用当前身份重判它只会误伤。
-- RLS 才是行的授权真源；触发器只负责**写时不变量**（不变量只在相关列被改动时才可能被破坏）。
--
-- 修法：把归属判定限定在 tg_op='INSERT' 或三列任一 distinct from old 之内。
-- 用嵌套 if 而不是 `tg_op = 'INSERT' or new.space_id is distinct from old.space_id`：
-- INSERT 时 OLD 未赋值，PL/pgSQL 表达式交给 SQL 求值而 SQL 不保证 OR 短路，
-- 那样写会在插入路径上直接报 record "old" is not assigned yet。
--
-- 项目空间对齐那段（new.space_id := 项目空间 / 不一致就报错）**不动**，它本来就是
-- 任何写入口都要钉住的不变量，空间没变时天然是 no-op。注意 v_scope_changed 必须在
-- 这段之后算——它可能刚把 new.space_id 从 NULL 推成项目的空间。

create or replace function public.validate_conversation_space_contract()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_project_space uuid;
  v_scope_changed boolean;
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

  if tg_op = 'INSERT' then
    v_scope_changed := true;
  else
    v_scope_changed := new.space_id is distinct from old.space_id
      or new.owner_id is distinct from old.owner_id
      or new.source is distinct from old.source;
  end if;

  if v_scope_changed
     and new.space_id is not null
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

drop trigger if exists conversations_validate_space_contract on public.conversations;
create trigger conversations_validate_space_contract
before insert or update on public.conversations
for each row execute function public.validate_conversation_space_contract();

-- 自检：谓词被删掉不会有任何类型错误，只会让核实与软删静默 42501。
do $$
declare
  v_src text;
begin
  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'validate_conversation_space_contract';

  if v_src is null then
    raise exception 'validate_conversation_space_contract missing';
  end if;
  if position('v_scope_changed' in v_src) = 0 then
    raise exception 'validate_conversation_space_contract lost its write-scope guard';
  end if;
  if position('new.owner_id is distinct from old.owner_id' in v_src) = 0 then
    raise exception 'the guard must watch owner_id changes too';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'conversations_validate_space_contract' and not tgisinternal
  ) then
    raise exception 'conversations_validate_space_contract trigger missing';
  end if;

  raise notice 'conversations 空间契约：归属判定只在 space_id/owner_id/source 变化时执行';
end $$;
