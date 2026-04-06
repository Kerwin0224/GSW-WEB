# Build Student Resource Workspace Surface

## Goal

Build the student resource surface around the learning page, including:

- resource dock
- upload state
- citation or source cards

## Why This Task Exists

The student side should feel like a learning workbench, not just a message thread.

This task makes the supporting materials visible enough for frontend review.

## Scope

- Add the resource-side UI inside the student workbench
- Show upload and ingestion state
- Show retrieval-backed citation or source treatment
- Keep poem and Bloom identity visible while materials are present

## Out Of Scope

- Full student-shell rewrite
- Copying an external workspace shell

## Suggested Work Areas

- `frontend/components/dashboard/StudentWorkspace.tsx`
- `frontend/lib/api.ts`

## Acceptance Criteria

- Student can see learning materials in a dedicated resource area
- Upload or ingestion state is visible instead of implicit
- Source treatment is legible enough to review
- The result still feels like the same student product surface

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `.trellis/spec/frontend/index.md`
- `.trellis/spec/domain/product-scope.md`
