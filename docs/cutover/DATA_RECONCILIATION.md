# Stage 22 data and ID reconciliation

Production cutover must not rely on coincidental UUID equality between the legacy ServiceWriterFinal database and canonical backend tables.

## Required pre-cutover snapshot

Capture immutable row counts and IDs for the legacy production source for at least:

- workspaces and active memberships
- customers
- vehicles
- service catalog
- appointments and appointment service/items
- work orders and work-order items/assignments
- inspections/findings where present
- estimates/approvals where present
- invoices/invoice lines
- payments/refunds
- active fleet/commercial records
- communication consent/opt-in evidence

Record source snapshot timestamp and database identifier.

## Identity rules

### Workspaces
Each active legacy workspace must map to exactly one canonical `workspaces.id`/slug.

### Customers
Preserve legacy customer UUID where imported when feasible. Otherwise write an explicit one-to-one mapping table/file and verify email/phone/name samples.

### Vehicles
Preserve vehicle UUID where feasible. Verify customer ownership and VIN uniqueness. Oil/engine/tire compatibility fields retained by Stage 22 adapters must be represented in canonical vehicle metadata or the vehicle-spec domain.

### Services — hard gate
Every legacy `service_catalog.id` referenced by an appointment, package, invoice item, or work order must map to an active/inactive canonical `services.id` before cutover.

Public booking and appointment adapters intentionally treat `service_catalog_id` as the canonical service UUID. Therefore unresolved service IDs are a hard cutover blocker.

### Appointments
Verify customer, primary vehicle, local date/time, timezone, status, and service snapshots. Historical absolute timestamps must round-trip to canonical workspace-local date/minutes.

### Work orders
Verify appointment provenance, customer, vehicle, technician assignment, status mapping, lines, and subtotal. Legacy-only status labels may be retained as metadata but canonical lifecycle state must be valid.

### Invoices/payments
Do not import mutable `paid` flags as authority. Reconcile invoice totals and net successful/refunded payment allocations, then derive amount due from the canonical ledger.

## Required reconciliation assertions

- no orphan workspace/customer/vehicle/service foreign keys
- no duplicate active VINs per workspace unless explicitly accepted
- every appointment service reference resolves
- every issued invoice has immutable line snapshots
- payment allocations never exceed invoice total
- successful refunds reopen balance correctly
- customer communication preferences match latest consent evidence
- production counts and money totals are reconciled with documented exceptions

## Evidence artifact

Before activation, produce a machine-readable reconciliation report containing:

- source snapshot timestamp
- candidate backend SHA
- candidate frontend SHA
- row counts source vs target
- mapping counts and unresolved IDs
- invoice gross total source vs target
- successful payment net total source vs target
- exception list
- approver/date

Any unresolved core service/workspace/customer/vehicle/appointment/invoice/payment mapping keeps cutover blocked.
