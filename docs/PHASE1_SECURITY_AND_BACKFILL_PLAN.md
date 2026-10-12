# Phase 1 — Security and Location Backfill Plan

## Production evidence

Production project: `service writermain` (`rjfbrfognxqkyhdrpibx`).

### Appointment location state

For the MOMS Mobile Oil Change workspace:

- 212 appointments total at the initial audit point
- 211 appointments had `location_id IS NULL`
- 25 appointments were identifiable public bookings
- 24 of those public bookings had `location_id IS NULL`
- 9 missing-location appointments retained an appointment-level `metadata.location_address`
- 0 missing-location appointments retained a staged row in `public_booking_location_intents`
- all 211 missing-location appointments had a customer profile address
- 7 appointment metadata addresses matched the customer profile address
- 2 appointment metadata addresses differed from the customer profile address
- 202 missing-location appointments had only the customer profile address available in the canonical tables

MOMS has stable identifiers `workspaces.slug = 'momsoilchange'` and `workspace_settings.booking_slug = 'momsoilchange'`. Data migrations must resolve the workspace by a stable slug rather than hardcoding its generated UUID.

## Historical backfill rule

The business owner has confirmed that, for these existing historical MOMS appointments, the customer address stored with the historical record represents the correct service address for the appointment at that time. Therefore the historical MOMS dataset is authorized for full location backfill.

This is a one-time historical recovery rule. It is **not** the forward application contract.

### Address source precedence

For every MOMS appointment with `location_id IS NULL`:

1. if `appointments.metadata.location_address` is non-empty, use that appointment-specific snapshot as the strongest source;
2. otherwise use the linked historical customer address, which has been business-confirmed as correct for these historical appointments;
3. create a new dedicated `locations` row for that appointment;
4. attach that location through `appointments.location_id`;
5. record the backfill source in appointment metadata for auditability.

A dedicated location row must be created per appointment. Historical appointments must not remain dynamically dependent on the mutable customer profile after backfill.

### Backfill location shape

Each recovered appointment location uses:

- `name = 'Appointment service location'`
- `location_type = 'customer_site'`
- the same `workspace_id` as the appointment
- appointment metadata coordinates when they exist
- appointment metadata address when it exists, otherwise the historical customer address fields

The migration must be idempotent by processing only rows with `appointments.location_id IS NULL`.

## Canonical forward invariant

For all new mobile/public bookings:

`appointment -> appointment-specific location -> service address`

Customer address is profile/contact data only and must never be used as an implicit service-location fallback for a newly created appointment.

New public bookings must fail closed when an appointment service address cannot be persisted. Updating a customer profile later must never alter an existing appointment's service location.

## Hono/API reconciliation

The Hono backend is already substantial on `main`; this phase must certify and converge it rather than create another backend.

`src/server/hono/app.ts` mounts domain routers for appointments, billing, catalog, CRM, documents, messaging, platform, vehicles, and work orders. Main is newer than the earlier Hono reconciliation and remediation branches inspected during the branch sweep.

Remaining API work is convergence:

1. enumerate remaining `app/api/**/route.ts` handlers;
2. classify each as intentionally standalone, not-yet-migrated, or a route that shadows an existing Hono implementation;
3. remove migrated shadow routes after contract tests prove the Hono route;
4. classify remaining client-side direct Supabase calls and move business mutations/reads behind the API boundary where required;
5. make Hono the enforceable application backend boundary rather than merely one of multiple possible paths.

## RPC exposure audit

### Intended anonymous public booking surface

These functions are expected to be public only after their argument validation, workspace scoping, and mutation ownership checks are certified:

- `get_public_booking_profile_v3`
- `get_public_booking_settings_v2`
- `get_public_service_catalog_v3`
- `get_public_booked_slots_v2`
- `get_public_blocked_dates_v3`
- `public_booking_upsert_customer`
- the phone-bound `public_booking_upsert_vehicle` overload
- `public_booking_book_appointment_v3`
- `public_booking_insert_services_v7`
- `public_booking_save_configuration_v2`
- `public_booking_record_payment_intent_v3`
- `public_booking_set_vehicle_tire_spec_v3`
- `public_booking_update_appointment_context_v2`

