# ServiceWriter BuildOS Agent Contract

This repository operates under BuildOS for release-candidate verification.

## Before changes
- Inspect existing architecture, schema, authorization, migrations, tests, and release evidence.
- Preserve workspace isolation and server/database authorization boundaries.
- Never expose secrets, bearer tokens, OAuth credentials, provider credentials, or audit evidence to browser mutation paths.
- Prefer the smallest coherent repair over parallel architecture.

## During changes
- Keep schema, types, server logic, UI, tests, and migrations reconciled.
- Treat failed lint, typecheck, tests, build, migration verification, or deployment as RED evidence.
- Do not weaken authorization, remove tests, suppress legitimate errors, fabricate success, or mutate production merely to satisfy a gate.
- Never commit real credentials.

## Before release
- Run BuildOS check and the native ServiceWriter build.
- Preserve exact SHA evidence.
- Do not call production GREEN until the exact deployed SHA is verified.
