# Build Teacher Workbench And Intervention Page

## Goal

Build the main teacher workbench page so it can show:

- review queue
- student context
- intervention actions
- Bloom adjustment
- release state

## Why This Task Exists

Teacher authority is a core product promise.

This page is where the system proves it is a teaching workbench rather than a student-only chat product.

## Scope

- Build or strengthen the teacher workbench page
- Show queue and action-required context clearly
- Show comments, conclusions, answer correction, and Bloom adjustment on the page
- Make release state legible enough for demo review
- In frontend-demo mode, allow queue contents and intervention state changes to be simulated

## Out Of Scope

- Full LMS shell behavior
- Generic assignment-platform expansion

## Suggested Work Areas

- `frontend/components/dashboard/TeacherWorkspace.tsx`
- `frontend/app/teacher/review/page.tsx`
- `frontend/lib/api.ts`

## Acceptance Criteria

- Teacher page has a clear queue and detail focus
- Intervention actions are visible and understandable
- Student-facing release state is distinguishable from internal review state
- The page can be reviewed without backend review plumbing

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `.trellis/spec/domain/product-scope.md`
- `.trellis/spec/frontend/index.md`
