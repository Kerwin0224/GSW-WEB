# Reset Trellis Around Current PRD

## Goal

Rebuild the active Trellis context so future sessions start from the current product truth instead of old experiments, LMS drift, or stale task trees.

## Why This Task Exists

The project direction has been reset around:

- Student workbench
- Teacher workbench
- Admin governance and audit
- Bloom cognitive progression
- Challenge and teacher review
- Data-factory support for future post-training

Earlier task lines and specs no longer reflect that direction consistently.

## Scope

- Reset active workflow entry docs
- Reset top-level domain/frontend/backend spec indexes
- Encode the current module-level reuse and page-borrowing strategy into Trellis
- Point the active task system at the current PRD direction
- Archive old task directions instead of leaving them active
- Create the next implementation task set under this reset task so future work starts from aligned Trellis tasks

## Acceptance Criteria

- New sessions read the correct `/docs` PRD files first
- `.trellis/workflow.md` matches the current operating order
- `.trellis/spec/domain/product-scope.md` reflects the current product split
- `.trellis/spec/frontend/index.md` and `.trellis/spec/backend/index.md` stop implying generic templates are authoritative
- `.trellis/spec` makes it explicit that external references are used at module level, not as full product shells
- Trellis guidance allows targeted fork-and-modify for small modules while preserving the product's own identity
- The active task tree no longer points at LearnHouse or other abandoned directions
- The next implementation tasks are pre-created and linked to this reset task

## Planned Child Tasks

- `04-03-classify-legacy-changes`
- `04-05-frontend-demo-delivery`
- `04-03-student-entry-routing`
- `04-03-account-identity-and-import`
- `04-03-poem-project-bloom-core`
- `04-03-challenge-upgrade-flow`
- `04-03-teacher-intervention-release`
- `04-03-admin-audit-and-export`
- `04-03-student-resource-workspace`
- `04-03-admin-capability-runtime`
- `04-03-admin-data-workspace`

See also:

- `task-map.md` for what each child task means, why it exists, and how old changes should be interpreted

## Current Execution Focus

The current implementation focus is the frontend-demo delivery track.

That means:

- frontend presentation quality matters more than backend completeness
- mock data is acceptable when it preserves the intended product interaction
- login, export, challenge, and review may be demonstrated through frontend interaction shells before real backend wiring

## Suggested Execution Order

Implementation track:

1. `04-05-frontend-demo-delivery`
2. `04-03-student-entry-routing`
3. `04-03-poem-project-bloom-core`
4. `04-03-challenge-upgrade-flow`
5. `04-03-teacher-intervention-release`
6. `04-03-admin-audit-and-export`
7. `04-03-account-identity-and-import`
8. `04-03-admin-data-workspace`
9. `04-03-student-resource-workspace`
10. `04-03-admin-capability-runtime`

Cleanup framing track:

1. `04-03-classify-legacy-changes`
