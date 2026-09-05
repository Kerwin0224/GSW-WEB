-- 函数以 SECURITY DEFINER 运行，内部用 current_app_user_id() 做行级隔离，
-- 授予 authenticated 角色 EXECUTE 权限以修复 401 错误。
CREATE OR REPLACE FUNCTION public.is_student_conversation_finalized(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.audit_records ar ON ar.source_conversation_id = c.id
    WHERE c.id = p_conversation_id
      AND c.owner_id = public.current_app_user_id()
      AND c.source = 'student_chat'::public.interaction_source
      AND c.deleted_at IS NULL
      AND ar.kind = 'metadata'::public.audit_kind
      AND ar.status IN ('approved'::public.audit_status, 'exported'::public.audit_status)
      AND ar.metadata ->> 'teacher_action' = 'conversation_finalized'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_student_conversation_finalized(uuid) TO authenticated;
