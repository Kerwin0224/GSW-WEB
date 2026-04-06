# Backend Spec Index

> Backend is the system of record for ownership, audit, Bloom progression, challenge outcomes, and training data signals.

## Backend Priority

Before reading low-level backend guides, first align to:

1. `docs/PRODUCT_SOURCE_OF_TRUTH.md`
2. `docs/prd_decision_v1.md`
3. `docs/demo_scope_v1.md`
4. `../.trellis/spec/domain/product-scope.md`

## Backend Responsibilities

The backend owns:

- Account and role boundaries
- Teacher-student relationships
- Account creation, import, and teacher-transfer handling
- Unified new-conversation entry and later routing
- Normal chat vs poem project routing
- Current and recommended Bloom level state
- Challenge generation and outcome state
- Teacher review events
- Audit trail
- Think audit visibility rules
- Export generation triggers
- Training sample typing and reward labels

## Current Backend Priorities

The backend design should explicitly support:

- Unified role-based login and import-ready account objects
- Student poem projects as long-lived containers
- Sessions as conversation objects under the correct scope
- Current and recommended Bloom signals inside poem projects
- Reward-bearing events
- Teacher overrides as first-class signals
- Admin audit visibility
- Data-factory export paths

## Backend Reuse Rules

Backend should preserve a single internal runtime and reuse external systems as adapters, bridges, or reference models.

Preferred backend reuse style:

- Keep LangGraph as the internal orchestration layer
- Keep local skill registration and project-owned business state in this repository
- Reuse external systems for trace, retrieval patterns, MCP bridges, labeling flows, or export models
- Add adapters around external capabilities instead of replacing the whole runtime

Avoid:

- Replacing the product runtime with a generic third-party platform
- Letting external service models dictate student, teacher, or admin business objects
- Introducing a second overlapping orchestration system unless the PRD explicitly changes

## Current Backend Reuse Priority

The next reuse-heavy backend work should focus on:

1. `backend/app/mcp/` as a real runtime bridge instead of config-only scaffolding
2. Retrieval and citation flow improvements around `graph/retrieve.py` and file indexing
3. Richer trace and audit depth through `langfuse_client.py` and `pipeline.py`
4. Data-factory dataset and JSONL export paths

## Current External Backend References

Use these as implementation references, not as replacement product backends:

- LangGraph and LangChain MCP adapters for orchestration and MCP tool bridging
- Langfuse for trace structure and diagnostics
- Label Studio and Argilla for dataset and annotation object models
- AnythingLLM for document-ingestion and retrieval workflow patterns

## Low-Level Guides

These files remain useful for code-level implementation, but they are secondary to the current PRD:

- [directory-structure.md](./directory-structure.md)
- [database-guidelines.md](./database-guidelines.md)
- [error-handling.md](./error-handling.md)
- [logging-guidelines.md](./logging-guidelines.md)
- [quality-guidelines.md](./quality-guidelines.md)

Use them after confirming that the implementation still matches the current business model.

