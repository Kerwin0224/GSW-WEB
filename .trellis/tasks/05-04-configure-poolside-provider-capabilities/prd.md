# Configure Poolside Provider Capabilities

## Goal

Register Poolside as an OpenAI-compatible provider in the remote database, fetch available models through the app backend provider routes, bind the selected model to teacher AI capabilities, and verify the teacher chat backend no longer fails at provider configuration.

## Requirements

* Store Poolside provider config using existing DB columns, including both legacy and current compatibility columns where present.
* Encrypt the API key using the app's existing `v1.<iv>.<tag>.<ciphertext>` secret format derived from `CWB_AUTH_SECRET`.
* Use the app backend `/api/admin/providers/health-check` route in `providerId` mode to verify server-side secret decryption and `/models` reachability.
* Use the app backend `/api/admin/providers/list-models` route in `providerId` mode to fetch and persist model list.
* Bind a valid fetched model to `teacher_chat`, `practice_generation`, and `practice_evaluation` capabilities so the teacher chain is ready.
* Re-test `/api/teacher/chat` with an existing published teacher prompt preset.

## Acceptance Criteria

* [ ] `provider_configs` contains enabled Poolside provider with encrypted secret and `/v1` base URL.
* [ ] Backend health check returns healthy for Poolside.
* [ ] Backend list-models returns at least one model and persists it.
* [ ] `provider_capabilities` contains enabled rows for teacher AI capabilities using a fetched model ID.
* [ ] `/api/teacher/chat` no longer returns `AI provider not configured`.

## Definition of Done

* Remote DB write succeeds.
* App backend provider routes pass.
* Teacher chat backend is re-tested and result is reported.
* Secrets are not echoed in final output.

## Technical Approach

Use idempotent DB upsert with a stable UUID for the Poolside provider. Populate both schema generations: `secret_ref/is_enabled/api_models/health_status` and legacy `api_key_encrypted/enabled/models/default_params`. Then use admin-authenticated app routes to health-check and list models. Pick the first usable fetched model for teacher capability bindings unless a better chat model is clearly indicated by returned model IDs.

## Out of Scope

* UI code changes.
* Adding new provider management features.
* Committing migration/seed files unless later requested.

## Technical Notes

* Current schema includes compatibility columns in `provider_configs` and `provider_capabilities`.
* Teacher chat fails before this task with `AI provider not configured` because no `teacher_chat` capability exists.
