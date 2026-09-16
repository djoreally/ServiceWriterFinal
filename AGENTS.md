# Service Writer Engineering Contract

## Rules
- Inspect canonical Service Writer architecture and schema before adding concepts.
- Prefer existing workspace-scoped models and APIs; do not create parallel tables or routes to satisfy stale code.
- Authorization is enforced at server/database boundaries.
- Never bypass failing tests, lint, typecheck, schema-contract checks, or deployment checks.
- Never hardcode secrets or service credentials.
- Keep changes scoped to the authorized task; report unrelated findings instead of modifying them.
- Before commit, run the repository's native typecheck and lint gates. Before push, run typecheck, lint, and tests.
