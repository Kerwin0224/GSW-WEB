-- Fix CONTEXT.md rule: "会话级最终提交后，该会话进入已核实状态，学生侧不能在这个会话继续追问"
--
-- Gap found during review: messages_owner_insert RLS policy only checks owner_id,
-- and validate_conversation_message_contract trigger only did bloom_state logic.
-- Neither blocked student inserts into finalized conversations.
--
-- Solution: Extend validate_conversation_message_contract to:
--   1. Block inserts into soft-deleted conversations
--   2. Block student user-role inserts into finalized conversations
--      (finalization = audit_records with kind='metadata', status in approved/exported,
--       metadata->>'teacher_action' = 'conversation_finalized')

create or replace function public.validate_conversation_message_contract()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  conversation_source public.interaction_source;
  conversation_project_id uuid;
  conversation_deleted_at timestamptz;
  is_finalized boolean;
begin
  select c.source, c.project_id, c.deleted_at
    into conversation_source, conversation_project_id, conversation_deleted_at
    from public.conversations c where c.id = new.conversation_id;

  if conversation_source is null then
    raise exception 'message conversation % does not exist', new.conversation_id;
  end if;

  -- Block inserts into soft-deleted conversations
  if conversation_deleted_at is not null then
    raise exception 'cannot add messages to a deleted conversation';
  end if;

  -- Block student inserts into finalized conversations (CONTEXT.md rule)
  if tg_op = 'INSERT' and new.role = 'user' and conversation_source = 'student_chat' then
    select exists (
      select 1 from public.audit_records ar
      where ar.source_conversation_id = new.conversation_id
        and ar.kind = 'metadata'::public.audit_kind
        and ar.status in ('approved'::public.audit_status, 'exported'::public.audit_status)
        and ar.metadata ->> 'teacher_action' = 'conversation_finalized'
    ) into is_finalized;

    if is_finalized then
      raise exception 'cannot add messages to a finalized conversation; please start a new conversation';
    end if;
  end if;

  -- Bloom state logic (unchanged)
  if new.role <> 'user' or conversation_source <> 'student_chat'::public.interaction_source or conversation_project_id is null then
    new.bloom_state = 'unclassified'; new.bloom_level = null;
  elsif new.bloom_state <> 'classified' then
    new.bloom_level = null;
  elsif new.bloom_level is null then
    raise exception 'classified student project questions require bloom_level';
  end if;

  return new;
end $$;
