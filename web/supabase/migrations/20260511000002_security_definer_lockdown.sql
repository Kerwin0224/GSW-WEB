-- Database optimization phase 2 — SECURITY DEFINER attack-surface reduction.
--
-- Supabase lints flag every SECURITY DEFINER function as reachable via PostgREST
-- RPC (/rest/v1/rpc/*). Our app uses the anon publishable key + a custom
-- x-cwb-user-id / x-cwb-session-signature header for identity, so "anon" is
-- effectively every unauthenticated HTTP client. This migration narrows the
-- REST surface without breaking any in-app flow:
--
--   * Internal trigger / event-trigger helpers are REVOKEd from both anon and
--     authenticated (they should never be invoked over HTTP).
--   * RLS helper functions (is_admin, current_app_user_id, teacher_can_access_class, …)
--     are REVOKEd from anon; keep authenticated so server-side rpc() still works
--     if ever needed. RLS evaluation is unaffected because RLS evaluates these
--     with the SECURITY DEFINER owner's privileges.
--   * Admin write RPCs (save_* / rebuild_*) already self-check via is_admin();
--     we REVOKE anon to silence the advisor and block unauthenticated probes.
--   * authenticate_school_account is the only function that MUST remain
--     callable by anon — it is the login primitive.
--
-- Everything revoked from anon still works for service_role and postgres.

begin;

-- =============================================================================
-- A. Trigger / event-trigger helpers — NEVER reachable via REST.
-- =============================================================================

revoke execute on function public.touch_updated_at()                       from anon, authenticated;
revoke execute on function public.prevent_text_project_delete()            from anon, authenticated;
revoke execute on function public.sync_text_project_contract()             from anon, authenticated;
revoke execute on function public.sync_project_highest_bloom_from_practice() from anon, authenticated;
revoke execute on function public.validate_audit_record_contract()         from anon, authenticated;
revoke execute on function public.validate_class_membership_contract()     from anon, authenticated;
revoke execute on function public.validate_conversation_contract()         from anon, authenticated;
revoke execute on function public.validate_conversation_message_contract() from anon, authenticated;
revoke execute on function public.validate_document_chunk_scope_contract() from anon, authenticated;
revoke execute on function public.validate_document_scope_contract()       from anon, authenticated;
revoke execute on function public.validate_practice_record_contract()      from anon, authenticated;
revoke execute on function public.rls_auto_enable()                        from anon, authenticated;
revoke execute on function public.verify_password(text, text)              from anon, authenticated;

-- =============================================================================
-- B. RLS helper functions — used inside RLS predicates, not meant as public
--    RPC. REVOKE anon so unauthenticated probes can't enumerate sessions.
--    Keep authenticated because some policies reference them from rpc() calls
--    in the admin helper path.
-- =============================================================================

revoke execute on function public.is_admin()                                from anon;
revoke execute on function public.current_app_user_id()                     from anon;
revoke execute on function public.current_profile_role()                    from anon;
revoke execute on function public.has_valid_app_session_signature()         from anon;
revoke execute on function public.teacher_can_access_class(uuid)            from anon;
revoke execute on function public.is_student_conversation_finalized(uuid)   from anon;
revoke execute on function public.get_profile(uuid)                         from anon;

-- =============================================================================
-- C. Admin write RPCs — already guarded by is_admin() inside the function.
--    REVOKE anon to silence the advisor and refuse unauthenticated probes.
-- =============================================================================

revoke execute on function public.save_model_tier_binding_and_sync(text, uuid, text)
  from anon;

revoke execute on function public.save_scenario_tier_bindings_and_sync(jsonb)
  from anon;

revoke execute on function public.rebuild_scenario_provider_capabilities()
  from anon;

revoke execute on function public.refresh_project_highest_bloom_level(uuid)
  from anon;

revoke execute on function public.get_model_tier_provider(text)
  from anon;

revoke execute on function public.get_provider_capability_provider(public.provider_capability)
  from anon;

-- =============================================================================
-- D. authenticate_school_account MUST remain executable for anon — it is the
--    login primitive. authenticate_user is legacy (uses text role), keep it
--    callable as well until the login route consolidation lands.
--    No change here beyond a sanity grant (idempotent).
-- =============================================================================

grant execute on function public.authenticate_school_account(text, text) to anon, authenticated;
grant execute on function public.authenticate_user(text)                to anon, authenticated;

commit;
