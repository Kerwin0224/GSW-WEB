-- Baseline schema (real DDL dumped from cloud project)
-- 
-- 为什么是 dump 而不是手写：原 baseline 只有对象清单，无法在本地重放出真实库。
-- 本文件是 2026-09 从云端导出的完整 public schema，取代旧的清单 baseline 与
-- 20260511/20260520 的增量迁移（其效果已包含在内）——归并为单一可重放入口。
-- 后续 schema 变更一律新增迁移文件，禁止修改本文件。

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'teacher',
    'student'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."audit_kind" AS ENUM (
    'sft',
    'dpo',
    'metadata'
);


ALTER TYPE "public"."audit_kind" OWNER TO "postgres";


CREATE TYPE "public"."audit_status" AS ENUM (
    'approved',
    'exported'
);


ALTER TYPE "public"."audit_status" OWNER TO "postgres";


CREATE TYPE "public"."export_status" AS ENUM (
    'queued',
    'ready',
    'failed'
);


ALTER TYPE "public"."export_status" OWNER TO "postgres";


CREATE TYPE "public"."interaction_source" AS ENUM (
    'student_chat',
    'teacher_chat',
    'practice'
);


ALTER TYPE "public"."interaction_source" OWNER TO "postgres";


CREATE TYPE "public"."prompt_preset_status" AS ENUM (
    'draft',
    'published',
    'disabled'
);


ALTER TYPE "public"."prompt_preset_status" OWNER TO "postgres";


CREATE TYPE "public"."provider_capability" AS ENUM (
    'student_chat',
    'teacher_chat',
    'bloom_classification',
    'project_classification',
    'practice_generation',
    'practice_evaluation',
    'audit_assist',
    'embedding'
);


