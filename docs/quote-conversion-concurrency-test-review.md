# Concurrent Quote Conversion Integration Test Review

## Review conclusion

The concurrent quote-conversion tests provide good application-level coverage for the idempotency contract and now pass after one production correctness fix. They verify that repeated requests with the same key converge on one service-record identity, that different keys race through the one-success constraint, that workspace context is forwarded, and that malformed input is rejected before the RPC is called.

## Coverage assessment

| Area | Assessment | Notes |
|---|---|---|
| Same-key concurrency | Covered | The command test fans out 24 calls; the route test fans out 20 calls. All successful responses must resolve to one service-record ID. |
| Different-key concurrency | Covered | The route test models one winner and one `quote_already_converted` conflict. |
| Replay semantics | Covered | The same-key emulator returns a replayed result with the original identity. |
| Workspace propagation | Covered | Command calls are asserted to include the selected workspace. |
| Input validation | Covered | Invalid workspace UUID and short idempotency key are rejected before the RPC. |
| RPC parameter contract | Covered | Route tests assert workspace, quote, and idempotency arguments reach the RPC. |
| Real database locking | Not covered by Jest | The test emulator models the transaction outcome; a staging Supabase smoke test is still required to validate actual row locks, unique indexes, and Postgres exception behavior. |
| RLS enforcement against a real session | Not covered by Jest | Requires a staging authenticated-user test against Supabase. |
| Network retries and timeouts | Not covered | Add this to a later contract-test layer if the client gains retry behavior. |

## Correctness issue found and fixed

The malformed-input test originally expected HTTP 500 because the route passed `ZodError` to the generic error handler. That behavior was not appropriate for a validated API boundary. The route now returns HTTP 400 with the stable `validation_error` code and structured Zod issues; the test now asserts this contract.

The route also previously failed to normalize a Supabase error object because it only inspected `Error` instances. The normalizer now accepts `{ message }` database error objects, allowing `quote_already_converted` to become the documented HTTP 409 response.

## Recommended staging smoke tests

After applying the migration to a staging project, run two authenticated clients against the same quote. Submit at least 20 same-key requests concurrently and confirm one service-record row, one successful conversion row, and one quote status transition. Repeat with two different keys and confirm one success plus one conflict. Then run the read-only migration audit script and verify zero cross-workspace, orphan, duplicate-idempotency, or converted-without-audit findings.

The Jest suite should not be treated as a substitute for this staging test because its RPC emulator cannot prove PostgreSQL locking and RLS behavior.
