# Frontend Demo Delivery Track

## Goal

Drive the current frontend demo as a page-by-page review track.

The implementation should now be judged through four primary review surfaces:

- login page
- student page
- teacher page
- admin page

Each page can contain multiple panels or tabs, but the review order should stay page-first rather than capability-fragment-first.

## Why This Task Exists

The current frontend implementation already contains page-level routes for the major demo surfaces.

The previous task breakdown split the work too finely across routing, Bloom, resource, challenge, audit, and settings slices.
That task shape no longer matches how the user wants to review the product.

If the task tree stays fragmented:

- task status becomes misleading
- already-built pages still look "not started"
- future sessions may keep optimizing sub-flows without finishing the visible pages

## Scope

- Keep the frontend demo organized around four reviewable pages
- Use mock data, mock adapters, and local state where backend behavior is not ready
- Keep page-level navigation and core interactions clickable
- Let each page show the main product story for that role without requiring backend completion

## Out Of Scope

- Real authentication and authorization enforcement
- Real training-data export generation
- Real challenge generation runtime
- Full backend object completeness
- Production readiness hardening

## Delivery Rules

- Review and iterate page by page
- Treat secondary panels as part of the current page task, not as separate top-level demo tasks
- Prefer finishing the visible page shell and main states before polishing deeper subflows
- Keep role boundaries visually strong even when data is mocked
- Record simulated states clearly enough that later backend wiring remains straightforward

## Frontend Review Order

1. `04-06-login-page`
2. `04-06-student-page`
3. `04-06-teacher-page`
4. `04-06-admin-page`

## Demo Slice By Task

- `04-06-login-page`: login, role entry, demo account affordances, and account/import access entry
- `04-06-student-page`: unified question entry, routing result, poem project state, Bloom state, resource state, and challenge entry
- `04-06-teacher-page`: teacher workbench, queue, student context, intervention actions, and release state
- `04-06-admin-page`: overview, audit, settings, capability control, data workspace, and export entry

## Acceptance Criteria

- A reviewer can move through the frontend page by page without backend setup
- The login page is presentable enough to open the demo
- The student page can express the student product loop without splitting review across multiple child tasks
- The teacher page can express intervention and release clearly on one primary surface
- The admin page can express governance, audit, settings, and data-production direction in one reviewable page family
- Each child task maps to a visible page rather than an abstract capability fragment

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `.trellis/spec/domain/product-scope.md`
- `.trellis/spec/frontend/index.md`
