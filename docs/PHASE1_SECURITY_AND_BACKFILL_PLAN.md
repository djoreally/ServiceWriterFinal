# Phase 1 — Security and Location Backfill Plan

## Production evidence

Production project: `service writermain` (`rjfbrfognxqkyhdrpibx`).

### Appointment location state

For the MOMS Mobile Oil Change workspace:

- 212 appointments total
- 211 appointments have `location_id IS NULL`
- 25 appointments are identifiable public bookings
- 24 of those public bookings have `location_id IS NULL`
- only 9 missing-location appointments currently retain an appointment-level `metadata.location_address`
- 0 missing-location appointments have a surviving staged row in `public_booking_location_intents`
- all 211 missing-location appointments have a customer profile address
- 7 appointment metadata addresses match the current customer profile address
- 2 appointment metadata addresses differ from the current customer profile address
- 202 missing-location appointments have only the customer profile address as a recoverable address source

## Backfill rule

Do **not** perform a broad `appointments <- customers.address` backfill.

The customer profile is not authoritative for historical service location. Using the current customer address would recreate the exact ownership defect Phase 1 is intended to eliminate.

### Confidence tiers

#### Tier A — safe automatic backfill

An appointment may be backfilled automatically only when an appointment-owned source exists, currently:

- `appointments.metadata.location_address`
- a future immutable appointment-location snapshot source proven to belong to that appointment

For each Tier A row:

1. create a dedicated `locations` row with the same `workspace_id`
2. set `location_type = 'customer_site'`
3. set `name = 'Appointment service location'`
4. copy the appointment-owned address and appointment-owned coordinates when present
5. attach the new row through `appointments.location_id`
6. preserve the original metadata for auditability

The current production dataset has 9 candidates in this tier.

#### Tier B — manual/reconciled recovery

Rows with only a customer profile address are not safe to auto-backfill. They require corroboration from another historical source such as:

- confirmation email payload/log
- dispatch event payload
- mileage-trip destination
- invoice/service note containing the appointment location
- immutable booking event/outbox payload
- operator-confirmed historical address

The current production dataset has 202 rows in this category.

#### Tier C — unresolved

If no appointment-owned or independently corroborated address can be established, leave `location_id` unresolved and expose that state explicitly. Do not silently substitute a customer profile address.

## Canonical forward invariant

For mobile/public bookings:

`appointment -> appointment-specific location -> service address`

Customer address is profile/contact data only and must not be used as an implicit service-location fallback.

New public bookings must fail closed when an appointment service address cannot be persisted.

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

### Legacy surfaces to revoke from anonymous/authenticated API access

Production currently exposes legacy or superseded functions that should not remain callable by browser roles once application call sites are confirmed migrated:

- `public_booking_book_appointment_v2` — both overloads
- `public_booking_update_appointment_context` — legacy mutation without customer email/phone binding

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

- duplicate indexes exist on `appointments.assigned_user_id`
- duplicate/near-duplicate creator indexes exist on invoices and payments
- appointment location lookup has `(workspace_id, location_id)` coverage

Index cleanup is lower priority than contract and security correction, but duplicates should be removed only after query-plan verification.

## Security advisor items that block certification

- classify and reduce anonymous `SECURITY DEFINER` surface
- classify authenticated `SECURITY DEFINER` surface
- fix mutable `search_path` on `prevent_double_booking`
- review leaked-password-protection setting for Auth
- keep intentional RLS-with-no-policy tables documented as server/RPC-only

## Phase 1 migration strategy

1. verify frontend/server call sites use only the canonical RPC versions
2. add a migration revoking browser execution from superseded booking RPCs
3. harden `prevent_double_booking` search path
4. add an idempotent Tier A location backfill for appointment-owned metadata only
5. add a report/query for Tier B unresolved historical appointments
6. add a database invariant/test ensuring new public bookings cannot persist without an appointment-specific `location_id`
7. regenerate production TypeScript types and compare against repo types
8. replay the full migration chain against a clean development database
9. run database contract and tenant-isolation tests
10. only then apply the production hardening/backfill migration

## Non-negotiable safety rule

No migration may infer a historical service location solely from the current customer profile address.