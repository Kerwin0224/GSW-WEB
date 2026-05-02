Place optional local model files in this directory when experimenting outside the production product path.

The active product implementation is `web/` with server-side provider configuration. Model binaries are intentionally not tracked in git because they are large and environment-specific.

If a local model runtime is used, keep the real binary path in `web/.env.local` or deployment secrets. Supabase may store only non-secret model metadata and a `secret_ref`; it must not store developer-machine absolute paths as shared product configuration.
