# Phase 2 — Canonical Public Booking API

Date: 2026-10-12

## Objective

Move public appointment creation off the browser-selectable generic RPC proxy and onto one typed Hono API contract.

This is an intentionally narrow Phase 2 slice. It does not refactor unrelated booking side effects, payments, rewards, dispatch, service lines, or frontend presentation.

## Before

Public booking creation followed this compatibility path:

1. browser upserted the booking customer and staged the entered address
2. browser called `/v1/appointments/booking-rpc`
3. browser selected `public_booking_book_appointment_v2`
4. database v2 consumed the staged address
5. database v2 delegated creation to `public_booking_book_appointment_v3`

Phase 1 certified that path as safe, but it remained transitional architecture.

## After this slice

Public appointment creation follows:

1. booking state owns the exact service address and resolved coordinates for the current submission
2. the application command passes that location explicitly into appointment creation
3. browser calls `POST /api/v1/public-bookings/appointments`
4. Hono validates the complete creation contract, including a required service address
5. Hono invokes `public_booking_book_appointment_v3` server-side
6. v3 creates the dedicated location and appointment atomically

The browser no longer chooses the appointment-creation database function name. The canonical flow does not stage a transient legacy location intent and does not rewrite the appointment location after creation.

## Invariants

The following are release blockers:

- no public appointment may be created without a non-empty service address
- `p_vehicle_id` remains mandatory
- the Hono route must call only `public_booking_book_appointment_v3` for appointment creation
- the application command must not call `public_booking_book_appointment_v2`
- the Hono route must use a server-safe anonymous Supabase client
- the canonical flow must not depend on hidden module state for location transfer
- the canonical flow must not stage `public_booking_location_intents`
- the canonical flow must not rewrite appointment location after creation
- malformed JSON must return a client error rather than a server 500
- RPC failures must produce non-2xx HTTP status while preserving booking-domain error semantics for the UI
- the existing v3 database function remains the authority for workspace resolution, customer/vehicle validation, slot locking, overlap prevention, and atomic location ownership

## Compatibility rule

`public_booking_book_appointment_v2` is not removed in this slice.

It remains temporarily available only to avoid breaking already-deployed or stale clients during rollout. No current browser appointment-creation command should call it after this change.

Removal is a separate controlled change after production verification shows the canonical Hono endpoint is serving bookings correctly.

## Verification and merge authority

Internal execution validation is the authoritative merge gate.

Before a change reaches GitHub for merge, the internal validation run must certify the intended behavior and regression contract. If that internal execution validation passes, the change may proceed to merge even when GitHub Actions, Codeac, CodeRabbit, or another external check is missing, pending, unavailable, or unable to run.

External GitHub checks are advisory evidence, not the release authority. They only become blocking when they surface a new concrete defect that invalidates the internal certification; that defect must then be fixed and the affected internal validation rerun.

Required internal validation before merge:

1. command contract confirms booking creation targets `/v1/public-bookings/appointments`
2. command contract confirms the exact service address and resolved coordinates are passed explicitly
3. command fails closed when the service address is missing
4. vehicle persistence remains required
5. route contract confirms Hono mounts the public-booking router
6. route contract confirms Hono calls v3 and never exposes the appointment-creation RPC selector to browser code
7. route contract confirms malformed JSON returns 400
8. route contract confirms RPC failures return non-2xx status
9. regression contract confirms there is no hidden booking-location map
10. regression contract confirms the canonical flow does not stage `public_booking_location_intents`
11. regression contract confirms the appointment location is not rewritten after creation
12. review findings that identify real defects are resolved before merge

GitHub status, external CI availability, and third-party analysis do not override a passing internal certification by themselves.

## Required after deployment before retiring v2

1. submit a transaction-safe or disposable public booking through the live Hono endpoint
2. verify the resulting appointment owns a dedicated `location_id`
3. verify the persisted address exactly matches the submitted booking address
4. verify coordinates when supplied
5. verify no cross-workspace location linkage
6. confirm booking creation logs show no current-client calls to the v2 appointment RPC

## Rollback

Application rollback is the previous release/commit. The Phase 1 v2 compatibility function remains intact during this rollout, so rollback does not require a database rollback.

## Next controlled slice

After production verification:

- remove `public_booking_book_appointment_v2` from the browser-facing booking RPC allowlist
- revoke browser execution of v2 if no supported client still needs it
- remove the transient `public_booking_location_intents` compatibility infrastructure if no other flow uses it
- certify the resulting public-booking creation path again
