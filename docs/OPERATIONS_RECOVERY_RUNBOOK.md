# ServiceWriter Operations Recovery Runbook

This runbook is for production reliability. The goal is to protect appointments, money, customer history, and required communications during failures.

## First rule
Do not delete or manually rewrite durable queue rows to make dashboards look green. Preserve evidence, identify the failing stage, repair the cause, and replay safely.

## Queue backlog
1. Check lifecycle and push queue depth, oldest visible message age, failed attempts, and dead-letter state.
2. Confirm the provider dependency is healthy before increasing worker throughput.
3. Process bounded batches only. Do not run an unbounded catch-up request.
4. Confirm idempotency keys before replaying delivery.
5. Verify queue age decreases for at least two consecutive worker cycles.
6. Escalate if the oldest required customer communication exceeds the operational alert threshold.

## Provider outage
1. Keep the business event and outbox row durable.
2. Mark provider delivery failure without marking the business action itself as failed when the appointment/payment already committed.
3. Use exponential retry with a bounded maximum delay.
4. Do not switch providers unless sender identity, compliance, and idempotency behavior are known.
5. After recovery, reconcile provider status and archive only successfully completed queue messages.

## Appointment recovery
1. The canonical appointment row in Postgres is authoritative.
2. If dashboard/list/calendar disagree, compare them against the same appointment ID and workspace.
3. Never recreate an appointment until duplicate/fingerprint/idempotency checks prove it is missing.
4. Repair projections/views, not the canonical row, when the row is intact.

## Payment recovery
1. Stripe/provider state and the canonical ServiceWriter payment row must be reconciled before any retry that can move money.
2. Never create a second provider charge to repair a missing local ledger entry.
3. Use provider payment IDs and webhook event IDs to reconcile.
4. A successful provider payment with a failed local update is a reconciliation incident, not a reason to charge again.

## Database restore
1. A production migration requires a recorded `BACKUP_VERIFIED_AT` value and `ROLLBACK_PLAN_ID`.
2. Restore testing must occur against a safe non-production target.
3. Verify at minimum: workspaces, customers, vehicles, appointments, appointment items, invoices, payments, message logs/outboxes, and migration history.
4. Run the canonical booking, appointment, notification, and payment integrity checks against the restored target.
5. Record restore timestamp, source backup/PITR point, target, verification result, and operator.

## Runtime/server outage
The database/outbox state remains authoritative. Restore compute, reconnect to the same backend, verify health, then allow bounded workers to resume. Do not rebuild business state from frontend caches.

## Release rollback
If a release changes application code but not irreversible database state, return traffic to the previous verified application artifact. If a migration is involved, follow the recorded rollback/restore plan rather than improvising reverse SQL.

## Completion criteria
A recovery is complete only when canonical data is intact, queue age is decreasing/empty as expected, payment reconciliation is clean, required notifications have a terminal state, and the affected user journey passes again.
