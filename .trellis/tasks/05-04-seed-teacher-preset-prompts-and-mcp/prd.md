# Seed Teacher Preset Prompts and MCP

## Goal

Populate the database with three published teacher-facing preset system prompts and one Tavily HTTP MCP server so teachers/admins can choose useful defaults in the app.

## Requirements

* Insert or update three `prompt_presets` rows for `target_role = 'teacher'` and `status = 'published'`.
* Each preset must include a useful `title`, `scenario`, `system_instruction`, `user_template`, `variables`, and `version`.
* Insert or update one `mcp_servers` row for the Tavily HTTP MCP endpoint provided by the user.
* Store the MCP authorization token in the app's existing secret JSON format rather than exposing it in public fields.
* Verify inserted rows by querying the remote DB after writes.

## Acceptance Criteria

* [ ] Remote DB contains three published teacher prompt presets.
* [ ] Remote DB contains an enabled Tavily MCP server with the expected endpoint.
* [ ] Verification query returns the inserted/updated records without exposing full secrets.

## Definition of Done

* Remote DB write succeeds.
* Read-back verification succeeds.
* No code changes needed unless schema/constraints require it.

## Technical Approach

Use existing tables discovered in migrations: `public.prompt_presets` and `public.mcp_servers`. Apply idempotent SQL upserts keyed by stable UUIDs or conflict-compatible fields, then read back non-secret columns.

## Decision (ADR-lite)

**Context**: User asked to populate operational DB data, not add UI behavior.
**Decision**: Seed directly via Supabase MCP SQL using existing tables and existing secret-ref JSON shape.
**Consequences**: Fast and idempotent; no migration committed unless repo conventions require persistent seed history.

## Out of Scope

* New prompt preset UI features.
* Provider model/capability setup beyond the requested MCP server.
* Full live MCP tool invocation unless app exposes a safe test endpoint.

## Technical Notes

* `prompt_presets` fields found in `web/supabase/migrations/202605020001_fullstack_refactor.sql` and `web/supabase/migrations/202605030001_school_account_login_compat.sql`.
* `mcp_servers` fields found in `web/supabase/migrations/202605020001_fullstack_refactor.sql`.
* Admin data actions in `web/src/lib/data/admin.ts` encrypt secrets for UI-created records; direct SQL seed must avoid exposing token in public result output.
