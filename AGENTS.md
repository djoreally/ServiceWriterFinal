# Service Writer BuildOS Contract

This repository operates under BuildOS. Every AI-assisted change must read BUILDOS.md, buildos.config.json, .buildos/product.json, .buildos/architecture.json and .buildos/state.json before editing.

## Rules
- Inspect canonical Service Writer architecture and schema before adding concepts.
- Prefer existing workspace-scoped models and APIs; do not create parallel tables or routes to satisfy stale code.
- Authorization is enforced at server/database boundaries.
- Never bypass failing tests, lint, typecheck, schema-contract checks, deployment checks, or BuildOS gates.
- Never hardcode secrets or service credentials.
- Production is not GREEN until the exact deployed SHA is verified.
- Any failed BuildOS gate must be repaired and rerun; failures remain part of the evidence trail.
- Meaningful changes update .buildos/state.json and add a record under .buildos/changes when appropriate.

Before commit run the configured BuildOS check. Before merge/release, the BuildOS verify workflow must pass.
