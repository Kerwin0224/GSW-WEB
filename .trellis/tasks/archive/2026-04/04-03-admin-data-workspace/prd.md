# Build Admin Data Workspace Page

## Goal

Build the admin data-factory page so it can show:

- dataset list-detail structure
- sample typing
- review state
- training-data export interaction

## Why This Task Exists

This page is the visible proof of the future training-data loop.

It belongs at the end of the frontend review order because it depends on the admin side already being legible.

## Scope

- Build the admin data workspace page
- Show dataset-oriented list-detail patterns
- Show sample typing and review state
- Show export interaction shell
- In frontend-demo mode, prioritize visual structure and interaction clarity over real dataset backends

## Out Of Scope

- External labeling-platform embedding
- Broader MLOps platform expansion

## Suggested Work Areas

- `frontend/app/admin/data/page.tsx`
- `frontend/components/dashboard/AdminDataWorkspace.tsx`
- `frontend/lib/api.ts`

## Acceptance Criteria

- Admin can review a data-workspace page in list-detail form
- Sample typing and review state are visible
- Export interaction is presentable
- The page reads as part of the same admin product

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `.trellis/spec/domain/product-scope.md`
- `.trellis/spec/frontend/index.md`
