# Stage 22 rollback procedure

Rollback is a controlled routing/code rollback, not a database rewind.

## Preconditions

- Record exact frontend/backend candidate SHAs.
- Record previous known-good frontend/backend SHAs.
- Capture database backup verification timestamp.
- Keep canonical backend migrations forward-only; do not attempt destructive down migrations during incident rollback.

## Rollback triggers

Immediately stop/rollback activation for any of:

- authentication or tenant-isolation failure
- double booking/capacity corruption
- payment allocation/refund mismatch
- invoice total/numbering corruption
- public booking writes split between old and canonical stores
- unresolved core legacy ID mapping
- data loss or cross-workspace exposure
- sustained backend unavailability without safe fail-closed behavior

## Procedure

1. Stop new production promotion/traffic changes.
2. Record incident timestamp, candidate SHAs and first failing request ID.
3. Disable public booking writes if integrity is uncertain.
4. Route frontend to the previous known-good deployment/commit.
5. Do **not** re-enable legacy business writes automatically. If the candidate wrote canonical data, allowing the old store to resume independently creates split brain.
6. Preserve canonical writes made during the incident window.
7. Reconcile appointments, invoices, payments and provider events created during the window.
8. If provider money moved, canonical Stage 14/19 ledger remains authoritative; never reconstruct success from frontend state.
9. Validate previous UI availability and authentication.
10. Produce an incident reconciliation report before another cutover attempt.

## Database rule

Rollback never deletes successfully created canonical appointments, invoices, payments, refunds, communications or provider events merely to make the old UI look consistent. Repair or replay adapters instead.

## Drill evidence

Before production activation, demonstrate:

- previous frontend artifact/commit can be restored
- canonical backend remains reachable/readable
- public booking can be temporarily disabled
- webhook endpoints remain stable during frontend rollback
- no legacy business-table writes resume unintentionally
- incident-window reconciliation procedure is executable
