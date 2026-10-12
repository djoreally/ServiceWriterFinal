# Phase 1 Production Certification Result

Date: 2026-10-12

## Result

Phase 1 database, tenancy, appointment-location ownership, public-booking persistence, and runtime guardrail work is complete in production.

## Production evidence

### MOMS appointment locations

After the historical recovery migration:

- 212 MOMS appointments total
- 212 appointments have a dedicated `location_id`
- 0 appointments are missing a location
- 0 public bookings are missing a location
- 9 historical rows were recovered from appointment-owned `metadata.location_address`
- 202 historical rows were recovered from the customer address under the owner-confirmed historical rule
- 0 cross-workspace appointment/location links exist
- 0 backfilled location rows are shared between appointments

The remaining appointment already had a location before the backfill.

Forward invariant remains different from the historical recovery rule: a new mobile/public booking must own a dedicated service location at creation time. Customer profile address is not an implicit service-location fallback.

### Public booking transaction smoke

A production transaction was executed through the anonymous public-booking RPC surface and rolled back after verification. The transaction:

1. created/staged a guest customer
2. created a vehicle
3. called `public_booking_book_appointment_v3`
4. created the appointment in the MOMS workspace
5. created a dedicated `customer_site` location
6. linked the appointment to that location
7. confirmed the persisted address exactly matched the submitted service address

The transaction was rolled back and a follow-up query confirmed no certification customer or appointment remained in production.

### Tenant isolation

An authenticated user belonging to another Service Writer workspace was used to query the MOMS workspace under RLS. The user could see:

- 0 MOMS customers
- 0 MOMS vehicles
- 0 MOMS appointments
- 0 MOMS invoices
- 0 MOMS payments

This validates the core cross-workspace read boundary for the primary operational records.

## Runtime defects found and corrected during certification

### Appointment invoice-sync recursion

The appointment invoice trigger could recursively re-enter itself when canonical invoice synchronization wrote financial metadata back to `appointments.metadata`. The runtime guard now:

- stops nested trigger re-entry using `pg_trigger_depth()`
- ignores location-only metadata changes for invoice synchronization
- keeps the trigger function non-browser-callable

### Double-booking guard firing on unrelated updates

The overlap trigger previously ran on every appointment update. Historical overlapping rows therefore blocked unrelated maintenance such as location backfills. The trigger now runs only on insert or updates to scheduling fields:

- `workspace_id`
- `starts_at`
- `ends_at`
- `status`

The overlap guard's `search_path` is fixed and direct browser execution is revoked.

### Legacy public mutation surface

The unbound legacy `public_booking_update_appointment_context` signature is no longer executable by browser roles. Runtime code uses the identity-bound `v2` contract.

Anonymous access was also removed from internal staff/trigger helpers found during the security-advisor pass.

## Hono/API reconciliation

The branch sweep confirmed the Hono backend work is already on `main` and is newer than the older API/hardening branches inspected. Phase 1 does not require rebuilding the backend.

Public-booking mutation commands use the Hono `/v1/appointments/booking-rpc` boundary. The current compatibility `public_booking_book_appointment_v2` remains temporarily allowed because it fails closed without a staged service address and delegates creation to the location-aware v3 function.

The booking contract tests were updated to match this actual architecture and the current October location-aware migrations rather than the retired direct-Supabase contract.

## Environment/CI note

The project named `ServiceWriterFinalstaging and backup` is not a production-equivalent staging environment. It has a short historical migration chain and lacks current production schema elements, so it must not be used as certification evidence.

GitHub Actions runs currently fail before any job steps are emitted; the workflow API returns empty step lists for the frontend, Next API, and migration jobs. This is an Actions runner/account execution problem rather than an observed test assertion failure. Production contract validation was therefore performed directly with transactional database tests and read-only verification queries for Phase 1.

A fresh paid Supabase branch would provide a future clean replay target, but creating one incurs hourly branch cost and is not required to preserve the production fixes applied in this phase.

## Phase 1 status

**COMPLETE — production database and public-booking location ownership certified for the Phase 1 scope.**

Subsequent phases should continue the same rule: schema and API contracts first, frontend only after the underlying domain is certified.
