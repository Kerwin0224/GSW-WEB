-- =============================================================================
-- Eliminate audit_status ghost states ('pending', 'rejected').
--
-- First-principles rationale (recorded in CONTEXT.md):
--   - audit_records are written ONLY when a teacher acts (revision draft, pre-review,
--     conversation finalization, SFT/DPO materialization).
--   - Every existing write path inserts directly with status='approved'.
--   - validate_audit_record_contract already raises an exception on any insert
--     with status='pending' (kind ∈ sft/dpo/metadata = the entire kind enum),
--     so 'pending' is unreachable in production paths.
--   - 'rejected' was only referenced by the on_conversation_soft_delete trigger
--     (created earlier in this session) acting on hypothetical 'pending' rows
--     that, by the rule above, can never exist. The trigger is therefore dead
--     code and must be dropped.
--   - 26 / 26 audit_records in the cloud are 'approved'. No row has ever been
--     'pending' or 'rejected'.
--
-- Conclusion: 'status' is a binary "has this approved sample been shipped to
-- export_batches yet?" flag, miscoded as a 4-value enum. Collapsing it removes
-- a domain hazard ("a future dev will reach for pending and discover it can't
-- be reached") without changing any real behavior.
-- =============================================================================

-- 0. Drop the soft-delete trigger that targeted ghost 'pending' rows.
--    With 'pending' removed, this trigger has no rows to act on. Keeping it would
--    require resurrecting the ghost states. CONTEXT.md already covers the
--    "approved/exported rows survive soft-delete as a compliance exception".
DROP TRIGGER IF EXISTS conversations_on_soft_delete ON public.conversations;
DROP FUNCTION IF EXISTS public.on_conversation_soft_delete();

-- 1. Drop indexes that reference audit_status literals (will be recreated).
DROP INDEX IF EXISTS public.audit_records_exportable_idx;
DROP INDEX IF EXISTS public.audit_records_class_time_idx;
DROP INDEX IF EXISTS public.audit_records_auditor_time_idx;

-- 2. Drop RLS policy that references audit_status (will be recreated).
DROP POLICY IF EXISTS audit_app_student_finalization_read ON public.audit_records;

-- 3. Drop column default so we can rebuild the type.
ALTER TABLE public.audit_records ALTER COLUMN status DROP DEFAULT;

-- 4. Detach status from the old enum, rebuild enum, reattach.
ALTER TABLE public.audit_records ALTER COLUMN status TYPE text USING status::text;

DROP TYPE public.audit_status;
CREATE TYPE public.audit_status AS ENUM ('approved', 'exported');

ALTER TABLE public.audit_records
  ALTER COLUMN status TYPE public.audit_status USING status::public.audit_status;

ALTER TABLE public.audit_records
  ALTER COLUMN status SET DEFAULT 'approved'::public.audit_status;
ALTER TABLE public.audit_records
  ALTER COLUMN status SET NOT NULL;

-- 5. Recreate dependent indexes (now without the redundant IN-list).
CREATE INDEX audit_records_exportable_idx
  ON public.audit_records (kind, status, updated_at DESC);

CREATE INDEX audit_records_class_time_idx
  ON public.audit_records (class_id, updated_at DESC)
  WHERE class_id IS NOT NULL;

CREATE INDEX audit_records_auditor_time_idx
  ON public.audit_records (auditor_id, updated_at DESC)
  WHERE auditor_id IS NOT NULL;

-- 6. Recreate RLS policy. With only two valid values, the explicit IN-list
--    is no longer informative; we keep it for self-documenting intent.
CREATE POLICY audit_app_student_finalization_read ON public.audit_records
  FOR SELECT
  USING (
    kind = 'metadata'::audit_kind
    AND status IN ('approved'::audit_status, 'exported'::audit_status)
    AND (metadata ->> 'teacher_action') = 'conversation_finalized'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = audit_records.source_conversation_id
        AND c.owner_id = current_app_user_id()
        AND c.source = 'student_chat'::interaction_source
        AND c.deleted_at IS NULL
    )
  );

-- 7. Update validate_audit_record_contract: drop the now-impossible 'pending' branch.
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

  -- Content validation. With only approved/exported as valid statuses, every
  -- insert must satisfy these rules; no "draft" exemption exists.
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
