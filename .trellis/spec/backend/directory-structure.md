# Backend Directory Structure

> Module layout for the SLM backend. Follow this structure when implementing the runnable v1 app.

---

## Root Layout

```text
app/
├── main.py              # FastAPI entry point, mounts routers and lifespan
├── config.py            # Model path, DB path, constants
├── db.py                # SQLite init and persistence helpers
├── models.py            # Pydantic models / result schemas
├── graph/
│   ├── state.py         # PipelineState TypedDict
│   ├── grounding.py     # Step 1: content recognition (Fground)
│   ├── routing.py       # Step 2: route selection (FCART)
│   ├── retrieve.py      # Step 3: local retrieval / RAG
│   ├── generate.py      # Step 3: model generation (FCoT)
│   ├── validate.py      # Step 4: output validation (FLQC)
│   └── pipeline.py      # Assembles the full LangGraph graph
├── skills/
│   ├── lesson_outline.py
│   ├── question_analysis.py
│   ├── guided_explain.py
│   └── export.py
└── mcp/
    ├── server.py        # FastMCP server, registers runtime tools
    └── admin.py         # Admin-only tool list, status, hot reload

data/
├── db.sqlite
└── chroma/

exports/
models/
```

## v1 Boundary

- `lesson_outline.py` / `question_analysis.py` / `guided_explain.py` are the only default task skills in v1
- `practice_gen.py`、`review_card.py`、`learning_summary.py` 如保留，只能作为 v2 预留代码，不得接入默认路由
- `export.py` 负责 Word / JSON 导出和聊天记录导出

## Key Conventions

- Each `graph/` node is a pure function: `(state: PipelineState) -> PipelineState`
- `main.py` only wires routers and lifespan, no business logic
- All model I/O goes through `graph/generate.py`
- Config values come from `config.py`, never hardcoded in routers
- `mcp/admin.py` only exposes admin-safe operations and must keep audit trail
