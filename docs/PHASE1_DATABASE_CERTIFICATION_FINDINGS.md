# Phase 1 — Production Database Certification Findings

Date: 2026-10-12
Production Supabase project: `service writermain` (`rjfbrfognxqkyhdrpibx`)
Scope: read-only production inventory and integrity assessment. No production data or schema was mutated during this pass.

## Executive result

The Service Writer core relational model is not broadly corrupt. Workspace-scoped foreign keys are present across the main customer → vehicle → appointment → work order → invoice → payment path, and the integrity checks performed in production found no current cross-workspace mismatches in that chain.

The highest-severity database defect is appointment service-location ownership and historical persistence. The current canonical tables allow an appointment to have a nullable `location_id`; the address itself lives in `locations`, while public booking has also used `public_booking_location_intents`, appointment metadata, and historically customer address fields as intermediate or fallback storage. This created multiple competing sources of truth.

## Production scope discovered

Core entities confirmed in production include:

- `workspaces`
- `workspace_members`
- `workspace_settings`
- `customers`
- `vehicles`
- `locations`
- `service_catalog`
- `service_packages`
- `service_package_items`
- `appointments`
- `appointment_items`
- `work_orders`
- `work_order_items`
- `service_records`
- `invoices`
- `invoice_lines`
- `payments`
- `public_booking_location_intents`

RLS is enabled on the core tables inspected. Authorization policy behavior is certified separately in Phase 2.

## Finding P1-DB-001 — Appointment location is nullable and not self-contained

`appointments` has no address snapshot columns. Its service location is represented only by nullable `location_id`, which references `locations` inside the same workspace.

This means the appointment itself cannot prove where service is to occur unless its location relationship is present and valid.

### Production impact in MOMS

MOMS workspace: `250c258f-fad6-46e1-86de-3de41a7d4e1a`

Production counts at audit time:

- total appointments: **212**
- appointments with `location_id IS NULL`: **211**
- appointments with a location: **1**
- public/public-booking-like appointments: **25**
- public/public-booking-like appointments with no location: **24**

Therefore **99.5% of all MOMS appointments** and **96% of identified public bookings** have no canonical appointment location relationship.

Recent production rows show the address often survives in one of these places instead:

1. `customers.address_line1`
2. `appointments.metadata.location_address`
3. historical/transient `public_booking_location_intents`

Those are not equivalent to an appointment-owned service-location contract.

### Evidence of the intended newer behavior

`public_booking_book_appointment_v3` now requires `p_location_address`, inserts an `Appointment service location` row with `location_type='customer_site'`, and writes that returned `location_id` to the new appointment.

`public_booking_update_appointment_context_v2` can also create/update a customer-site location and bind it to the appointment.

This newer path is structurally better, but nearly all existing MOMS records predate or bypassed it, and older public-booking contracts still exist.

### Required correction

The certified contract must be:

- every mobile-service appointment has a non-null appointment-specific service location;
- dispatch and operations read that appointment location only;
- customer address is profile/contact information only and is never an implicit appointment-location fallback;
- changing a customer profile must not mutate the service location of an existing or future appointment;
- a safe historical backfill strategy must be defined before making location mandatory.

Tracked by issue #121.

## Finding P1-DB-002 — Multiple public-booking RPC generations coexist

Production exposes old and new booking functions simultaneously, including examples such as:

- `book_appointment_safe`
- `public_booking_book_appointment`
- `public_booking_book_appointment_v2`
- `public_booking_book_appointment_v3`
- `public_booking_insert_services_v2` through `v7`
- old business-user-id based public lookup functions
- newer booking-slug/workspace scoped public functions

Migration history also contains multiple successive hardening and replacement migrations for this same surface.

This does not by itself prove an active security defect, but it prevents the database contract from being called canonical: callers can drift onto older behavior unless obsolete functions are proven unreachable/revoked and eventually removed.

### Required correction

Create a public-booking RPC inventory with four states:

