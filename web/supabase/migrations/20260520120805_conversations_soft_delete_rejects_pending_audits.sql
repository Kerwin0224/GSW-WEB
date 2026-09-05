-- HISTORICAL — superseded by 20260520123251_audit_status_collapse_to_terminal_states.
--
-- Original intent: when a conversation is soft-deleted, mark any 'pending'
-- audit_records as 'rejected' so the teacher audit queue stops showing them.
--
-- Why superseded: the next migration (audit_status_collapse_to_terminal_states)
-- proved 'pending' is unreachable in production paths — every audit_records
-- write goes in directly with status='approved'. With 'pending' removed from
-- the audit_status enum entirely, this trigger has no rows to act on, so the
-- collapse migration drops both the trigger and its function.
--
-- This file is kept as a no-op to preserve the cloud migration ledger.

CREATE OR REPLACE FUNCTION public.on_conversation_soft_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF new.deleted_at IS NOT NULL AND old.deleted_at IS NULL THEN
    UPDATE public.audit_records
      SET status   = 'rejected',
          rationale = COALESCE(rationale, '') || ' [conversation soft-deleted]',
          updated_at = now()
      WHERE source_conversation_id = new.id
        AND status = 'pending';
  END IF;
  RETURN new;
END $$;

CREATE TRIGGER conversations_on_soft_delete
  AFTER UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.on_conversation_soft_delete();
