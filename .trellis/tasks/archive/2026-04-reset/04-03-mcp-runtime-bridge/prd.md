# Build MCP Runtime Bridge

## Goal

Turn the current admin-side MCP configuration surface into a real runtime bridge.

This task now follows the admin capability workspace task.
It is responsible for making visible admin-side controls materially affect runtime, not for being the first place where the admin control surface becomes legible.

The result should let the system:

- Register providers
- Validate provider configuration
- Discover available tools
- Enable or disable tools at runtime
- Expose health and last-error status back to admin
- Route allowed MCP tool usage into the existing backend runtime without replacing LangGraph
- Explicitly model `grok-search` and `UltraRAG` in the project runtime provider strategy

## Why This Task Exists

The current product direction explicitly includes admin control over:

- MCP
- Skills
- Search
- Upload
- Model-adjacent capability switches

The current codebase already has:

- Admin MCP config storage
- Admin skills snapshot endpoints
- Admin capability-control UI

But it does not yet have a real MCP runtime layer behind those controls.

That gap makes the admin surface partially cosmetic.

The capability workspace should be visible first.
This task then makes that workspace real.

This task also needs to align the provider set with the actual project plan:

- Context7 is part of the development-time documentation workflow and should be acknowledged in Trellis guidance, but it is not a project runtime provider
- grok-search is the current web-search-capable MCP-facing provider for runtime search
- UltraRAG is the target MCP-facing RAG provider for future retrieval and generation expansion

## Scope

- Build `backend/app/mcp/` into a real adapter layer
- Keep LangGraph as the internal runtime
- Keep project-owned skills and business state inside this repo
- Wire MCP provider and tool state into admin snapshots
- Add validation and health reporting
- Make failure states observable and non-fatal

## Out Of Scope

- Replacing LangGraph with a third-party orchestration platform
- Building the first visible admin capability workspace shell
- Turning admin into a generic multi-tool AI platform shell

## Suggested Work Areas

- `backend/app/mcp/provider_registry.py`
- `backend/app/mcp/client_manager.py`
- `backend/app/mcp/tool_loader.py`
- `backend/app/mcp/runtime_bridge.py`
- `backend/app/main.py`
- `backend/app/pipeline.py`

## Acceptance Criteria

- Admin snapshot returns real provider and tool status rather than config-only placeholders
- Provider configuration is validated before being marked healthy
- Tool enable or disable state materially affects runtime behavior
- Runtime failures degrade safely and are visible in admin status
- The LangGraph runtime remains the core orchestrator
- MCP is implemented as a bridge, not as a second product runtime

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `docs/open_source_reuse_module_mapping_v1.md`
- `.trellis/spec/backend/index.md`
- `.trellis/spec/domain/product-scope.md`

## External Reference Direction

- LangChain MCP adapters
- Open WebUI capability-control patterns
- AnythingLLM provider and tool-management patterns
- Context7 for official framework and SDK lookup during development
- xAI tool and remote MCP docs for grok-search-side integration
- UltraRAG official docs and repo for MCP-based RAG server structure

