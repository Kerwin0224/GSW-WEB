# Research: SFT/DPO audit and export patterns

- **Query**: Research SOTA/product patterns for LLM fine-tuning data review and export, specifically SFT datasets and DPO/preference datasets. Identify 2-4 comparable tools or conventions, summarize common UX/data-export patterns, map them to a Next.js/Supabase educational workbench.
- **Scope**: mixed
- **Date**: 2026-05-04

## Findings

### Files Found

| File Path | Description |
|---|---|
| `web/src/components/workbench/teacher-audit-client.tsx` | Teacher three-pane audit UI with queue filters, source conversation review, SFT/DPO tabs, field validation, and exported read-only guard. |
| `web/src/lib/data/teacher.ts` | Loads class-scoped teacher audit queue from assistant `conversation_messages`, joins source conversations, resolves latest user prompt, and exposes `AuditQueueRecord`. |
| `web/src/lib/data/teacher-actions.ts` | Server actions for SFT/DPO audit submission; validates required fields, checks teacher class scope, writes canonical `audit_records`. |
| `web/src/lib/dataset-export.ts` | Server-only dataset export formatter for approved SFT/DPO `audit_records`; SFT exports chat `messages`, DPO exports `prompt/chosen/rejected`. |
| `web/src/app/api/admin/datasets/export/route.ts` | Admin-only export/preview API; supports SFT/DPO, filters, preview mode, coverage stats, and download URL response. |
| `web/src/app/admin/exports/dataset-export-client.tsx` | Admin export UI with type selector, quality/date filters, preview-first workflow, distribution table, sample JSON preview, and disabled export when valid samples are zero. |
| `web/src/lib/data/admin.ts` | Existing admin dashboard/export helpers; `getAdminExports` reads approved audit records/history and `createExportBatch` persists JSONL to `export_batches`. |
| `web/src/lib/supabase/database.types.ts` | Canonical Supabase types: `AuditKind = 'sft' | 'dpo'`, `AuditStatus = 'pending' | 'approved' | 'rejected' | 'exported'`, `audit_records`, `export_batches`. |
| `.trellis/spec/frontend/teacher-workspace.md` | Product contract for teacher SFT/DPO form behavior, canonical fields, validation matrix, exported read-only state, and diff view expectations. |
| `.trellis/spec/frontend/admin-workspace.md` | Product contract for dataset preview/export: first 100 samples, distribution, coverage, row shape validation, and JSONL examples. |
| `.trellis/spec/frontend/ui-ux-guidelines.md` | Role workspace UX contracts: teacher audit must show source context; admin exports only from audited/approved real records and require preview/confirmation. |
| `.trellis/spec/backend/supabase-pgvector-guidelines.md` | Backend contract mentions `audit_records`, `export_batches`, teacher audit actions, export route authorization, and validation cases. |

### Code Patterns

#### Current workbench audit model

- `web/src/lib/supabase/database.types.ts:14-16` defines the canonical dataset/status enums:

```ts
export type AuditKind = 'sft' | 'dpo';
export type AuditStatus = 'pending' | 'approved' | 'rejected' | 'exported';
```

- `web/src/lib/supabase/database.types.ts:87-95` models the core storage shape: `audit_records` keeps source message/conversation IDs, auditor/class scope, `kind`, `status`, SFT fields (`quality`, `corrected_answer`), DPO fields (`chosen_answer`, `rejected_answer`), `rationale`, metadata, and `exported_at`; `export_batches` keeps `export_type`, `status`, `record_count`, and `jsonl`.
- `web/src/lib/data/teacher.ts:216-307` builds the teacher audit queue from assistant messages, class scope, existing audit row state, full source conversation messages, latest user prompt, student/class/project labels, and status/kind values.
- `web/src/components/workbench/teacher-audit-client.tsx:223-349` implements a SOTA-aligned review workspace pattern: left candidate/filter rail, center source conversation with highlighted target assistant message, right SFT/DPO annotation pane.
- `web/src/components/workbench/teacher-audit-client.tsx:115-147` uses sibling tabs for SFT and DPO. SFT shows original vs corrected answer; DPO shows chosen/rejected pair; both require rationale when the contract requires it.
- `web/src/lib/data/teacher-actions.ts:64-103` validates SFT labels and writes `kind: 'sft'`, `status: 'approved'` or `rejected`, `quality`, `prompt`, `original_answer`, optional `corrected_answer`, and `rationale`.
- `web/src/lib/data/teacher-actions.ts:105-145` validates DPO labels and writes `kind: 'dpo'`, `status: 'approved'`, `prompt`, `original_answer`, `chosen_answer`, `rejected_answer`, and `rationale`.
- `web/src/lib/data/teacher-actions.ts:29-62` is the source-traceability guard: source must be an assistant `conversation_messages` row, must be within teacher class scope, must not already be exported, and must have a preceding user prompt.

