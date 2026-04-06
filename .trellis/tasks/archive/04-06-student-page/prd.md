# Build Student Page

## Goal

Treat the student side as one primary review page.

This page should carry the student product loop from unified question entry through poem-project state, Bloom state, and challenge entry.

## Scope

- Keep one unified first-question entry
- Show normal chat versus poem-project routing outcome
- Show current and recommended Bloom level in poem context
- Show resource, upload, and citation state as part of the same student page
- Show challenge entry and upgrade feedback in the same page family

## Out Of Scope

- Full backend routing runtime
- Final challenge-generation logic
- Production-grade persistence details

## Acceptance Criteria

- The student page feels like a learning workbench, not a generic chat shell
- Unified entry and route result are understandable
- Bloom and challenge are visibly part of the student experience
- Review does not require splitting the student story across multiple top-level tasks

## References

- `frontend/app/student/page.tsx`
- `frontend/components/dashboard/StudentWorkspace.tsx`
- `frontend/app/question/page.tsx`
- `frontend/app/challenge/page.tsx`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
