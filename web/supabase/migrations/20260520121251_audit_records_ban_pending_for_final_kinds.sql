-- HISTORICAL — superseded by 20260520123251_audit_status_collapse_to_terminal_states.
--
-- Original intent: prevent inserting status='pending' for any audit_kind by
-- raising an exception inside validate_audit_record_contract.
--
-- Why superseded: the next migration removes 'pending' from the audit_status
-- enum entirely. The exception branch added below becomes structurally
-- impossible to reach (the type system rejects the input first), so the
-- collapse migration rewrites this function without it.
--
-- This file is kept as a no-op to preserve the cloud migration ledger.

CREATE OR REPLACE FUNCTION public.validate_audit_record_contract()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
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

  IF conversation_source <> 'student_chat'::public.interaction_source
      OR conversation_project_id IS NULL
      OR conversation_class_id IS NULL THEN
    RAISE EXCEPTION 'only student project conversations can enter learning-record verification';
  END IF;

  IF new.class_id IS NULL THEN
    new.class_id = conversation_class_id;
  ELSIF new.class_id <> conversation_class_id THEN
    RAISE EXCEPTION 'audit class must match source conversation class';
  END IF;

  current_user_id = public.current_app_user_id();
  IF current_user_id IS NOT NULL AND NOT public.is_admin() THEN
    IF new.auditor_id IS DISTINCT FROM current_user_id THEN
      RAISE EXCEPTION 'teacher audit auditor_id must match current user';
    END IF;
    IF NOT public.teacher_can_access_class(new.class_id) THEN
      RAISE EXCEPTION 'teacher cannot audit records outside assigned class';
    END IF;
  END IF;

  IF new.status = 'pending'::public.audit_status
      AND new.kind IN ('sft'::public.audit_kind, 'dpo'::public.audit_kind, 'metadata'::public.audit_kind) THEN
    RAISE EXCEPTION
      'audit_records of kind % cannot be inserted with status=pending; use approved directly',
      new.kind;
  END IF;

  IF new.status IN ('approved'::public.audit_status, 'exported'::public.audit_status) THEN
    IF new.kind = 'sft'::public.audit_kind
        AND nullif(trim(coalesce(new.corrected_answer, new.original_answer, new.chosen_answer, '')), '') IS NULL THEN
      RAISE EXCEPTION 'approved/exported SFT records require an assistant answer';
    END IF;
    IF new.kind = 'dpo'::public.audit_kind THEN
      IF nullif(trim(coalesce(new.chosen_answer, new.corrected_answer, '')), '') IS NULL
          OR nullif(trim(coalesce(new.rejected_answer, new.original_answer, '')), '') IS NULL THEN
        RAISE EXCEPTION 'approved/exported DPO records require chosen and rejected answers';
      END IF;
      IF trim(coalesce(new.chosen_answer, new.corrected_answer, ''))
           = trim(coalesce(new.rejected_answer, new.original_answer, '')) THEN
        RAISE EXCEPTION 'DPO chosen and rejected answers must differ';
      END IF;
    END IF;
  END IF;

  RETURN new;
END $$;
