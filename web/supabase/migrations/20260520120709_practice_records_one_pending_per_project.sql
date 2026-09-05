-- Fix CONTEXT.md rule: "同一学生同一项目在任意时刻只能存在一条挑战记录处于待作答状态"
--
-- Gap: The application-layer approach (UPDATE pending→blocked THEN INSERT) is
-- non-atomic. Concurrent requests can both complete the UPDATE before either
-- INSERT, producing two pending rows. Neither validate_practice_record_contract
-- nor any index blocked this.
--
-- Solution 1: Partial unique index — database-level enforcement.
--   A second INSERT with evaluation_state='pending' for the same (student_id,
--   project_id) pair will raise a unique violation. The trigger below fires first
--   and gives a cleaner domain-level error message.
--
-- Solution 2: Extend validate_practice_record_contract to give a clear domain
--   error on INSERT when a pending record already exists. The index is the hard
--   guarantee; the trigger provides a friendlier message.

-- 1. Partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS practice_records_one_pending_per_project
  ON public.practice_records (student_id, project_id)
  WHERE evaluation_state = 'pending';

-- 2. Extend validate_practice_record_contract to give a clear exception
--    on INSERT when a pending record already exists.
CREATE OR REPLACE FUNCTION public.validate_practice_record_contract()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  project_owner_id uuid;
  existing_pending_id uuid;
BEGIN
  -- Original checks
  IF new.project_id IS NULL THEN
    RAISE EXCEPTION 'challenge records must belong to a text project';
  END IF;

  SELECT p.owner_id INTO project_owner_id
    FROM public.text_projects p WHERE p.id = new.project_id;

  IF project_owner_id IS NULL THEN
    RAISE EXCEPTION 'challenge project % does not exist', new.project_id;
  END IF;

  IF project_owner_id <> new.student_id THEN
    RAISE EXCEPTION 'challenge student % must match project owner %', new.student_id, project_owner_id;
  END IF;

  IF new.achieved = true AND new.evaluation_state <> 'evaluated' THEN
    RAISE EXCEPTION 'achieved challenges must be evaluated';
  END IF;

  -- New: enforce single-pending-per-project on INSERT
  IF tg_op = 'INSERT' AND new.evaluation_state = 'pending' THEN
    SELECT id INTO existing_pending_id
      FROM public.practice_records
      WHERE student_id = new.student_id
        AND project_id = new.project_id
        AND evaluation_state = 'pending'
      LIMIT 1;

    IF existing_pending_id IS NOT NULL THEN
      RAISE EXCEPTION
        'student % already has a pending challenge for project %; block it before generating a new one',
        new.student_id, new.project_id;
    END IF;
  END IF;

  RETURN new;
END $$;