#### Current export model

- `web/src/lib/dataset-export.ts:25-40` defines two export rows:
  - SFT: `{ source_record_id, messages: [{ role, content }] }`
  - DPO: `{ source_record_id, prompt, chosen, rejected }`
- `web/src/lib/dataset-export.ts:115-146` maps approved audit records into export rows. SFT uses `corrected_answer ?? original_answer`; DPO uses `chosen_answer ?? corrected_answer` and `rejected_answer ?? original_answer`, excluding incomplete pairs.
- `web/src/lib/dataset-export.ts:155-230` applies filters over `audit_records` for `kind`, `status='approved'`, date, class, quality, auditor IDs, and project IDs via `source_conversation_id`.
- `web/src/app/api/admin/datasets/export/route.ts:10-21` validates request shape with Zod: `type` is `sft|dpo`, optional filters, optional `preview`.
- `web/src/app/api/admin/datasets/export/route.ts:91-131` separates preview from export. Preview returns sample rows, poem distribution, coverage, and invalid sample count; export returns record count, timestamp, and download URL.
- `web/src/app/admin/exports/dataset-export-client.tsx:79-205` shows the product workflow: configure filters, preview first 100 rows, render coverage badges/distribution/sample JSON, and enable export only after preview with non-zero valid samples.
- `web/src/lib/data/admin.ts:839-869` contains another existing export-batch path that stores generated JSONL into `export_batches` and marks exported audit records. Its SFT row shape is prompt/completion while `web/src/lib/dataset-export.ts` uses chat `messages`; this is a shape divergence to account for when mapping conventions.

### Comparable Tools / Conventions

#### 1. OpenAI chat fine-tuning JSONL convention

- Source: OpenAI Cookbook `Chat_finetuning_data_prep.ipynb` (`https://github.com/openai/openai-cookbook/blob/main/examples/Chat_finetuning_data_prep.ipynb`).
- Relevant convention: each JSONL example contains a `messages` list; each message has `role` and `content`; roles are validated against `system`, `user`, and `assistant`; datasets are checked for missing messages, unrecognized keys, missing assistant messages, and token/format problems.
- Product pattern: export is not just a download. The data prep workflow includes format validation and dataset statistics before upload/training.
- Mapping to this workbench: `web/src/lib/dataset-export.ts:30-33` already matches the chat-style SFT row with `source_record_id` plus `messages`; admin preview coverage and valid/invalid rows mirror the validation/stats phase.

#### 2. Hugging Face TRL dataset formats and DPOTrainer

- Sources:
  - `https://huggingface.co/docs/trl/main/en/dataset_formats`
  - `https://huggingface.co/docs/trl/main/en/dpo_trainer`
- Relevant convention: TRL separates dataset **format** (standard vs conversational) from dataset **type** (language modeling, prompt-only, prompt-completion, preference). Preference datasets use `prompt`, `chosen`, and `rejected`, or conversational variants where prompt/chosen/rejected are message arrays. DPOTrainer expects preference examples and can include conversation messages, tool calls, and tool schemas for tool-calling use cases.
- Product pattern: make SFT vs preference/DPO type explicit; show export-contract field names (`prompt`, `completion`/`messages`, `chosen`, `rejected`) rather than vague labels; preserve conversational structure when training a chat model.
- Mapping to this workbench: teacher audit uses explicit SFT/DPO tabs and labels (`teacher-audit-client.tsx:115-147`); export supports chat-style SFT `messages` and standard DPO `prompt/chosen/rejected` (`dataset-export.ts:25-40`).

