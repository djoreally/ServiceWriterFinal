# Public booking consolidation — certification contract

This branch consolidates the canonical public appointment write, its selected vehicle services, checkout catalog permissions, tax preview recovery, and fail-closed payment behavior. It must **not be merged** until every gate below is proven. It does not claim Pay Now is operational.

## Database invariants

- One stable UUID identifies a submission across retries and browser refreshes.
- Appointment + owned location + vehicle configuration + all billable appointment items are written in one PostgreSQL RPC transaction; any error rolls back the entire write.
- A retry with the same UUID and identical booking content returns the original appointment. Reuse with altered booking content fails closed.
- Only the server-held service role may execute the composite RPC. Existing booking-context, customer-email/phone, tenant, vehicle-ownership, capacity and catalog validation remains authoritative in the called SQL functions.
- Every selected vehicle has a persisted ID before a booking can be created. An extra-oil line belongs to that specific vehicle and uses a server-recognized service name.
- A failed Pay Later payment record must not send a success screen or confirmation. Pay Now returns HTTP 503 until an end-to-end Stripe/Square payment state machine is certified.

## Non-negotiable certification tests

1. **Schema and security:** migration runs cleanly on a Supabase branch built from production migrations; SQL function signature/grants and RLS verified.
2. **Rollback:** use fixture customers/vehicles/slots in an isolated database. Force an invalid catalog item, a foreign customer's vehicle, an unsupported dynamic service, and a configuration failure. Verify appointment count, location count, item count and submission-key count have **zero residue** after each failure.
3. **Idempotency:** submit the exact same key/body twice and concurrently; both responses must reference one appointment. Same key with changed body must fail without a second insert. Different keys on the same slot must be rejected by availability.
4. **Multi-vehicle:** use two real fixture vehicles with different oil capacities and at least one non-oil service. Read back exact vehicle_id for every item, server-calculated extra-quart quantity, item count and catalog unit prices. Verify no item points at a different customer or workspace.
5. **Pay Later:** test server-derived billable lines, waste-oil fees, discounts, tax, pending payment record and invoice. Assert single currency-consistent integer-cent total across appointment, invoice and payment for each mode.
6. **Pay Now:** currently **not implemented**. Prove the 503 containment does not create appointments, payments, checkout sessions or confirmation messages; only remove this gate after Stripe/Square checkout + webhook success/failure/expiration/replay reconciliation passes E2E.
7. **Production readback:** after approved merge/migration, verify deployed SHA, RPC grants, RLS, successful and failure logs, actual appointment_items, payment/invoice parity, idempotency replay and no duplicate confirmation. Use a specifically authorized safe test booking or a real booking, not an unapproved live customer transaction.

## Known unresolved blockers — do not promote to READY

- Final tax/discount/fee/payment and invoice reconciliation is not yet moved to a single authoritative persisted financial snapshot. The native tax route in this branch is a preview, not final authority.
- Pay Now remains intentionally unavailable (503); its transactional Stripe/Square + webhook state machine is not complete.
- Existing tire inventory reservations and external notification/provider sync are post-commit side effects; durable retry/outbox recovery and E2E replay certification are outstanding.
- No Supabase production-derived branch was available for rollback tests; the existing separate backup lacks the v3/v7/config RPCs. Creating a production-derived Supabase branch requires separate paid compute confirmation.
- Source-level Jest contracts are added/updated but have not been executed in a complete install locally. GitHub CI must pass and browser tests must run before release.

## Release policy

One consolidated PR against main. No preview deployment requirement; no automatic production migration or production test writes. Keep this PR **draft** until the criteria above are demonstrably satisfied. Do not merge on a static source assertion alone.
