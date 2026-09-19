# Service Writer Legacy Code Audit — 2026-09-18

## Scope

This audit is independent from the golden-route audit. Its purpose is to identify every preserved legacy runtime surface, determine whether it is still reachable, classify whether it is authoritative or compatibility-only, and remove contradictions with the canonical Service Writer architecture.

## Critical finding

`src/legacy-pages` is **not an archive**. `src/App.tsx` imports a very large portion of the live application directly from this directory, including appointments, appointment detail, customers, vehicles, service records, settings, financials, booking, customer portal, admin, Fleet OS, and Tech App surfaces.

Therefore "legacy" currently means "preserved UI implementation" rather than "dead code." No file in this directory should be deleted merely because of its path.

## Audit classifications

Each legacy artifact must end in exactly one class:

1. **LIVE_CANONICAL_UI** — still routed and valid; keep, but remove legacy domain assumptions.
2. **LIVE_COMPATIBILITY_ADAPTER** — UI may remain but all data access must route through canonical commands/queries/APIs.
3. **REDIRECT_ONLY** — preserved URL only; no independent business logic.
4. **DEAD_UNREACHABLE** — no route/import/runtime consumer; delete after verification.
5. **DANGEROUS_DUPLICATE** — implements a competing write path or domain model; migrate callers then remove.
6. **FLEET_ONLY** — separate fleet work-order semantics are intentional and must not leak into non-fleet appointments.

## Confirmed live legacy surfaces already implicated by the golden route

- `src/legacy-pages/Appointments.tsx` — live `/appointments` route.
- `src/legacy-pages/AppointmentDetail.tsx` — live `/appointments/:id` route.
- `src/legacy-pages/ServiceDetail.tsx` / service query adapters — live service-history surface.
- `src/legacy-pages/Settings.tsx` — live settings surface through compatibility adapters.
- `src/legacy-pages/Payments.tsx`, `Financials.tsx`, `Invoices.tsx`, `Expenses.tsx` — live financial surfaces.
- `src/legacy-pages/PublicBooking.tsx`, `TenantBooking.tsx`, customer auth/dashboard — live customer-facing surfaces.
- `src/legacy-pages/tech-app/*` — live technician routes.
- `src/legacy-pages/fleet-os/*` and Fleet surfaces — live fleet routes and must remain domain-separated.

## Confirmed dangerous legacy/compatibility patterns

### Appointment completion
A preserved completion UI was still collecting one VIN/mileage/oil/filter payload and enriching only one service record after appointment closeout. This was incompatible with multi-vehicle appointment completion. The canonical closeout has now replaced that mutation path.

### Service record cardinality
Legacy API/runtime code assumed one `service_records` row per appointment. Canonical completion now creates one record per appointment vehicle. These readers/writers are being converted to vehicle-scoped writes or collection/aggregate reads.

### Non-fleet work-order leakage
Some preserved code still looks up a separate `work_orders` row from an appointment. Non-fleet Service Writer uses Appointment as the operational work order. Fleet remains the only separate work-order domain.

### Compatibility adapters
Multiple application-layer files explicitly describe themselves as adapters for preserved legacy pages. These adapters are acceptable only when they route to canonical workspace-scoped models and do not recreate obsolete ownership/write semantics.

## Dedicated audit passes

1. Route reachability and dynamic imports from `src/App.tsx`.
2. Direct Supabase reads/writes inside legacy pages.
3. Calls bypassing application command/query/API layers.
4. References to retired tables, RPCs, owner-user tenancy, or non-fleet `work_orders`.
5. Single-record/single-vehicle assumptions.
6. Financial calculations duplicated in legacy UI.
7. Authentication/role checks duplicated client-side instead of server/RLS authority.
8. Customer/public booking compatibility flows.
9. Fleet-only code vs non-fleet leakage.
10. Tech App duplicate job lifecycle logic.
11. Dead scripts/migrations/helpers capable of reintroducing retired behavior.
12. Remove dead/unreachable artifacts only after caller verification.
13. Type/lint/test/build after reconciliation.

## Exit criteria

Legacy audit is GREEN only when:
- every legacy file is classified;
- every live legacy route uses canonical domain contracts;
- no competing write path exists for appointment completion, service history, invoices/payments, recommendations, inspections, dispatch, or identity;
- non-fleet code cannot create/use fleet work orders as an appointment surrogate;
- dead compatibility code capable of restoring retired behavior is removed;
- all retained compatibility adapters have an explicit reason to exist.