ALTER TYPE "public"."provider_capability" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."authenticate_school_account"("p_login_id" "text", "p_password" "text") RETURNS TABLE("id" "uuid", "login_id" "text", "role" "public"."app_role", "display_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $_$
  select p.id, p.login_id, p.role::public.app_role, p.display_name
  from public.profiles p
  where p.login_id = p_login_id
    and p.status = 'active'
    and p.login_id ~ '^\d{8}$'
    and p.password_hash is not null
    and p.password_hash = crypt(p_password, p.password_hash)
$_$;


ALTER FUNCTION "public"."authenticate_school_account"("p_login_id" "text", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."authenticate_user"("p_login_id" "text") RETURNS TABLE("id" "uuid", "role" "text", "display_name" "text", "password_hash" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.role, p.display_name, p.password_hash
  FROM public.profiles p
  WHERE p.login_id = p_login_id AND p.status = 'active';
END;
$$;


ALTER FUNCTION "public"."authenticate_user"("p_login_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_app_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'extensions'
    AS $$
  with headers as (
    select nullif(current_setting('request.headers', true), '')::jsonb as value
  ), secret as (
    select value from private.runtime_secrets where name = 'cwb_auth_secret'
  )
  select case
    when (select value from headers) ? 'x-cwb-user-id'
      and (select value from headers) ? 'x-cwb-session-signature'
      and (select value from headers) ->> 'x-cwb-session-signature' = encode(hmac(((select value from headers) ->> 'x-cwb-user-id')::bytea, (select value from secret)::bytea, 'sha256'), 'hex')
    then ((select value from headers) ->> 'x-cwb-user-id')::uuid
    else auth.uid()
  end
$$;


ALTER FUNCTION "public"."current_app_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_profile_role"() RETURNS "public"."app_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.role::public.app_role
  from public.profiles p
  where p.id = public.current_app_user_id()
    and p.status = 'active'
$$;


ALTER FUNCTION "public"."current_profile_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_model_tier_provider"("p_tier" "text") RETURNS TABLE("tier" "text", "model_id" "text", "binding_enabled" boolean, "provider_id" "uuid", "provider_name" "text", "provider_type" "text", "base_url" "text", "secret_ref" "text", "health_status" "text", "provider_enabled" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.has_valid_app_session_signature() then
    raise exception 'server session signature required' using errcode = '42501';
  end if;

  return query
  select
    mtb.tier,
    mtb.model_id,
    mtb.is_enabled,
    p.id,
    p.name,
    p.provider_type,
    p.base_url,
    p.secret_ref,
    p.health_status,
    p.is_enabled
  from public.model_tier_bindings mtb
  join public.provider_configs p on p.id = mtb.provider_id
  where mtb.tier = p_tier
  limit 1;
end $$;


ALTER FUNCTION "public"."get_model_tier_provider"("p_tier" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "login_id" "text",
    "password_hash" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'teacher'::"text", 'student'::"text"]))),
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profile"("p_user_id" "uuid") RETURNS SETOF "public"."profiles"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select * from public.profiles where id = p_user_id and (id = public.current_app_user_id() or public.is_admin())
$$;


ALTER FUNCTION "public"."get_profile"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_provider_capability_provider"("p_capability" "public"."provider_capability") RETURNS TABLE("capability" "public"."provider_capability", "model_id" "text", "provider_name" "text", "provider_type" "text", "base_url" "text", "secret_ref" "text", "health_status" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.has_valid_app_session_signature() then
    raise exception 'server session signature required' using errcode = '42501';
  end if;

  return query
  select
    pc.capability,
    pc.model_id,
    p.name,
    p.provider_type,
    p.base_url,
    p.secret_ref,
    p.health_status
  from public.provider_capabilities pc
  join public.provider_configs p on p.id = pc.provider_id
  where pc.capability = p_capability
    and pc.is_enabled
    and p.is_enabled
  order by pc.provider_id, pc.model_id;
end $$;


ALTER FUNCTION "public"."get_provider_capability_provider"("p_capability" "public"."provider_capability") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_valid_app_session_signature"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'extensions'
    AS $$
  with headers as (
    select nullif(current_setting('request.headers', true), '')::jsonb as value
  ), secret as (
    select value from private.runtime_secrets where name = 'cwb_auth_secret'
  )
  select coalesce(
    (select value from headers) ? 'x-cwb-user-id'
    and (select value from headers) ? 'x-cwb-session-signature'
    and (select value from headers) ->> 'x-cwb-session-signature' = encode(hmac(((select value from headers) ->> 'x-cwb-user-id')::bytea, (select value from secret)::bytea, 'sha256'), 'hex'),
    false
  )
$$;


ALTER FUNCTION "public"."has_valid_app_session_signature"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = public.current_app_user_id()
      and p.role = 'admin'
      and p.status = 'active'
  )
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_student_conversation_finalized"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."is_student_conversation_finalized"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_conversation_document_chunks"("query_embedding" "extensions"."vector", "conversation_id" "uuid", "match_count" integer DEFAULT 6, "match_threshold" double precision DEFAULT 0.25) RETURNS TABLE("id" "uuid", "document_id" "uuid", "owner_id" "uuid", "class_id" "uuid", "project_id" "uuid", "conversation_id" "uuid", "chunk_index" integer, "content" "text", "metadata" "jsonb", "document_title" "text", "source_uri" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $_$
  select dc.id, dc.document_id, dc.owner_id, dc.class_id, dc.project_id, dc.conversation_id, dc.chunk_index, dc.content, dc.metadata, d.title, d.source_uri, 1 - (dc.embedding <=> query_embedding)
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  join public.conversations c on c.id = dc.conversation_id
  where public.current_app_user_id() is not null
    and dc.conversation_id = $2
    and c.id = $2
    and c.owner_id = public.current_app_user_id()
    and dc.owner_id = public.current_app_user_id()
    and d.owner_id = public.current_app_user_id()
    and d.conversation_id = $2
    and 1 - (dc.embedding <=> query_embedding) >= match_threshold
  order by dc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 12)
$_$;


ALTER FUNCTION "public"."match_conversation_document_chunks"("query_embedding" "extensions"."vector", "conversation_id" "uuid", "match_count" integer, "match_threshold" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_document_chunks"("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 8, "match_threshold" double precision DEFAULT 0.25, "project_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "document_id" "uuid", "owner_id" "uuid", "class_id" "uuid", "project_id" "uuid", "chunk_index" integer, "content" "text", "metadata" "jsonb", "document_title" "text", "source_uri" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $_$
  select dc.id, dc.document_id, dc.owner_id, dc.class_id, dc.project_id, dc.chunk_index, dc.content, dc.metadata, d.title, d.source_uri, 1 - (dc.embedding <=> query_embedding)
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where public.current_app_user_id() is not null
    and ($4 is null or dc.project_id = $4)
    and (dc.owner_id = public.current_app_user_id() or public.is_admin() or (dc.class_id is not null and public.teacher_can_access_class(dc.class_id)))
    and 1 - (dc.embedding <=> query_embedding) >= match_threshold
  order by dc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50)
$_$;


ALTER FUNCTION "public"."match_document_chunks"("query_embedding" "extensions"."vector", "match_count" integer, "match_threshold" double precision, "project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_text_project_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
begin raise exception 'text projects are stable learning units and cannot be hard-deleted'; end $$;


ALTER FUNCTION "public"."prevent_text_project_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rebuild_scenario_provider_capabilities"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.provider_capabilities
  where capability in (
    'student_chat'::public.provider_capability,
    'teacher_chat'::public.provider_capability,
    'bloom_classification'::public.provider_capability,
    'project_classification'::public.provider_capability,
    'practice_generation'::public.provider_capability,
    'practice_evaluation'::public.provider_capability,
    'audit_assist'::public.provider_capability
  );

  insert into public.provider_capabilities (provider_id, capability, model_id, is_enabled, metadata)
  select
    mtb.provider_id,
    stb.scenario,
    trim(mtb.model_id),
    true,
    jsonb_build_object('synced_from', 'scenario_tier_bindings', 'tier', stb.tier)
  from public.scenario_tier_bindings stb
  join public.model_tier_bindings mtb on mtb.tier = stb.tier and mtb.is_enabled
  where stb.is_enabled
    and stb.scenario in (
      'student_chat'::public.provider_capability,
      'teacher_chat'::public.provider_capability,
      'bloom_classification'::public.provider_capability,
      'project_classification'::public.provider_capability,
      'practice_generation'::public.provider_capability,
      'practice_evaluation'::public.provider_capability,
      'audit_assist'::public.provider_capability
    )
    and nullif(trim(mtb.model_id), '') is not null;
end $$;


ALTER FUNCTION "public"."rebuild_scenario_provider_capabilities"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_project_highest_bloom_level"("p_project_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_level integer;
  v_confirmed integer := 0;
BEGIN
  IF p_project_id IS NULL THEN RETURN; END IF;

  -- 从 L1 向上找连续通过的最高层级
  FOR v_level IN 1..6 LOOP
    IF EXISTS (
      SELECT 1 FROM public.practice_records
      WHERE project_id = p_project_id
        AND target_bloom_level = v_level
        AND achieved = true
        AND evaluation_state = 'evaluated'
    ) THEN
      v_confirmed := v_level;
    ELSE
      EXIT; -- 断层，停止
    END IF;
  END LOOP;

  UPDATE public.text_projects
  SET highest_bloom_level = CASE WHEN v_confirmed > 0 THEN v_confirmed ELSE NULL END
  WHERE id = p_project_id;
END;
$$;


ALTER FUNCTION "public"."refresh_project_highest_bloom_level"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_model_tier_binding_and_sync"("p_tier" "text", "p_provider_id" "uuid", "p_model_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if p_tier not in ('flash','advanced') then
    raise exception 'unsupported tier: %', p_tier;
  end if;
  if nullif(trim(p_model_id), '') is null then
    raise exception 'model_id is required';
  end if;
  if not exists (select 1 from public.provider_configs where id = p_provider_id) then
    raise exception 'provider not found';
  end if;

  insert into public.model_tier_bindings (tier, provider_id, model_id, is_enabled, metadata)
  values (p_tier, p_provider_id, trim(p_model_id), true, jsonb_build_object('source_of_truth', 'scenario_tier_bindings', 'synced_from', 'admin_model_tier_binding'))
  on conflict (tier) do update set
    provider_id = excluded.provider_id,
    model_id = excluded.model_id,
    is_enabled = true,
    metadata = excluded.metadata;

  perform public.rebuild_scenario_provider_capabilities();
end $$;


ALTER FUNCTION "public"."save_model_tier_binding_and_sync"("p_tier" "text", "p_provider_id" "uuid", "p_model_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_scenario_tier_bindings_and_sync"("p_bindings" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  binding record;
begin
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  for binding in
    select * from jsonb_to_recordset(p_bindings) as input(scenario text, tier text)
  loop
    if binding.scenario not in ('student_chat','teacher_chat','bloom_classification','project_classification','practice_generation','practice_evaluation','audit_assist') then
      raise exception 'unsupported scenario: %', binding.scenario;
    end if;
    if binding.tier not in ('flash','advanced') then
      raise exception 'unsupported tier: %', binding.tier;
    end if;

    insert into public.scenario_tier_bindings (scenario, tier, is_enabled, metadata)
    values (binding.scenario::public.provider_capability, binding.tier, true, jsonb_build_object('synced_from', 'admin_scenario_mapping'))
    on conflict (scenario) do update set
      tier = excluded.tier,
      is_enabled = true,
      metadata = excluded.metadata;
  end loop;

  perform public.rebuild_scenario_provider_capabilities();
end $$;


ALTER FUNCTION "public"."save_scenario_tier_bindings_and_sync"("p_bindings" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_project_highest_bloom_from_practice"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.refresh_project_highest_bloom_level(old.project_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform public.refresh_project_highest_bloom_level(new.project_id); end if;
  return null;
end $$;


ALTER FUNCTION "public"."sync_project_highest_bloom_from_practice"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_text_project_contract"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare owner_role text; membership_class_id uuid;
begin
  new.title = trim(new.title);
  new.author = nullif(trim(coalesce(new.author, '')), '');
  if new.title = '' then raise exception 'project title cannot be empty'; end if;
  if new.title in ('自动识别中的篇目','未定篇目','待自动归属','待归属篇目','未知篇目','未识别篇目','默认篇目','示例篇目','篇目标题','篇目项目','日常会话归档') then raise exception 'placeholder title % cannot be persisted as a text project', new.title; end if;
  select p.role into owner_role from public.profiles p where p.id = new.owner_id;
  if owner_role is distinct from 'student' then raise exception 'text project owner % must be a student profile', new.owner_id; end if;
  select cm.class_id into membership_class_id from public.class_memberships cm where cm.profile_id = new.owner_id and cm.role = 'student'::public.app_role limit 1;
  if new.class_id is null and membership_class_id is not null then new.class_id = membership_class_id;
  elsif new.class_id is not null and membership_class_id is null then raise exception 'project class % cannot be set because student % has no class membership', new.class_id, new.owner_id;
  elsif new.class_id is not null and new.class_id <> membership_class_id then raise exception 'project class % must match student membership class %', new.class_id, membership_class_id;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."sync_text_project_contract"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."teacher_can_access_class"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.class_memberships cm
    where cm.class_id = p_class_id and cm.profile_id = public.current_app_user_id() and cm.role = 'teacher'
  )
$$;


ALTER FUNCTION "public"."teacher_can_access_class"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_audit_record_contract"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."validate_audit_record_contract"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_class_membership_contract"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare profile_role text;
begin
  select p.role into profile_role from public.profiles p where p.id = new.profile_id;
  if profile_role is null then raise exception 'class membership profile % does not exist', new.profile_id; end if;
  if profile_role <> new.role::text then raise exception 'class membership role % does not match profile role % for %', new.role, profile_role, new.profile_id; end if;
  if new.role not in ('teacher'::public.app_role, 'student'::public.app_role) then raise exception 'class membership role must be teacher or student'; end if;
  return new;
end $$;


ALTER FUNCTION "public"."validate_class_membership_contract"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_conversation_contract"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare owner_role text; project_owner_id uuid; project_class_id uuid; preset_role public.app_role;
begin
  select p.role into owner_role from public.profiles p where p.id = new.owner_id;
  if owner_role is null then raise exception 'conversation owner % does not exist', new.owner_id; end if;
  if owner_role = 'student' and new.source <> 'student_chat'::public.interaction_source then raise exception 'student conversations must use student_chat source'; end if;
  if owner_role = 'teacher' and new.source <> 'teacher_chat'::public.interaction_source then raise exception 'teacher conversations must use teacher_chat source'; end if;
  if new.source = 'student_chat'::public.interaction_source then
    if owner_role <> 'student' then raise exception 'student_chat conversations must be owned by student profiles'; end if;
    if new.prompt_preset_id is not null then raise exception 'student conversations cannot bind teacher prompt presets'; end if;
    if new.project_id is null then new.class_id = null;
    else
      select p.owner_id, p.class_id into project_owner_id, project_class_id from public.text_projects p where p.id = new.project_id;
      if project_owner_id is null then raise exception 'conversation project % does not exist', new.project_id; end if;
      if project_owner_id <> new.owner_id then raise exception 'conversation owner % must match project owner %', new.owner_id, project_owner_id; end if;
      new.class_id = project_class_id;
    end if;
  elsif new.source = 'teacher_chat'::public.interaction_source then
    if owner_role <> 'teacher' then raise exception 'teacher_chat conversations must be owned by teacher profiles'; end if;
    if new.project_id is not null or new.class_id is not null then raise exception 'teacher Q&A conversations cannot bind student projects or classes'; end if;
    if new.prompt_preset_id is not null then
      select pp.target_role into preset_role from public.prompt_presets pp where pp.id = new.prompt_preset_id;
      if preset_role is distinct from 'teacher'::public.app_role then raise exception 'teacher Q&A prompt preset must target teacher role'; end if;
    end if;
  else
    raise exception 'conversation source % is deprecated for product conversations', new.source;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."validate_conversation_contract"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_conversation_message_contract"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."validate_conversation_message_contract"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_document_chunk_scope_contract"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare document_owner_id uuid; document_class_id uuid; document_project_id uuid; document_conversation_id uuid;
begin
  select d.owner_id, d.class_id, d.project_id, d.conversation_id into document_owner_id, document_class_id, document_project_id, document_conversation_id from public.documents d where d.id = new.document_id;
  if document_owner_id is null then raise exception 'chunk document % does not exist', new.document_id; end if;
  new.owner_id = document_owner_id; new.class_id = document_class_id; new.project_id = document_project_id; new.conversation_id = document_conversation_id;
  return new;
end $$;


ALTER FUNCTION "public"."validate_document_chunk_scope_contract"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_document_scope_contract"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare conversation_owner_id uuid; conversation_class_id uuid; conversation_project_id uuid;
begin
  if new.conversation_id is not null then
    select c.owner_id, c.class_id, c.project_id into conversation_owner_id, conversation_class_id, conversation_project_id from public.conversations c where c.id = new.conversation_id;
    if conversation_owner_id is null then raise exception 'document conversation % does not exist', new.conversation_id; end if;
    if new.owner_id <> conversation_owner_id then raise exception 'document owner must match conversation owner'; end if;
    new.class_id = conversation_class_id; new.project_id = conversation_project_id;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."validate_document_scope_contract"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_practice_record_contract"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."validate_practice_record_contract"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_password"("input_password" "text", "stored_hash" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
  SELECT stored_hash = crypt(input_password, stored_hash);
$$;


ALTER FUNCTION "public"."verify_password"("input_password" "text", "stored_hash" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "public"."audit_status" DEFAULT 'approved'::"public"."audit_status" NOT NULL,
    "original_answer" "text",
    "corrected_answer" "text",
    "chosen_answer" "text",
    "rejected_answer" "text",
    "auditor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_message_id" "uuid" NOT NULL,
    "source_conversation_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "kind" "public"."audit_kind" NOT NULL,
    "quality" "text",
    "prompt" "text" NOT NULL,
    "rationale" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "exported_at" timestamp with time zone
);


ALTER TABLE "public"."audit_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "class_memberships_role_check" CHECK (("role" = ANY (ARRAY['teacher'::"public"."app_role", 'student'::"public"."app_role"])))
);


ALTER TABLE "public"."class_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "grade" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "classes_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "parts" "jsonb",
    "bloom_level" integer,
    "bloom_state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "model_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_messages_bloom_level_check" CHECK ((("bloom_level" >= 1) AND ("bloom_level" <= 6))),
    CONSTRAINT "conversation_messages_bloom_state_check" CHECK (("bloom_state" = ANY (ARRAY['pending'::"text", 'classified'::"text", 'failed'::"text", 'unclassified'::"text"]))),
    CONSTRAINT "conversation_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text", 'tool'::"text"])))
);

