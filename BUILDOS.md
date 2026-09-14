# ServiceWriter BuildOS

ServiceWriter uses BuildOS as its release discipline and repair loop.

## Product objective
The immediate objective is a reliable revenue-ready shop operations product, not infrastructure elegance. Changes should be prioritized by whether they reduce missed appointments, data loss, notification failure, payment failure, operational confusion, support burden, or unacceptable performance.

## Release lifecycle
`request → preflight → edit → targeted test → check → repair if red → verify → deploy → production journey verification → certify`

## Canonical operational journeys
1. Public booking → appointment persisted → visible in shop operations → confirmation emitted.
2. Appointment edit/reschedule/cancel → all operational views reconcile → correct notification emitted.
3. Appointment → work order/technician execution → completion → service history.
4. Appointment → invoice → payment → payment record/ledger reconciliation.
5. Customer/vehicle creation and edits → tenant-isolated persistent history.
6. Notification event → durable queue → provider delivery/retry → delivery evidence.
7. Failure/restart/provider outage → retry/recovery without losing appointments, money, or required communications.

## Verification layers
BuildOS should use the strongest applicable evidence:
- repository state and agent policy;
- architecture/identity/frontend contracts;
- TypeScript;
- strict lint;
- Jest;
- Playwright where the journey is browser-visible;
- migration/schema/RLS checks;
- production build;
- deployment identity;
- runtime errors;
- queue/worker evidence;
- canonical booking API health;
- exact-SHA production smoke/journey checks.

## No false green
GREEN must be attached to an exact artifact and applicable journey. A previous healthy deployment does not certify a new SHA.

## Environment discipline
Staging may only certify production behavior when its required schema/contracts are known and sufficiently aligned for the feature under test. BuildOS must surface meaningful environment drift rather than silently treating a stale environment as authoritative.

## Runtime discipline
Durable business work should remain close to the authoritative backend. Frontend-host schedulers may exist temporarily during migration, but BuildOS must surface them when they own critical lifecycle processing without a backend-native durable path.

## Current reliability priority
1. Booking reliability
2. Appointment operations
3. Notification reliability
4. Payments/financial closeout
5. Customer/vehicle integrity
6. Technician/shop workflow
7. Services/inventory/pricing
8. Data safety/recovery
9. Performance/mobile
10. BuildOS production guardrails
11. Full daily-use simulation
12. Production cleanup

## Repair behavior
BuildOS failures are work items, not report endpoints. The active agent must repair, rerun, and continue unless blocked by a genuine external/human gate.