#### 3. Label Studio annotation/export workflow

- Source: Label Studio export docs (`https://labelstud.io/guide/export.html`).
- Relevant convention: annotation tools store task data plus annotations/results; exports can include raw JSON and other formats; some formats include only annotations and not underlying task data; result IDs/regions are kept stable to trace model predictions against human-reviewed annotations.
- Product pattern: labeling UI is task-centric and export-centric: users review source task context, create annotation results, and export with enough IDs/metadata to trace annotations back to source items.
- Mapping to this workbench: `source_record_id`, `source_message_id`, `source_conversation_id`, class/auditor scope, and highlighted source conversation provide the same traceability layer for educational AI messages.

#### 4. Argilla human-feedback dataset workflow

- Sources:
  - Argilla docs home (`https://docs.argilla.io/latest/`)
  - Argilla README (`https://github.com/argilla-io/argilla`)
- Relevant convention: Argilla positions itself as a collaboration tool for AI engineers and domain experts to build high-quality datasets, including LLM/RAG/preference-tuning workflows; docs emphasize records, questions/responses, suggestions, metadata, dataset import/export, and distribution of annotation tasks.
- Product pattern: domain experts review records in a structured UI, attach responses/feedback/rationales, query/filter records, and keep metadata for continuous dataset improvement.
- Mapping to this workbench: the teacher is the domain expert; class/student/project filters (`teacher-audit-client.tsx:238-265`), rationale fields, audit statuses, and admin preview/distribution align with this record/question/metadata workflow.

### Common UX Patterns for SFT/DPO Review

| Pattern | External basis | Workbench mapping |
|---|---|---|
| Task/source context stays visible during annotation | Label Studio task + annotation model; Argilla record review | Three-pane teacher audit: queue, source conversation, annotation (`teacher-audit-client.tsx:223-349`). |
| SFT and DPO are visibly different dataset contracts | TRL dataset type separation | Tabs labeled SFT/DPO and explicit field labels (`teacher-audit-client.tsx:115-147`). |
| Preference data is pairwise in MVP | TRL preference/DPO convention | DPO form requires `chosen_answer`, `rejected_answer`, rationale; rejects identical chosen/rejected (`teacher-actions.ts:105-145`). |
| Human rationale/quality signals are stored with labels | Argilla feedback and Label Studio annotation result model | SFT `quality`/`rationale`; DPO `rationale`; `metadata.submitted_from` in server action payloads. |
| Traceable IDs survive export | Label Studio stable task/result references; OpenAI/TRL data validation workflows | `source_record_id` in export rows; DB keeps source message/conversation/auditor/class IDs. |
| Preview/validation precedes export | OpenAI fine-tuning data prep checks; annotation export inspection | Admin preview returns sample rows, coverage, distribution, invalid count before export (`route.ts:91-131`, `dataset-export-client.tsx:157-205`). |
| Export only approved human-reviewed records | Dataset governance convention across labeling tools | Export query filters `status='approved'` (`dataset-export.ts:181-188`). |
| Export shape is training-framework friendly | OpenAI chat messages; TRL prompt/chosen/rejected | SFT chat `messages`; DPO `prompt/chosen/rejected`. |

### Data Export Patterns

#### SFT

Common shapes found:

```json
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}
```

```json
{"prompt":"...","completion":"..."}
```

Workbench mapping:

- `web/src/lib/dataset-export.ts` uses chat-style SFT with `messages`, better aligned with chat fine-tuning and preserving a system prompt.
- `web/src/lib/data/admin.ts:860-863` uses legacy/simple prompt-completion shape for export batches.
- Both shapes retain `source_record_id` in current code paths, which supports audit traceability.

#### DPO / preference

Common shape found:

```json
{"prompt":"...","chosen":"...","rejected":"..."}
```

Conversational variants can represent `prompt`, `chosen`, and `rejected` as message arrays when training chat models.

Workbench mapping:

- `web/src/lib/dataset-export.ts` exports standard `prompt/chosen/rejected` DPO rows.
- Teacher audit stores rationale in `audit_records.rationale`; `dataset-export.ts` currently exports only `source_record_id`, `prompt`, `chosen`, `rejected`, while `admin.ts` batch export includes `rationale` for DPO rows (`admin.ts:860-863`).