Anonymous `SECURITY DEFINER` access is acceptable only when the function is intentionally part of the guest-booking boundary and validates every referenced workspace/customer/vehicle/appointment itself.

### Current compatibility contract

The application currently calls `public_booking_book_appointment_v2` from `src/application/commands/booking-submit.command.ts`, and the server booking RPC allowlist also explicitly permits that name.

The current migration chain hardens `public_booking_book_appointment_v2` by routing it into the appointment-location-aware `public_booking_book_appointment_v3` path. Therefore the `v2` name cannot be revoked until the application and server allowlist are migrated to the canonical function.

Retirement order:

1. move the application command to the canonical address-aware booking call;
2. update the server allowlist;
3. prove the canonical call passes booking contract tests;
4. verify no remaining code path depends on either `v2` overload;
5. only then revoke browser execution from the compatibility signatures.

### Legacy surface to revoke

`public_booking_update_appointment_context` (without the customer email/phone binding) is still executable by browser roles and is superseded by `public_booking_update_appointment_context_v2`. After confirming there are no live call sites, revoke `anon` and `authenticated` execution from the legacy function.

Already-revoked historical functions should remain revoked, including older `public_booking_insert_services`, booking profile, and other superseded versions.

### Non-booking security review required

Supabase security advisors also flag anonymous `SECURITY DEFINER` exposure outside the intended booking surface, including internal-looking functions such as `get_tech_fleet_assignments_v1`, trigger/helper functions, reward functions, and quote total sync helpers. These must be classified individually as public, authenticated-only, service-role-only, or internal trigger-only before Core Certified status.

## RLS result

Core tables inspected all have RLS enabled:

- workspaces
- workspace_members
- customers
- vehicles
- service_catalog
- appointments
- locations
- work_orders
- invoices
- payments
- public_booking_location_intents

The primary operational tables have workspace-aware authenticated policies. `public_booking_location_intents` intentionally has RLS enabled with no direct client policy and is accessed through controlled functions.

## Index result

The core access paths already include the expected workspace-scoped indexes for appointments, customers, vehicles, work orders, invoices, and payments.

Notable cleanup items:

- duplicate indexes exist on `appointments.assigned_user_id`;
- duplicate/near-duplicate creator indexes exist on invoices and payments;
- appointment location lookup has `(workspace_id, location_id)` coverage.

Index cleanup is lower priority than contract and security correction, but duplicates should be removed only after query-plan verification.

## Security advisor items that block certification

- classify and reduce anonymous `SECURITY DEFINER` surface;
- classify authenticated `SECURITY DEFINER` surface;
- fix mutable `search_path` on `prevent_double_booking`;
- review leaked-password-protection setting for Auth;
- keep intentional RLS-with-no-policy tables documented as server/RPC-only.

## Phase 1 migration strategy

1. backfill historical MOMS appointment locations into immutable per-appointment `locations` rows using the approved source precedence;
2. verify every eligible historical MOMS appointment now has a same-workspace `location_id` and that the captured address matches the chosen source;
3. migrate application/server call sites from compatibility booking RPCs to the canonical location-aware contract;
4. add a migration revoking browser execution from genuinely superseded booking RPCs;
5. harden `prevent_double_booking` search path;
6. add a database invariant/test ensuring new public bookings cannot persist without an appointment-specific `location_id`;
7. complete Hono/legacy-route convergence and direct-client bypass classification;
8. regenerate production TypeScript types and compare against repo types;
9. replay the full migration chain against a clean development database;
10. run database contract and tenant-isolation tests;
11. only after validation apply the production hardening/backfill migration.

## Non-negotiable forward rule

Historical customer addresses are authorized as a recovery source for this MOMS backfill only. No new appointment may derive its service location from a customer profile after creation.