ALTER TABLE ONLY "public"."conversation_messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."conversation_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "title" "text" DEFAULT '新对话'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "class_id" "uuid",
    "source" "public"."interaction_source" NOT NULL,
    "prompt_preset_id" "uuid",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_quality_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_count" integer DEFAULT 0 NOT NULL,
    "reason" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."data_quality_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "chunk_index" integer NOT NULL,
    "content" "text" NOT NULL,
    "token_count" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "embedding" "extensions"."vector"(768) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "class_id" "uuid",
    "project_id" "uuid",
    "conversation_id" "uuid"
);


ALTER TABLE "public"."document_chunks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "author" "text",
    "dynasty" "text",
    "content" "text",
    "source_uri" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "class_id" "uuid",
    "project_id" "uuid",
    "conversation_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."export_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "export_type" "public"."audit_kind" NOT NULL,
    "status" "public"."export_status" DEFAULT 'ready'::"public"."export_status" NOT NULL,
    "record_count" integer DEFAULT 0 NOT NULL,
    "jsonl" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."export_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mcp_servers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "connection_ref" "text",
    "secret_ref" "text",
    "secret_last_four" "text",
    "health_status" "text" DEFAULT 'unchecked'::"text" NOT NULL,
    "enabled_tools" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "allowed_roles" "public"."app_role"[] DEFAULT '{}'::"public"."app_role"[] NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."mcp_servers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."model_tier_bindings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tier" "text" NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "model_id" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "model_tier_bindings_model_id_check" CHECK (("length"(TRIM(BOTH FROM "model_id")) > 0)),
    CONSTRAINT "model_tier_bindings_tier_check" CHECK (("tier" = ANY (ARRAY['flash'::"text", 'advanced'::"text"])))
);