### Mapping to a Next.js/Supabase Educational Workbench

#### Teacher-side audit flow

1. Source data originates from student/teacher AI interactions in `conversation_messages` and `conversations`.
2. Teacher queue is scoped by `class_memberships`, not global access.
3. Teacher selects an assistant response, sees surrounding source conversation and metadata, and labels either:
   - SFT: quality, optional correction, rationale.
   - DPO: chosen answer, rejected answer, rationale.
4. Server action validates role, source message type, class access, exported state, required fields, and canonical payload.
5. `audit_records` becomes the durable dataset-governance table.

This maps to the product pattern of Argilla/Label Studio: domain expert reviews records with context and produces structured annotation outputs.

#### Admin-side export flow

1. Admin calls `/api/admin/datasets/export` with `type=sft|dpo`, filters, and preview flag.
2. Server verifies admin role, validates request with Zod, filters approved audit records, converts rows into training-compatible JSONL records, and returns preview stats or export metadata.
3. UI renders first 100 samples, valid/invalid coverage, text/poem distribution, and only then allows JSONL export.
4. Export rows include source IDs so downstream training data can be traced back to educational context.

This maps to OpenAI/Hugging Face data conventions plus labeling-tool governance: validate shape, expose preview, filter by quality/scope, and preserve source traceability.

### Related Specs

- `.trellis/spec/frontend/teacher-workspace.md` — Defines teacher audit IA, SFT/DPO form contracts, canonical `audit_records` fields, validation/error matrix, and diff-view contract.
- `.trellis/spec/frontend/admin-workspace.md` — Defines dataset preview/export contract, SFT/DPO JSONL examples, coverage, distribution, and preview validation requirements.
- `.trellis/spec/frontend/ui-ux-guidelines.md` — Defines product-level UX rules for teacher audit source context and admin audited exports.
- `.trellis/spec/backend/supabase-pgvector-guidelines.md` — Defines backend table/action/export route expectations around audit and export.
- `.trellis/tasks/05-04-sft-dpo/prd.md` — Current task PRD for SFT/DPO teacher audit and admin export.

### External References

- [OpenAI Cookbook: Chat fine-tuning data prep](https://github.com/openai/openai-cookbook/blob/main/examples/Chat_finetuning_data_prep.ipynb) — Chat SFT JSONL convention using `messages`, plus format validation/statistics before training.
- [Hugging Face TRL: Dataset formats and types](https://huggingface.co/docs/trl/main/en/dataset_formats) — Defines standard/conversational SFT and preference dataset shapes, including `prompt/chosen/rejected`.
- [Hugging Face TRL: DPOTrainer](https://huggingface.co/docs/trl/main/en/dpo_trainer) — DPO training expects preference data and supports conversational/tool-calling datasets.
- [Label Studio: Export annotations](https://labelstud.io/guide/export.html) — Annotation/export workflow with raw JSON, task data, annotation results, and traceable result IDs.
- [Argilla docs](https://docs.argilla.io/latest/) — Human-feedback dataset workflow with records, responses, metadata, filtering, and import/export.
- [Argilla repository README](https://github.com/argilla-io/argilla) — Positions Argilla for domain-expert data quality, LLM/RAG/preference-tuning feedback, and continuous dataset improvement.

## Caveats / Not Found

- OpenAI platform documentation URLs returned HTTP 403 from this environment, so OpenAI conventions were taken from the official OpenAI Cookbook notebook rather than platform docs.
- Some Argilla detail pages and Label Studio template URLs failed or returned 404/SSL errors from this environment; accessible Argilla docs home/README and Label Studio export docs were used.
- Current repo contains two SFT export shapes: `web/src/lib/dataset-export.ts` uses chat `messages`; `web/src/lib/data/admin.ts` uses `prompt/completion`. Both are valid conventions, but they are different row contracts.
- DPO export rationale is included by `web/src/lib/data/admin.ts` batch export but not in `web/src/lib/dataset-export.ts` `DpoRecord`; both retain traceability via source IDs.
- No external labeling service integration is needed by the current PRD; mapping is to product patterns, not a dependency recommendation.
