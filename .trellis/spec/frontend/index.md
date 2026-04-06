# Frontend Spec Index

> Frontend work must follow the current product split:
> student, teacher, admin.
> Do not start from a generic shell and force the product into it.

## Frontend Priority

Before reading low-level frontend guidelines, first align to:

1. `docs/PRODUCT_SOURCE_OF_TRUTH.md`
2. `docs/prd_decision_v1.md`
3. `docs/demo_scope_v1.md`
4. `../.trellis/spec/domain/product-scope.md`

## Surface Responsibilities

### Student

- Question-first workbench
- Normal chat plus poem projects
- Current and recommended Bloom level always visible in poem projects
- Challenge entry in project top bar
- Teacher feedback visible but not overloaded

### Teacher

- Teaching workbench
- Default home is school-wide / class learning status
- Unified conversation entry still exists
- Own poem projects for preparation
- School-wide / class learning views plus intervention queues

### Admin

- School dashboard
- Audit and settings
- Data production and labeling mode

## UI Direction

Frontend must optimize for:

- Clear role separation
- Minimal explanatory copy
- Strong product feel
- High visual quality
- No course-platform shell
- No generic admin-template look on student surfaces

## Demo Delivery Mode

When the current implementation target is a frontend-only demo:

- Prefer mock data, stubbed adapters, and local state over waiting on backend completion
- Prefer a role switcher or separate demo entries over real auth gating
- Make primary flows clickable even if the action is simulated
- Prioritize presentable surface quality and role differentiation over production completeness
- Keep simulated states explicit enough that later backend wiring remains straightforward

## Design Reuse Rules

Frontend is allowed to borrow from strong external products, but only at the module level.

Preferred borrowing style:

- Fork or recreate a small module, then adapt it into the current design language
- Borrow panel structure, list-detail layouts, card composition, and state treatment
- Keep typography, spacing rhythm, and role identity coherent across the product

Avoid:

- Full-page cloning
- Full-shell adoption
- Mixed visual languages that make student, teacher, and admin feel like different products

## Current Reference Families

Use these as directionally strong references, not as product shells:

### Student

- DeepStudent for workbench layout and learning-side panel structure
- AnythingLLM for resource dock, upload flow, and citation treatment
- Open WebUI for explicit capability toggles and tool-state visibility

### Teacher

- Moodle for review queue and marking workflow structure
- TAO CE for challenge and assessment authoring patterns
- Open edX educator surfaces for teacher dashboard segmentation

### Admin

- Langfuse for trace and run-diagnostics views
- Label Studio for list-detail data-factory and annotation flows
- Open WebUI or AnythingLLM for provider, tool, and capability-control layouts

## Current Frontend Reuse Priority

Before inventing a new page pattern from scratch:

1. Check whether an existing project screen already solves it
2. Check whether a small external module is a better starting point
3. Fork or recreate the module into the current system if it will materially improve quality
4. Keep the final result consistent with the project's own visual language

## Low-Level Guides

The files below are still useful for coding conventions, but they are not product-direction documents:

- [directory-structure.md](./directory-structure.md)
- [component-guidelines.md](./component-guidelines.md)
- [hook-guidelines.md](./hook-guidelines.md)
- [state-management.md](./state-management.md)
- [quality-guidelines.md](./quality-guidelines.md)
- [type-safety.md](./type-safety.md)

Use them only after the current surface responsibility is already clear.

