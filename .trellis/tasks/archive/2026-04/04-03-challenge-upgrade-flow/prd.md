# Build Challenge Surface And Upgrade Feedback

## Goal

Build the student challenge surface so the frontend can show:

- challenge entry
- challenge content
- student response state
- post-challenge upgrade feedback

## Why This Task Exists

Challenge is the visible mechanism of Bloom progression.

If challenge is missing or weak:

- Bloom feels static
- the upgrade path is not believable
- the student-side review stops too early

## Scope

- Add or strengthen the challenge surface in the student flow
- Make challenge launch visible from poem context
- Show result and upgrade feedback clearly
- In frontend-demo mode, allow challenge content and outcome transitions to be simulated

## Out Of Scope

- Full teacher queue handling
- Rich resource-dock expansion beyond challenge needs

## Suggested Work Areas

- `frontend/components/dashboard/StudentWorkspace.tsx`
- `frontend/app/challenge/page.tsx`
- `frontend/lib/api.ts`

## Acceptance Criteria

- Student can clearly enter the challenge state
- The challenge interaction is reviewable front to back
- Upgrade feedback is visible and understandable
- The result proves the student-side progression story in frontend-only mode

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `.trellis/spec/domain/product-scope.md`
- `.trellis/spec/frontend/index.md`
