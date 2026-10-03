# Stage 22 — ServiceWriterFinal canonical cutover

Stage 22 is a release/cutover program, not a feature domain.

## Authority boundary

After cutover:

- `service-Writer-backend` owns Service Writer business truth and all business persistence.
- `ServiceWriterFinal` is the preserved UI/server-adapter application.
- Supabase in `ServiceWriterFinal` remains an identity/session provider only for the canonical core surface.
- Browser code must not query Service Writer business tables, RPCs, or Edge Functions directly.
- Stripe settlement truth lives in backend Stages 14/19.
- Transactional communication history lives in backend Stages 15/19.

## Canonical frontend seams migrated in Stage 22

- workspaces
- customers collection/detail/archive
- vehicles collection/detail/archive
- service catalog CRUD/archive compatibility
- appointments collection/detail/reschedule/transition/cancel
- Start Job / Complete Job lifecycle transitions
- work orders collection/detail/lifecycle compatibility
- invoices collection/detail/issue/void
- payments collection/manual settlement/Stripe intent
- public booking profile/catalog/availability
- public booking multi-vehicle creation
- public booking service snapshot reconciliation
- public booking confirmation + communication preferences + Resend delivery
- appointment lifecycle email via canonical Communications

## Intentionally retired behavior

The old appointment completion RPC bundled appointment completion, service record creation, invoice/payment creation, Stripe synchronization, and messaging. That bundle is retired. Canonical closeout is separate domains:

1. appointment/work-order lifecycle
2. inspections/estimate/approval as applicable
3. execution parts/labor
4. invoice issue
5. payment collection/reconciliation
6. communication

Payment-derived invoice states are never directly written.

## Fail-closed legacy extensions

Unreconciled legacy extensions are not allowed to keep writing the old business database. The edge guard returns HTTP 410 for the explicitly disabled route families documented in `LEGACY_SHUTDOWN.md`.

## Production activation gates

Production activation is blocked until all are true:

1. Backend and frontend exact candidate SHAs are recorded.
2. Backend full migration chain succeeds on a disposable production-equivalent database.
3. Legacy/canonical table and ID reconciliation is executed and signed off.
4. `SERVICE_WRITER_API_URL` points to the candidate backend.
5. `CUTOVER_BOOKING_STAGE_SECRET` is configured with >=32 random characters.
6. Frontend and backend typecheck/lint/build succeed from clean installs.
7. Stage 1–22 structural verifiers succeed.
8. End-to-end acceptance matrix passes against the exact candidate SHAs.
9. Stripe test-mode webhook and Resend webhook smoke tests pass.
10. Legacy disabled endpoints are confirmed to return 410.
11. Browser/network verification shows no canonical core business-table/RPC calls to Supabase.
12. Rollback drill succeeds.

Until those gates execute, this is a reconciled implementation checkpoint only and must remain `CI_BLOCKED`.