ALTER TABLE "public"."model_tier_bindings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."practice_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "target_bloom_level" smallint NOT NULL,
    "achieved" boolean DEFAULT false,
    "feedback" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prompt" "text",
    "answer" "text",
    "evaluation_state" "text" DEFAULT 'pending'::"text" NOT NULL,
    CONSTRAINT "practice_records_target_bloom_level_check" CHECK ((("target_bloom_level" >= 1) AND ("target_bloom_level" <= 6)))
);


ALTER TABLE "public"."practice_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prompt_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "system_instruction" "text" DEFAULT ''::"text" NOT NULL,
    "variables" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scenario" "text" DEFAULT '课堂教学'::"text" NOT NULL,
    "user_template" "text",
    "target_role" "public"."app_role" DEFAULT 'teacher'::"public"."app_role" NOT NULL,
    "status" "public"."prompt_preset_status" DEFAULT 'draft'::"public"."prompt_preset_status" NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."prompt_presets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_capabilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "capability" "public"."provider_capability" NOT NULL,
    "model_id" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."provider_capabilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "provider_type" "text" DEFAULT 'openai-compatible'::"text" NOT NULL,
    "base_url" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "secret_ref" "text",
    "secret_last_four" "text",
    "is_enabled" boolean DEFAULT false NOT NULL,
    "health_status" "text" DEFAULT 'unchecked'::"text" NOT NULL,
    "api_models" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "last_health_check_at" timestamp with time zone,
    "last_health_latency_ms" integer,
    "secret_created_at" timestamp with time zone,
    "secret_last_used_at" timestamp with time zone,
    "secret_rotated_at" timestamp with time zone,
    CONSTRAINT "provider_configs_provider_type_check" CHECK (("provider_type" = ANY (ARRAY['cloud'::"text", 'local'::"text", 'proxy'::"text", 'openai'::"text", 'openai-compatible'::"text", 'gateway'::"text", 'anthropic'::"text", 'ollama'::"text", 'azure'::"text"])))
);


