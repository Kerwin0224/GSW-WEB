-- Extend dataset export kinds for teacher review metadata.
-- This keeps SFT/DPO export behavior intact while allowing admins to export
-- the review trail required by the 05-05 UI/UX end-to-end loop.
alter type public.audit_kind add value if not exists 'review_metadata';

-- Allow teachers to persist an inline revision of an assistant answer when the
-- source conversation belongs to one of their classes. Student-owned inserts
-- remain covered by messages_owner_insert; this policy is intentionally scoped
-- to assistant rows only so teachers cannot rewrite student questions.
drop policy if exists messages_teacher_update_assistant on public.conversation_messages;
create policy messages_teacher_update_assistant on public.conversation_messages
  for update
  using (
    role = 'assistant'
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.class_id is not null
        and public.teacher_can_access_class(c.class_id)
    )
  )
  with check (
    role = 'assistant'
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.class_id is not null
        and public.teacher_can_access_class(c.class_id)
    )
  );