- `CANONICAL`
- `COMPATIBILITY_ONLY`
- `REVOKED`
- `REMOVE`

There must be one documented write path for booking creation and one documented contract per post-create mutation.

## Finding P1-DB-003 — Core tenant relationships are substantially hardened

The production database already uses composite workspace-scoped foreign keys for important relationships, including:

- appointments → customers
- appointments → vehicles
- appointments → locations
- appointment items → appointments / service catalog
- work orders → appointments / customers / vehicles / locations
- invoices → customers / vehicles / work orders
- invoice lines → invoices / service catalog / vehicles
- payments → invoices / customers

Read-only integrity checks found:

- cross-workspace service-package/service-catalog items: **0**
- work-order/appointment ownership mismatches: **0**
- invoice/work-order ownership mismatches: **0**
- payment/invoice ownership mismatches: **0**

This is a strong base to preserve.

## Finding P1-DB-004 — A few nullable core ownership relationships remain

At audit time, across production:

- vehicles without a customer: **1**
- appointments without a vehicle: **1**
- appointments without a location: **212**

The first two need classification before adding stronger constraints because some business workflows may intentionally allow them. Appointment location is different for a mobile-service appointment and must become a required domain invariant for that service mode.

## Finding P1-DB-005 — Migration history shows repeated production backfills

The production migration ledger currently includes recent migrations such as:

- `20261009163921 fix_public_booking_service_address_ownership`
- `20261009164135 persist_public_booking_appointment_location`
- `20261009165643 atomic_start_and_public_booking_location`
- `20261009165923 public_booking_v2_location_overload`
- `20261009165955 enforce_location_on_legacy_public_booking_v2`
- `20261010163000 backfill_missing_prod_tables`
- `20261010163100 backfill_missing_prod_functions`

The presence of explicit production backfill migrations means migration parity must be treated as an acceptance test, not assumed from repository state.

### Required certification test

A clean database must be able to apply the repository migration chain and produce a schema/function surface that matches the production canonical contract without manual repair migrations.

## Canonical ownership map — Phase 1 decision

| Domain | Canonical owner/source of truth | Status |
|---|---|---|
| Workspace identity | `workspaces` | CANONICAL |
| Membership/tenant access relationship | `workspace_members` | CANONICAL; auth policy testing deferred to Phase 2 |
| Business/booking configuration | `workspace_settings` | CANONICAL |
| Customer contact/profile | `customers` | CANONICAL |
| Vehicle | `vehicles` scoped to workspace/customer | CANONICAL |
| Sellable service definition | `service_catalog` | CANONICAL |
| Appointment | `appointments` | CANONICAL |
| Appointment service address | appointment-specific `locations` row referenced by `appointments.location_id` | **NOT YET CERTIFIED** |
| Booking-location staging | `public_booking_location_intents` | TRANSIENT ONLY; never operational source of truth |
| Appointment-selected services | `appointment_items` | CANONICAL |
| Work execution | `work_orders` / `work_order_items` / `service_records` | CANONICAL subject to lifecycle tests |
| Invoice | `invoices` / `invoice_lines` | CANONICAL subject to financial lifecycle tests |
| Payment | `payments` plus provider event reconciliation | CANONICAL subject to lifecycle tests |

## Phase 1 gate status

- [x] Production project identified
- [x] Production core table inventory started
- [x] Core FK/tenant ownership structure inspected
- [x] RLS-enabled state inventoried for core tables
- [x] MOMS appointment-location defect quantified
- [x] Public-booking canonical/newer RPC behavior inspected
- [x] Cross-entity tenant-integrity spot checks passed
- [x] Production migration ledger inspected
- [ ] Complete function/RPC canonicalization inventory
- [ ] Complete index/constraint inventory for critical query and uniqueness paths
- [ ] Classify nullable vehicle/customer edge records
- [ ] Define migration/backfill plan for appointment-owned locations
- [ ] Prove clean migration replay against staging/fresh database
- [ ] Regenerate and diff repository production types against live production

Phase 1 is **in progress**, not certified yet.