ALTER TABLE "public"."provider_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scenario_tier_bindings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scenario" "public"."provider_capability" NOT NULL,
    "tier" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scenario_tier_bindings_tier_check" CHECK (("tier" = ANY (ARRAY['flash'::"text", 'advanced'::"text"])))
);


ALTER TABLE "public"."scenario_tier_bindings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."text_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "class_id" "uuid",
    "title" "text" NOT NULL,
    "author" "text",
    "text_type" "text" DEFAULT 'poem'::"text" NOT NULL,
    "classification_state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "highest_bloom_level" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "text_projects_classification_state_check" CHECK (("classification_state" = ANY (ARRAY['pending'::"text", 'classified'::"text", 'failed'::"text", 'manual'::"text"]))),
    CONSTRAINT "text_projects_highest_bloom_level_check" CHECK ((("highest_bloom_level" >= 1) AND ("highest_bloom_level" <= 6)))
);


ALTER TABLE "public"."text_projects" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_records"
    ADD CONSTRAINT "audit_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_memberships"
    ADD CONSTRAINT "class_memberships_class_id_profile_id_key" UNIQUE ("class_id", "profile_id");



ALTER TABLE ONLY "public"."class_memberships"
    ADD CONSTRAINT "class_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_quality_events"
    ADD CONSTRAINT "data_quality_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_document_id_chunk_index_key" UNIQUE ("document_id", "chunk_index");



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."export_batches"
    ADD CONSTRAINT "export_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mcp_servers"
    ADD CONSTRAINT "mcp_servers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."model_tier_bindings"
    ADD CONSTRAINT "model_tier_bindings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."model_tier_bindings"
    ADD CONSTRAINT "model_tier_bindings_tier_key" UNIQUE ("tier");



