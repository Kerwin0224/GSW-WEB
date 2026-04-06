# Build Admin Page

## Goal

Treat the admin side as one reviewable page family under one top-level task.

This page should express school overview, audit, settings, capability control, data workspace, and export direction without fragmenting the task tree.

## Scope

- Show school overview and Bloom distribution
- Show audit list-detail review flow
- Show settings and capability-control entry
- Show data workspace direction and export entry
- Keep multiple admin routes acceptable as long as they belong to one page-level admin review task

## Out Of Scope

- Full governance backend completeness
- Real JSONL export generation
- Final dataset workflow depth

## Acceptance Criteria

- The admin page family reads as a governance and data-production surface
- Audit is visible and reviewable
- Settings and data-production direction are present
- Review does not require splitting admin work into multiple top-level tasks

## References

- `frontend/app/admin/traces/page.tsx`
- `frontend/app/admin/skills/page.tsx`
- `frontend/app/admin/templates/page.tsx`
- `frontend/components/dashboard/AdminTraceWorkspace.tsx`
- `frontend/components/dashboard/AdminSkillsWorkspace.tsx`
- `frontend/components/dashboard/AdminTemplatesWorkspace.tsx`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
