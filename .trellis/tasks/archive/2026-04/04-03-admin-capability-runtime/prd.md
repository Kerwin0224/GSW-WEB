# Build Admin Settings And Capability Control Page

## Goal

Build the admin settings and capability-control page so it can show:

- provider state
- tool and policy state
- skills and MCP entry points
- current capability toggles

## Why This Task Exists

Settings are part of the admin review surface.

They should be judged as a real page, not left as hidden runtime plumbing.

## Scope

- Build or strengthen the admin settings page
- Show provider, tool, skill, and policy state clearly
- Make toggles legible enough for frontend review
- Keep the page aligned with governance and operations rather than a generic AI platform shell

## Out Of Scope

- Full admin data-factory flow
- Full third-party platform cloning

## Suggested Work Areas

- `frontend/app/admin/skills/page.tsx`
- `frontend/app/admin/templates/page.tsx`
- `frontend/components/dashboard/AdminSkillsWorkspace.tsx`
- `frontend/components/dashboard/AdminTemplatesWorkspace.tsx`
- `frontend/lib/api.ts`

## Acceptance Criteria

- Admin has a reviewable settings page rather than a placeholder shell
- Provider, tool, and policy state are visible
- The page can be judged on clarity and structure before backend completeness
- The result still feels like this product's admin console

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `.trellis/spec/domain/product-scope.md`
- `.trellis/spec/frontend/index.md`