ALTER TABLE ONLY "public"."practice_records"
    ADD CONSTRAINT "practice_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_login_id_key" UNIQUE ("login_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prompt_presets"
    ADD CONSTRAINT "prompt_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_capabilities"
    ADD CONSTRAINT "provider_capabilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_capabilities"
    ADD CONSTRAINT "provider_capabilities_provider_id_capability_model_id_key" UNIQUE ("provider_id", "capability", "model_id");



ALTER TABLE ONLY "public"."provider_configs"
    ADD CONSTRAINT "provider_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scenario_tier_bindings"
    ADD CONSTRAINT "scenario_tier_bindings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scenario_tier_bindings"
    ADD CONSTRAINT "scenario_tier_bindings_scenario_key" UNIQUE ("scenario");



ALTER TABLE ONLY "public"."text_projects"
    ADD CONSTRAINT "text_projects_pkey" PRIMARY KEY ("id");



CREATE INDEX "audit_records_auditor_time_idx" ON "public"."audit_records" USING "btree" ("auditor_id", "updated_at" DESC) WHERE ("auditor_id" IS NOT NULL);



CREATE INDEX "audit_records_class_id_idx" ON "public"."audit_records" USING "btree" ("class_id") WHERE ("class_id" IS NOT NULL);



CREATE INDEX "audit_records_class_time_idx" ON "public"."audit_records" USING "btree" ("class_id", "updated_at" DESC) WHERE ("class_id" IS NOT NULL);



CREATE INDEX "audit_records_exportable_idx" ON "public"."audit_records" USING "btree" ("kind", "status", "updated_at" DESC);



CREATE UNIQUE INDEX "class_memberships_one_student_class_idx" ON "public"."class_memberships" USING "btree" ("profile_id") WHERE ("role" = 'student'::"public"."app_role");



CREATE INDEX "conversation_messages_conversation_created_idx" ON "public"."conversation_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "conversations_active_class_idx" ON "public"."conversations" USING "btree" ("class_id", "updated_at" DESC) WHERE (("deleted_at" IS NULL) AND ("source" = 'student_chat'::"public"."interaction_source"));



CREATE INDEX "conversations_active_owner_idx" ON "public"."conversations" USING "btree" ("owner_id", "updated_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "conversations_class_id_idx" ON "public"."conversations" USING "btree" ("class_id") WHERE ("class_id" IS NOT NULL);



CREATE INDEX "conversations_daily_archive_idx" ON "public"."conversations" USING "btree" ("owner_id", "updated_at" DESC) WHERE (("source" = 'student_chat'::"public"."interaction_source") AND ("project_id" IS NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "conversations_prompt_preset_id_idx" ON "public"."conversations" USING "btree" ("prompt_preset_id") WHERE ("prompt_preset_id" IS NOT NULL);



CREATE INDEX "document_chunks_class_id_idx" ON "public"."document_chunks" USING "btree" ("class_id") WHERE ("class_id" IS NOT NULL);



CREATE INDEX "document_chunks_conversation_id_idx" ON "public"."document_chunks" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE INDEX "document_chunks_embedding_hnsw" ON "public"."document_chunks" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE INDEX "document_chunks_owner_id_idx" ON "public"."document_chunks" USING "btree" ("owner_id");



CREATE INDEX "document_chunks_project_id_idx" ON "public"."document_chunks" USING "btree" ("project_id") WHERE ("project_id" IS NOT NULL);



CREATE INDEX "documents_class_id_idx" ON "public"."documents" USING "btree" ("class_id") WHERE ("class_id" IS NOT NULL);



CREATE INDEX "documents_owner_conversation_idx" ON "public"."documents" USING "btree" ("owner_id", "conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE INDEX "documents_project_id_idx" ON "public"."documents" USING "btree" ("project_id") WHERE ("project_id" IS NOT NULL);



CREATE INDEX "idx_audit_auditor" ON "public"."audit_records" USING "btree" ("auditor_id");



CREATE INDEX "idx_audit_kind" ON "public"."audit_records" USING "btree" ("kind");



CREATE INDEX "idx_audit_source_conversation_id" ON "public"."audit_records" USING "btree" ("source_conversation_id");



CREATE INDEX "idx_audit_source_message_id" ON "public"."audit_records" USING "btree" ("source_message_id");



CREATE INDEX "idx_conversations_owner" ON "public"."conversations" USING "btree" ("owner_id");



CREATE INDEX "idx_conversations_project" ON "public"."conversations" USING "btree" ("project_id");



CREATE INDEX "idx_practice_project" ON "public"."practice_records" USING "btree" ("project_id");



CREATE INDEX "idx_practice_student" ON "public"."practice_records" USING "btree" ("student_id");



CREATE INDEX "idx_profiles_login" ON "public"."profiles" USING "btree" ("login_id");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "model_tier_bindings_provider_id_idx" ON "public"."model_tier_bindings" USING "btree" ("provider_id");



CREATE UNIQUE INDEX "practice_records_one_pending_per_project" ON "public"."practice_records" USING "btree" ("student_id", "project_id") WHERE ("evaluation_state" = 'pending'::"text");



CREATE INDEX "practice_records_project_created_idx" ON "public"."practice_records" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "practice_records_student_created_idx" ON "public"."practice_records" USING "btree" ("student_id", "created_at" DESC);



CREATE INDEX "text_projects_class_id_idx" ON "public"."text_projects" USING "btree" ("class_id") WHERE ("class_id" IS NOT NULL);



CREATE UNIQUE INDEX "text_projects_owner_title_normalized_key" ON "public"."text_projects" USING "btree" ("owner_id", "lower"(TRIM(BOTH FROM "title")));



CREATE OR REPLACE TRIGGER "audit_records_touch" BEFORE UPDATE ON "public"."audit_records" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "audit_records_validate_contract" BEFORE INSERT OR UPDATE ON "public"."audit_records" FOR EACH ROW EXECUTE FUNCTION "public"."validate_audit_record_contract"();



CREATE OR REPLACE TRIGGER "class_memberships_validate_contract" BEFORE INSERT OR UPDATE ON "public"."class_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."validate_class_membership_contract"();



CREATE OR REPLACE TRIGGER "classes_touch" BEFORE UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "conversation_messages_validate_contract" BEFORE INSERT OR UPDATE ON "public"."conversation_messages" FOR EACH ROW EXECUTE FUNCTION "public"."validate_conversation_message_contract"();



CREATE OR REPLACE TRIGGER "conversations_touch" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "conversations_validate_contract" BEFORE INSERT OR UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."validate_conversation_contract"();



CREATE OR REPLACE TRIGGER "document_chunks_validate_scope_contract" BEFORE INSERT OR UPDATE ON "public"."document_chunks" FOR EACH ROW EXECUTE FUNCTION "public"."validate_document_chunk_scope_contract"();



CREATE OR REPLACE TRIGGER "documents_touch" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "documents_validate_scope_contract" BEFORE INSERT OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."validate_document_scope_contract"();



CREATE OR REPLACE TRIGGER "mcp_servers_touch" BEFORE UPDATE ON "public"."mcp_servers" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "model_tier_bindings_touch" BEFORE UPDATE ON "public"."model_tier_bindings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "practice_records_sync_project_bloom" AFTER INSERT OR DELETE OR UPDATE ON "public"."practice_records" FOR EACH ROW EXECUTE FUNCTION "public"."sync_project_highest_bloom_from_practice"();



CREATE OR REPLACE TRIGGER "practice_records_validate_contract" BEFORE INSERT OR UPDATE ON "public"."practice_records" FOR EACH ROW EXECUTE FUNCTION "public"."validate_practice_record_contract"();



CREATE OR REPLACE TRIGGER "profiles_touch" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "prompt_presets_touch" BEFORE UPDATE ON "public"."prompt_presets" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "provider_configs_touch" BEFORE UPDATE ON "public"."provider_configs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "scenario_tier_bindings_touch" BEFORE UPDATE ON "public"."scenario_tier_bindings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "text_projects_prevent_delete" BEFORE DELETE ON "public"."text_projects" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_text_project_delete"();



CREATE OR REPLACE TRIGGER "text_projects_sync_contract" BEFORE INSERT OR UPDATE ON "public"."text_projects" FOR EACH ROW EXECUTE FUNCTION "public"."sync_text_project_contract"();



CREATE OR REPLACE TRIGGER "text_projects_touch" BEFORE UPDATE ON "public"."text_projects" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



ALTER TABLE ONLY "public"."audit_records"
    ADD CONSTRAINT "audit_records_auditor_id_fkey" FOREIGN KEY ("auditor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."audit_records"
    ADD CONSTRAINT "audit_records_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."audit_records"
    ADD CONSTRAINT "audit_records_source_conversation_id_fkey" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."audit_records"
    ADD CONSTRAINT "audit_records_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."class_memberships"
    ADD CONSTRAINT "class_memberships_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_memberships"
    ADD CONSTRAINT "class_memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."text_projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_prompt_preset_id_fkey" FOREIGN KEY ("prompt_preset_id") REFERENCES "public"."prompt_presets"("id");



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_chunks"
    ADD CONSTRAINT "document_chunks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."text_projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."text_projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."export_batches"
    ADD CONSTRAINT "export_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."mcp_servers"
    ADD CONSTRAINT "mcp_servers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."model_tier_bindings"
    ADD CONSTRAINT "model_tier_bindings_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_configs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."practice_records"
    ADD CONSTRAINT "practice_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."text_projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."practice_records"
    ADD CONSTRAINT "practice_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prompt_presets"
    ADD CONSTRAINT "prompt_presets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."provider_capabilities"
    ADD CONSTRAINT "provider_capabilities_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_configs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_configs"
    ADD CONSTRAINT "provider_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."text_projects"
    ADD CONSTRAINT "text_projects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."text_projects"
    ADD CONSTRAINT "text_projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "audit_app_student_finalization_read" ON "public"."audit_records" FOR SELECT USING ((("kind" = 'metadata'::"public"."audit_kind") AND ("status" = ANY (ARRAY['approved'::"public"."audit_status", 'exported'::"public"."audit_status"])) AND (("metadata" ->> 'teacher_action'::"text") = 'conversation_finalized'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "audit_records"."source_conversation_id") AND ("c"."owner_id" = "public"."current_app_user_id"()) AND ("c"."source" = 'student_chat'::"public"."interaction_source") AND ("c"."deleted_at" IS NULL))))));



CREATE POLICY "audit_app_teacher_admin_read" ON "public"."audit_records" FOR SELECT USING (("public"."is_admin"() OR ("auditor_id" = "public"."current_app_user_id"()) OR (("class_id" IS NOT NULL) AND "public"."teacher_can_access_class"("class_id"))));



CREATE POLICY "audit_app_teacher_insert" ON "public"."audit_records" FOR INSERT WITH CHECK (("public"."is_admin"() OR ("public"."current_profile_role"() = 'teacher'::"public"."app_role")));



CREATE POLICY "audit_app_teacher_update" ON "public"."audit_records" FOR UPDATE USING (("public"."is_admin"() OR ("auditor_id" = "public"."current_app_user_id"()))) WITH CHECK (("public"."is_admin"() OR ("auditor_id" = "public"."current_app_user_id"())));



ALTER TABLE "public"."audit_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chunks_app_owner_all" ON "public"."document_chunks" USING ((("owner_id" = "public"."current_app_user_id"()) OR "public"."is_admin"())) WITH CHECK ((("owner_id" = "public"."current_app_user_id"()) OR "public"."is_admin"()));



CREATE POLICY "chunks_app_teacher_read" ON "public"."document_chunks" FOR SELECT USING ((("class_id" IS NOT NULL) AND "public"."teacher_can_access_class"("class_id")));



ALTER TABLE "public"."class_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classes_app_admin_all" ON "public"."classes" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "classes_app_member_select" ON "public"."classes" FOR SELECT USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."class_memberships" "cm"
  WHERE (("cm"."class_id" = "classes"."id") AND ("cm"."profile_id" = "public"."current_app_user_id"()))))));



ALTER TABLE "public"."conversation_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_owner_all" ON "public"."conversations" USING ((("owner_id" = "public"."current_app_user_id"()) OR "public"."is_admin"())) WITH CHECK ((("owner_id" = "public"."current_app_user_id"()) OR "public"."is_admin"()));



CREATE POLICY "conversations_teacher_read" ON "public"."conversations" FOR SELECT USING ((("class_id" IS NOT NULL) AND "public"."teacher_can_access_class"("class_id")));



ALTER TABLE "public"."data_quality_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "data_quality_events_admin_all" ON "public"."data_quality_events" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."document_chunks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_app_owner_all" ON "public"."documents" USING ((("owner_id" = "public"."current_app_user_id"()) OR "public"."is_admin"())) WITH CHECK ((("owner_id" = "public"."current_app_user_id"()) OR "public"."is_admin"()));



CREATE POLICY "documents_app_teacher_read" ON "public"."documents" FOR SELECT USING ((("class_id" IS NOT NULL) AND "public"."teacher_can_access_class"("class_id")));



ALTER TABLE "public"."export_batches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exports_app_admin_all" ON "public"."export_batches" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "mcp_app_admin_all" ON "public"."mcp_servers" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."mcp_servers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "memberships_admin_all" ON "public"."class_memberships" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "memberships_member_select" ON "public"."class_memberships" FOR SELECT USING (("public"."is_admin"() OR ("profile_id" = "public"."current_app_user_id"()) OR "public"."teacher_can_access_class"("class_id")));



CREATE POLICY "messages_conversation_scope" ON "public"."conversation_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_messages"."conversation_id") AND (("c"."owner_id" = "public"."current_app_user_id"()) OR "public"."is_admin"() OR (("c"."class_id" IS NOT NULL) AND "public"."teacher_can_access_class"("c"."class_id")))))));



