# Classify Legacy Changes And Cleanup Noise

## Goal

Classify the current old and noisy repo changes before any cleanup action is taken.

This task exists to answer:

- Which old changes are just historical direction?
- Which old changes still contain implementation value?
- Which old changes are cleanup noise and should be handled separately?

## Why This Task Exists

The current repo state contains a mix of:

- active `.trellis`, `backend`, `frontend`, and `docs`
- archived task movement under `.trellis/tasks/archive/`
- older direction changes that no longer match the current PRD
- runtime and documentation churn that can be mistaken for product work

Without classification, future cleanup risks deleting useful foundations or reviving the wrong historical direction.

## Scope

- Inspect the current worktree state as context
- Separate old changes into a small set of clear categories
- Define what should be:
  - kept and evolved
  - archived as history
  - cleaned in a separate follow-up task
  - left unresolved until more context is available
- Update Trellis notes so future sessions do not misread old noise as product direction

## Out Of Scope

- Large destructive cleanup
- Blind deletion of old files
- Product implementation work
- Refactoring runtime code for cosmetic repo tidiness

## Classification Target

The expected output is a classification, not a deletion spree.

Preferred categories:

1. Historical direction only
2. Still-valid implementation foundation
3. Cleanup noise requiring a dedicated follow-up
4. Unclear and needs explicit decision later

## Acceptance Criteria

- The current major old-change clusters are classified
- Future sessions can tell which old paths are irrelevant directionally
- Useful implementation foundations are explicitly marked as still usable
- Cleanup is separated from product implementation
- No important path is deleted just because it looks old

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `.trellis/tasks/04-03-prd-spec-reset/prd.md`
- `.trellis/tasks/04-03-prd-spec-reset/task-map.md`
- `.trellis/spec/domain/product-scope.md`

## Practical Focus

This task should pay special attention to:

- active `.trellis` versus archived task structure
- old archived task movement versus current active tasks
- backend or docs path churn that may be historical rather than product-relevant
- current implementation files that still match the new product direction
