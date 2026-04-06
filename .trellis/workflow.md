# Trellis Workflow

> This repository uses Trellis as a context system, not as a source of product truth.
> The product source of truth lives in `/docs`, and `.trellis` exists to keep future sessions aligned with it.

## Source Of Truth

Always align to these documents first:

1. `docs/PRODUCT_SOURCE_OF_TRUTH.md`
2. `docs/prd_decision_v1.md`
3. `docs/demo_scope_v1.md`

Do not infer product direction from old tasks, legacy specs, or discarded implementation spikes.

## Session Start

When starting a new session:

1. Read `AGENTS.md`
2. Read this file
3. Read `.trellis/workspace/index.md`
4. Read `.trellis/spec/domain/index.md`
5. Read `.trellis/spec/frontend/index.md`
6. Read `.trellis/spec/backend/index.md`
7. Read the active task pointed to by `.trellis/.current-task`

## Reading Order

Use this order when you need context quickly:

1. Product truth in `/docs`
2. Domain scope in `.trellis/spec/domain/product-scope.md`
3. Frontend and backend index docs
4. Active task PRD
5. Lower-level implementation guides only if you are already coding

## Development Research Defaults

When implementation depends on external libraries, frameworks, or SDK behavior:

1. Use Context7 first for official documentation lookup
2. Use project-local code and active task PRD second
3. Use web search only for recency-sensitive product or service behavior

Use grok-search when you need current web results, recent API behavior, or multi-source comparison.
Do not replace Context7 with generic web search for ordinary library reference reading.

## Working Rules

- Update product understanding in `/docs` before rewriting execution details in `.trellis/spec`.
- Update `.trellis/spec` before creating or advancing implementation tasks.
- Keep only one active product direction in `.trellis/tasks`.
- Archive abandoned directions instead of leaving them in active task folders.
- Treat old low-level spec files as legacy until they are explicitly refreshed.

## Strict Trellis Mode

This repository should now be operated in strict Trellis mode.

That means:

- Do not implement outside the active task path
- Do not start coding from chat alone when the task is unclear
- If output is not what the user wants, revise the task PRD or `.trellis/spec` first, then continue
- Do not archive a task just because some code was written
- Only `finish` or `archive` a task after the result is explicitly accepted as directionally correct
- Keep cleanup tasks separate from product implementation tasks
- Keep parent reset or framing tasks open while their child implementation tasks are still active

## Task Flow

Use a simple flow:

`clarify product -> sync spec -> create task -> implement -> verify -> record`

### Clarify Product

- Resolve ambiguity in the PRD and decision draft first.
- Do not start code if the student / teacher / admin boundaries are still drifting.

### Sync Spec

- Refresh domain scope first.
- Then refresh frontend and backend entry specs.
- Only after that should you touch task plans.

### Create Or Advance Tasks

- Each active task must point back to the current PRD direction.
- If a task no longer matches the PRD, archive it instead of patching around it.
- If a task is too broad, split it into child tasks before implementation.
- If a result is unsatisfactory, revise the task instead of pretending it is done.

### Implement

- Follow the relevant frontend or backend guides after the top-level spec agrees with the PRD.
- Implement only within the currently selected task context.
- If a different concern appears, create or switch to the correct task instead of mixing concerns.

### Verify

- Verify behavior against product responsibilities, not just against code execution.
- Verify against the active task PRD and current spec, not against stale expectations from old task trees.

### Record

- Keep workspace notes short and current.
- Prefer one correct active task over many stale ones.
- Record decision shifts in Trellis as soon as they become real, instead of leaving them in chat only.