CREATE POLICY "messages_owner_insert" ON "public"."conversation_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_messages"."conversation_id") AND ("c"."owner_id" = "public"."current_app_user_id"())))));



CREATE POLICY "messages_teacher_update" ON "public"."conversation_messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_messages"."conversation_id") AND ("c"."source" = 'student_chat'::"public"."interaction_source") AND ("c"."deleted_at" IS NULL) AND ("c"."class_id" IS NOT NULL) AND "public"."teacher_can_access_class"("c"."class_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_messages"."conversation_id") AND ("c"."source" = 'student_chat'::"public"."interaction_source") AND ("c"."deleted_at" IS NULL) AND ("c"."class_id" IS NOT NULL) AND "public"."teacher_can_access_class"("c"."class_id")))));



ALTER TABLE "public"."model_tier_bindings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "model_tier_bindings_admin_all" ON "public"."model_tier_bindings" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "model_tier_bindings_authenticated_read" ON "public"."model_tier_bindings" FOR SELECT USING ((("public"."current_app_user_id"() IS NOT NULL) AND "is_enabled"));



CREATE POLICY "practice_app_student_all" ON "public"."practice_records" USING ((("student_id" = "public"."current_app_user_id"()) OR "public"."is_admin"())) WITH CHECK ((("student_id" = "public"."current_app_user_id"()) OR "public"."is_admin"()));



CREATE POLICY "practice_app_teacher_read" ON "public"."practice_records" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."text_projects" "p"
  WHERE (("p"."id" = "practice_records"."project_id") AND ("p"."class_id" IS NOT NULL) AND "public"."teacher_can_access_class"("p"."class_id")))));



ALTER TABLE "public"."practice_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "presets_app_admin_all" ON "public"."prompt_presets" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "presets_app_published_read" ON "public"."prompt_presets" FOR SELECT USING ((("status" = 'published'::"public"."prompt_preset_status") OR "public"."is_admin"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_app_admin_all" ON "public"."profiles" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles_app_select" ON "public"."profiles" FOR SELECT USING ((("id" = "public"."current_app_user_id"()) OR "public"."is_admin"()));



