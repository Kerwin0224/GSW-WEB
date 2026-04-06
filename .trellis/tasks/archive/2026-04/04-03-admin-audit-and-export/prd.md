# Build Admin Overview And Audit Surfaces

## Goal

Build the first admin review surfaces for:

- school overview
- Bloom distribution
- teacher filtering
- audit list-detail flow
- export entry

## Why This Task Exists

Admin has to look like a real governance surface.

If this page cluster is weak:

- admin looks like an afterthought
- audit value stays abstract
- the training-data direction is not credible

## Scope

- Build the admin overview page
- Build the audit list-detail review flow
- Show export entry in the same reviewable admin path
- Keep settings secondary to overview and audit on this task
- In frontend-demo mode, allow records and export affordances to be represented with mock data

## Out Of Scope

- Full data-factory workspace
- Deep capability-control work

## Suggested Work Areas

- `frontend/components/dashboard/AdminTraceWorkspace.tsx`
- `frontend/app/admin/traces/page.tsx`
- `frontend/lib/api.ts`

## Acceptance Criteria

- Admin can review school-level overview state
- Admin can inspect audit records in a list-detail pattern
- Export entry is visible
- The result feels like a governance console instead of a thin technical stub

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `.trellis/spec/domain/product-scope.md`
- `.trellis/spec/frontend/index.md`
