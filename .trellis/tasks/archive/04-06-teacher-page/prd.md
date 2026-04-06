# Build Teacher Page

## Goal

Treat the teacher side as one primary review page.

This page should show the teacher workbench, review queue, intervention controls, Bloom adjustment, and release state together.

## Scope

- Show school or class review context
- Show a queue or action-needed view
- Show student detail and intervention controls
- Show comments, conclusions, answer correction, and Bloom adjustment
- Show release state clearly enough for demo review

## Out Of Scope

- Full LMS shell behavior
- Deep class-management expansion
- Production review plumbing

## Acceptance Criteria

- The teacher page reads as a teaching workbench
- Queue and detail focus are clear
- Intervention and release states are understandable
- Review does not require splitting the teacher story across multiple top-level tasks

## References

- `frontend/app/teacher/review/page.tsx`
- `frontend/components/dashboard/TeacherWorkspace.tsx`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