CREATE POLICY "projects_owner_all" ON "public"."text_projects" USING ((("owner_id" = "public"."current_app_user_id"()) OR "public"."is_admin"())) WITH CHECK ((("owner_id" = "public"."current_app_user_id"()) OR "public"."is_admin"()));



CREATE POLICY "projects_teacher_read" ON "public"."text_projects" FOR SELECT USING ((("class_id" IS NOT NULL) AND "public"."teacher_can_access_class"("class_id")));



ALTER TABLE "public"."prompt_presets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_app_admin_all" ON "public"."provider_configs" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."provider_capabilities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_caps_admin_all" ON "public"."provider_capabilities" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "provider_caps_authenticated_read" ON "public"."provider_capabilities" FOR SELECT USING ((("public"."current_app_user_id"() IS NOT NULL) AND "is_enabled"));



ALTER TABLE "public"."provider_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scenario_tier_bindings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scenario_tier_bindings_admin_all" ON "public"."scenario_tier_bindings" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "scenario_tier_bindings_authenticated_read" ON "public"."scenario_tier_bindings" FOR SELECT USING ((("public"."current_app_user_id"() IS NOT NULL) AND "is_enabled"));



ALTER TABLE "public"."text_projects" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."authenticate_school_account"("p_login_id" "text", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."authenticate_school_account"("p_login_id" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."authenticate_school_account"("p_login_id" "text", "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."authenticate_user"("p_login_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."authenticate_user"("p_login_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."authenticate_user"("p_login_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_app_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_app_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_profile_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_profile_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_model_tier_provider"("p_tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_model_tier_provider"("p_tier" "text") TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_profile"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_profile"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_provider_capability_provider"("p_capability" "public"."provider_capability") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_provider_capability_provider"("p_capability" "public"."provider_capability") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_valid_app_session_signature"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_valid_app_session_signature"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_student_conversation_finalized"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_student_conversation_finalized"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_student_conversation_finalized"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_conversation_document_chunks"("query_embedding" "extensions"."vector", "conversation_id" "uuid", "match_count" integer, "match_threshold" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."match_conversation_document_chunks"("query_embedding" "extensions"."vector", "conversation_id" "uuid", "match_count" integer, "match_threshold" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_conversation_document_chunks"("query_embedding" "extensions"."vector", "conversation_id" "uuid", "match_count" integer, "match_threshold" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_document_chunks"("query_embedding" "extensions"."vector", "match_count" integer, "match_threshold" double precision, "project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_document_chunks"("query_embedding" "extensions"."vector", "match_count" integer, "match_threshold" double precision, "project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_document_chunks"("query_embedding" "extensions"."vector", "match_count" integer, "match_threshold" double precision, "project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_text_project_delete"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rebuild_scenario_provider_capabilities"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rebuild_scenario_provider_capabilities"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_project_highest_bloom_level"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_project_highest_bloom_level"("p_project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."save_model_tier_binding_and_sync"("p_tier" "text", "p_provider_id" "uuid", "p_model_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_model_tier_binding_and_sync"("p_tier" "text", "p_provider_id" "uuid", "p_model_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_scenario_tier_bindings_and_sync"("p_bindings" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_scenario_tier_bindings_and_sync"("p_bindings" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_project_highest_bloom_from_practice"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_text_project_contract"() TO "service_role";



GRANT ALL ON FUNCTION "public"."teacher_can_access_class"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."teacher_can_access_class"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_audit_record_contract"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_class_membership_contract"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_conversation_contract"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_conversation_message_contract"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_document_chunk_scope_contract"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_document_scope_contract"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_practice_record_contract"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_password"("input_password" "text", "stored_hash" "text") TO "service_role";



GRANT ALL ON TABLE "public"."audit_records" TO "anon";
GRANT ALL ON TABLE "public"."audit_records" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_records" TO "service_role";



GRANT ALL ON TABLE "public"."class_memberships" TO "anon";
GRANT ALL ON TABLE "public"."class_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."class_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."conversation_messages" TO "anon";
GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."conversation_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_messages" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."data_quality_events" TO "anon";
GRANT ALL ON TABLE "public"."data_quality_events" TO "authenticated";
GRANT ALL ON TABLE "public"."data_quality_events" TO "service_role";



GRANT ALL ON TABLE "public"."document_chunks" TO "anon";
GRANT ALL ON TABLE "public"."document_chunks" TO "authenticated";
GRANT ALL ON TABLE "public"."document_chunks" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."export_batches" TO "anon";
GRANT ALL ON TABLE "public"."export_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."export_batches" TO "service_role";



GRANT ALL ON TABLE "public"."mcp_servers" TO "anon";
GRANT ALL ON TABLE "public"."mcp_servers" TO "authenticated";
GRANT ALL ON TABLE "public"."mcp_servers" TO "service_role";



GRANT ALL ON TABLE "public"."model_tier_bindings" TO "anon";
GRANT ALL ON TABLE "public"."model_tier_bindings" TO "authenticated";
GRANT ALL ON TABLE "public"."model_tier_bindings" TO "service_role";



GRANT ALL ON TABLE "public"."practice_records" TO "anon";
GRANT ALL ON TABLE "public"."practice_records" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_records" TO "service_role";



GRANT ALL ON TABLE "public"."prompt_presets" TO "anon";
GRANT ALL ON TABLE "public"."prompt_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."prompt_presets" TO "service_role";



GRANT ALL ON TABLE "public"."provider_capabilities" TO "anon";
GRANT ALL ON TABLE "public"."provider_capabilities" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_capabilities" TO "service_role";



GRANT ALL ON TABLE "public"."provider_configs" TO "anon";
GRANT ALL ON TABLE "public"."provider_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_configs" TO "service_role";



GRANT ALL ON TABLE "public"."scenario_tier_bindings" TO "anon";
GRANT ALL ON TABLE "public"."scenario_tier_bindings" TO "authenticated";
GRANT ALL ON TABLE "public"."scenario_tier_bindings" TO "service_role";



GRANT ALL ON TABLE "public"."text_projects" TO "anon";
GRANT ALL ON TABLE "public"."text_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."text_projects" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







