# EMV history import

Rebuilds the rescued emv backup (`moms_260814.backup`, created 2026-08-14 —
the old Service Writer system's database) into the current Service Writer
production model. One job, per Ty's 2026-11-05 focus ruling; everything the
job needs is folded into this folder plus one foundation migration.

**Design, verified inventory, mapping and dedupe rules:**
`goals/service-writer-app-redesign-and-repo/files/emv-rebuild-inventory-2026-11-05.md`

## Files

| File | What |
|---|---|
| `../../supabase/migrations/20261106000000_emv_import_foundation.sql` | The only schema the pour needs that prod lacks: `appointment_services` (shape verbatim from the reconciliation addendum's approved bucket-(i) definition) + `emv_archive_vehicle_specifications` (archive-only specs; deliberately NOT the struck `vehicle_specifications` name). Idempotent. |
| `emv_import.sql` | The pour. Parameterized, single-transaction, self-sourcing (invoice numbers from target MAX in-transaction; all matching by predicate inside the transaction). Emits the full run report. Never begins/commits itself. |
| `run-emv-import.sh` | Orchestrates: restore backup → stage 9 tables into target as `emv_staging` → apply foundation migration → run pour → rollback (dry run) or commit (`--commit`). DSNs come from the operator's environment only. |
| `dry-run-target-schema.sql` | LOCAL VERIFICATION ONLY. A disposable prod-shaped target for proving the pour without touching prod. Never apply to production. |

## What pours, what doesn't

Pours: customers (177) → `customers`; vehicles (209) → `vehicles`;
appointments (188) → `appointments`; line items (30) → `appointment_services`;
job history (155) → `service_records`; one synthesized invoice per service
record → `invoices`; the 11 succeeded manual payment records → `payments`;
specs (13,996) → the archive table; fleet clients (2) + contacts →
`fleet_clients` / `fleet_client_contacts`.

Skipped, each with its reason printed in the run report: the 5 pending
payment records (no money moved), the 11 financial_transactions (exact
mirrors of the succeeded payment records — pouring both would double-count),
business profiles, the emv catalog/tax/maintenance config (prod's are
canonical or phase-deferred), portal accounts, email/notification queues,
caches, and every field that has no prod column (carried in `metadata`
where the target has one; listed where it doesn't).

Conflicts are never silently merged: ambiguous email/phone/VIN/YMM matches
skip the row and its dependents and are listed with the competing values.

## Idempotency

Every poured row carries its emv id in the target row's `metadata`
(provenance). Re-running the pour links by provenance first and inserts
nothing twice; archive specs dedupe on their preserved primary key;
appointment line items dedupe by predicate (that table has no metadata
column). The dry-run verification runs the pour three times against a
disposable target — pour, dry-run re-run (expect: everything links, zero
inserts), rollback run — to prove this.

## Running it

Dry run against any target database (never prod for a first run):

```sh
export EMV_TARGET_DSN='postgres://…/target_db'
export EMV_SOURCE_DSN='postgres://…/scratch_db'   # overwritten by the restore
scripts/emv-import/run-emv-import.sh --workspace-id 250c258f-fad6-46e1-86de-3de41a7d4e1a
```

The real pour is the same command with `--commit`, and happens **only on
Ty's explicit word**. Whoever runs it keeps the emitted report file — it is
the audit record of what poured, what linked, what conflicted, and what was
skipped and why.
