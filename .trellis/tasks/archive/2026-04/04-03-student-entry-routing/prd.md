# Build Student Home And Unified Entry Page

## Goal

Build the first student page after login so it can show:

- one unified question entry
- the first-input routing result
- the difference between normal chat and poem project

## Why This Task Exists

This page is the first proof that the student side is not a generic chat shell.

Without it:

- the student experience still looks like a loose chat app
- the routing rule remains invisible
- later Bloom and challenge surfaces lose context

## Scope

- Build the student landing page
- Keep one unified new-question entry
- Show route outcomes for normal chat versus poem project
- Show generated chat title behavior for normal chat
- In frontend-demo mode, allow routing results to be simulated with local state or mock data

## Out Of Scope

- Deep resource-dock UI
- Full challenge flow
- Full teacher intervention logic

## Suggested Work Areas

- `frontend/components/dashboard/StudentWorkspace.tsx`
- `frontend/app/page.tsx`
- `frontend/lib/api.ts`

## Acceptance Criteria

- Student has one clear first page after login
- The page supports one unified first question entry
- The route outcome is visible and understandable
- Normal chat and poem project no longer feel like the same thing
- The page can be reviewed without backend setup

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `.trellis/spec/domain/product-scope.md`
- `.trellis/spec/frontend/index.md`
