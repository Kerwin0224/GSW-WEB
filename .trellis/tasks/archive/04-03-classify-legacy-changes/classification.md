# Legacy Change Classification

## Purpose

This document classifies the current repo state before any cleanup action is taken.

The goal is not to delete files.
The goal is to separate:

1. historical direction
2. still-valid implementation foundation
3. cleanup noise
4. unclear areas that need a later decision

## Category 1: Historical Direction Only

These should not be revived as active product direction.

### A. Archived task lines that no longer match the current PRD

Evidence:

- old task folders live under `.trellis/tasks/archive/`
- they reflect earlier direction or execution framing that is no longer the active product path

Classification:

- historical task direction

Decision:

- do not revive archived task folders as active implementation guidance
- use them only as historical context when needed

### B. Old product shells or framing that drifted toward LMS-first or generic platform behavior

Evidence:

- archived LearnHouse and similar direction shifts
- stale task trees that predate the current PRD reset

Classification:

- historical product direction only

Decision:

- do not restore these as active design or implementation authority

## Category 2: Still-Valid Implementation Foundation

These are still part of the current product path and should be preserved and evolved.

### A. `.trellis`

Evidence:

- the directory exists and drives the active session workflow
- current task tree, workflow, and workspace notes live here

Classification:

- active project-operating system

Decision:

- preserve
- continue to update here only

### B. `backend`

Evidence:

- the directory exists
- current backend work aligns with student, teacher, admin, audit, and export responsibilities

Classification:

- active backend foundation

Decision:

- preserve
- continue to evolve under the rebuilt task tree

### C. `frontend`

Evidence:

- current work aligns with student, teacher, and admin surfaces

Classification:

- active frontend foundation

Decision:

- preserve
- evolve through the rebuilt task tree

### D. `docs`

Evidence:

- product source of truth lives here
- `PRODUCT_SOURCE_OF_TRUTH.md`, `prd_decision_v1.md`, and `demo_scope_v1.md` are the active references

Classification:

- active product-truth layer

Decision:

- preserve
- treat as upstream to Trellis and implementation

### E. `.trellis/tasks/archive/*`

Evidence:

- archive directories exist on disk
- old task folders are intentionally stored there

Classification:

- valid archival structure inside the active Trellis root

Decision:

- preserve
- treat these as historical reference, not cleanup noise by default

## Category 3: Cleanup Noise Requiring Dedicated Follow-Up

These should not be resolved opportunistically inside feature work.

### A. Task-archive movement churn under `.trellis/tasks`

Examples:

- old task path deletions
- new archive directory additions

Why this is cleanup noise:

- the directional decision is already made
- what remains is mostly archival reconciliation and repository tidiness

Decision:

- treat as Trellis-maintenance cleanup, not as product work

### B. Runtime or local-environment artifacts

Examples:

- local caches
- generated exports
- local model binaries

Why this is cleanup noise:

- they are environment-specific
- they can pollute repo reasoning without changing product direction

Decision:

- keep them out of feature tasks
- manage them through ignore rules and dedicated cleanup when needed

## Category 4: Unclear Or Needs Explicit Decision Later

These are not severe blockers, but they should not be resolved by assumption.

### A. Supporting docs outside the product-truth trio

Examples:

- reuse mappings
- historical notes
- auxiliary research docs

Decision for now:

- keep them as supporting context
- do not treat them as source-of-truth documents

### B. AI workflow entry files such as `AGENTS.md` and `.claude/`

Decision for now:

- keep them because they still have operational value
- do not confuse them with product requirements

## Recommended Operating Rule After This Classification

From now on:

1. Treat `.trellis` as the only active Trellis root
2. Treat `backend` and `frontend` as the active runtime and UI roots
3. Treat `docs` as the active product-truth source
4. Treat only the source-of-truth trio in `docs/` as direction-setting
5. Treat archive folders under `.trellis/tasks/archive/` as valid archival structure
6. Do not restore archived directions during feature work
7. Do not mix cleanup commits into implementation tasks

## Recommended Next Step

After this classification is accepted:

- keep `04-03-classify-legacy-changes` as the cleanup-framing record
- continue implementation through:
  1. `04-03-student-entry-routing`
  2. `04-03-poem-project-bloom-core`
  3. `04-03-challenge-upgrade-flow`
  4. `04-03-teacher-intervention-release`
  5. `04-03-admin-audit-and-export`
  6. `04-03-student-resource-workspace`
  7. `04-03-admin-capability-runtime`
  8. `04-03-admin-data-workspace`

If cleanup is later desired:

- create a dedicated follow-up cleanup task or commit
- keep it separate from feature implementation
