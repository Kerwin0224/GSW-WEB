-- Database optimization phase 1
-- Scope:
--   1. Fix unindexed foreign keys on hot paths
--   2. Add teacher-audit covering partial indexes
--   3. Drop redundant / overlapping RLS policies (multiple_permissive_policies advisor)
--   4. Drop obsolete unused indexes covered by others
--   5. Harden mutable search_path on trigger / auth functions
-- Everything here is additive or consolidating and safe to apply to the cloud source-of-truth.

-- =============================================================================
-- 1. Unindexed foreign keys — hot paths only.
--    Skip low-traffic *_created_by_fkey columns; those are rarely joined and add
--    write overhead without real read benefit.
-- =============================================================================

create index if not exists conversation_messages_conversation_created_idx
  on public.conversation_messages (conversation_id, created_at);

create index if not exists audit_records_class_id_idx
  on public.audit_records (class_id)
  where class_id is not null;

create index if not exists conversations_class_id_idx
  on public.conversations (class_id)
  where class_id is not null;

create index if not exists conversations_prompt_preset_id_idx
  on public.conversations (prompt_preset_id)
  where prompt_preset_id is not null;

create index if not exists document_chunks_owner_id_idx
  on public.document_chunks (owner_id);

create index if not exists document_chunks_project_id_idx
  on public.document_chunks (project_id)
  where project_id is not null;

create index if not exists document_chunks_class_id_idx
  on public.document_chunks (class_id)
  where class_id is not null;

create index if not exists documents_project_id_idx
  on public.documents (project_id)
  where project_id is not null;

create index if not exists documents_class_id_idx
  on public.documents (class_id)
  where class_id is not null;

create index if not exists text_projects_class_id_idx
  on public.text_projects (class_id)
  where class_id is not null;

create index if not exists model_tier_bindings_provider_id_idx
  on public.model_tier_bindings (provider_id);

-- =============================================================================
-- 2. Teacher audit flow — covering partial indexes.
--    These cover the 班级 → 学生 → 项目 → 会话 audit drill-down.
-- =============================================================================

-- Lists recent active student_chat conversations for a given class.
create index if not exists conversations_active_class_idx
  on public.conversations (class_id, updated_at desc)
  where deleted_at is null and source = 'student_chat';

-- Lists exportable audit rows for a given class / teacher, ordered by recency.
create index if not exists audit_records_class_time_idx
  on public.audit_records (class_id, updated_at desc)
  where status in ('approved','exported');

create index if not exists audit_records_auditor_time_idx
  on public.audit_records (auditor_id, updated_at desc)
  where status in ('approved','exported');

-- Student cognitive profile: recent practice records per project / student.
create index if not exists practice_records_project_created_idx
  on public.practice_records (project_id, created_at desc);

create index if not exists practice_records_student_created_idx
  on public.practice_records (student_id, created_at desc);

-- =============================================================================
-- 3. Drop redundant RLS policies that duplicate newer, canonical ones.
--    These all produce multiple_permissive_policies advisor WARN findings.
-- =============================================================================

-- classes: keep the two canonical policies (admin-all + member-select).
-- classes_all_admin + classes_select_admin are legacy pre-is_admin() clones.
drop policy if exists classes_all_admin on public.classes;
drop policy if exists classes_select_admin on public.classes;

-- conversations: conv_update_own is an older auth.uid()-scoped policy that
-- overlaps with conversations_owner_all (which already covers UPDATE via ALL).
drop policy if exists conv_update_own on public.conversations;

-- document_chunks / documents: *_select_all_auth are legacy broadly-permissive
-- policies leaking every authenticated user. The owner + teacher policies are
-- the canonical ones.
drop policy if exists chunks_select_all_auth on public.document_chunks;
drop policy if exists documents_select_all_auth on public.documents;

-- documents: documents_all_admin is the legacy admin policy clone; the
-- canonical documents_app_owner_all already grants admins via is_admin().
drop policy if exists documents_all_admin on public.documents;

-- =============================================================================
-- 4. Drop unused / covered index reported by advisor.
--    idx_audit_status is fully covered by audit_records_exportable_idx.
-- =============================================================================

drop index if exists public.idx_audit_status;

-- =============================================================================
-- 5. Harden mutable search_path (function_search_path_mutable advisor WARN).
--    These functions live in public but should resolve identifiers against the
--    fixed public + pg_catalog search path to prevent search_path hijacking.
-- =============================================================================

alter function public.verify_password(text, text)        set search_path = public, pg_catalog;
alter function public.authenticate_user(text)            set search_path = public, pg_catalog;
alter function public.touch_updated_at()                 set search_path = public, pg_catalog;
alter function public.prevent_text_project_delete()      set search_path = public, pg_catalog;
