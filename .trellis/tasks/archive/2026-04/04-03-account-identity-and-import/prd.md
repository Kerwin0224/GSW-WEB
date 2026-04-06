# Build Login And Role Entry Surfaces

## Goal

Build the demo front door for:

- login
- role entry
- account and import access

The result should be a page cluster that can open the frontend demo without apology.

## Why This Task Exists

This is the first reviewer touchpoint.

If the front door is weak:

- the whole demo feels weak
- role separation starts too late
- account and import become background assumptions instead of visible product surfaces

## Scope

- Build the login page as a presentable demo entry
- Show role selection for student, teacher, and admin
- Connect each role to the correct frontend landing page
- Expose account and import surfaces needed for demo review
- In frontend-demo mode, allow login, create, and import flows to be represented with mock results

## Out Of Scope

- Real authentication enforcement
- Full school-org complexity
- External SSO integration

## Suggested Work Areas

- `frontend/app/login/page.tsx`
- `frontend/app/accounts/page.tsx`
- `frontend/components/dashboard/AccountsWorkspace.tsx`
- `frontend/lib/api.ts`

## Acceptance Criteria

- The login page is strong enough to open a demo
- Student, teacher, and admin entry choices are visually clear
- Role landing routes are explicit
- Account and import surfaces are visible and reviewable
- The result feels like this product's front door, not a generic backend login

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `.trellis/spec/domain/product-scope.md`
- `.trellis/spec/frontend/index.md`
