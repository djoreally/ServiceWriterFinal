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

1. application command retains the exact address supplied during the current booking submission
2. browser calls `POST /api/v1/public-bookings/appointments`
3. Hono validates the complete creation contract, including a required service address
4. Hono invokes `public_booking_book_appointment_v3` server-side
5. v3 creates the dedicated location and appointment atomically

The browser no longer chooses the appointment-creation database function name.

## Invariants

The following are release blockers:

- no public appointment may be created without a non-empty service address
- `p_vehicle_id` remains mandatory
- the Hono route must call only `public_booking_book_appointment_v3` for appointment creation
- the application command must not call `public_booking_book_appointment_v2`
- the Hono route must use a server-safe anonymous Supabase client
- the existing v3 database function remains the authority for workspace resolution, customer/vehicle validation, slot locking, overlap prevention, and atomic location ownership

## Compatibility rule

`public_booking_book_appointment_v2` is not removed in this slice.

It remains temporarily available only to avoid breaking already-deployed or stale clients during rollout. No current browser appointment-creation command should call it after this change.

Removal is a separate controlled change after production verification shows the canonical Hono endpoint is serving bookings correctly.

## Verification

Required before merge:

1. command contract test confirms booking creation targets `/v1/public-bookings/appointments`
2. command test confirms the exact staged booking address is included
3. command test fails closed when the address is missing
4. route contract test confirms Hono mounts the public-booking router
5. route contract test confirms Hono calls v3 and not the browser-client helper
6. typecheck/build should pass when GitHub Actions execution is available

Required after deployment before retiring v2:

1. submit a transaction-safe or disposable public booking through the live Hono endpoint
2. verify the resulting appointment owns a dedicated `location_id`
3. verify the persisted address exactly matches the submitted booking address
4. verify no cross-workspace location linkage
5. confirm booking creation logs show no current-client calls to the v2 appointment RPC

## Rollback

Application rollback is the previous release/commit. The Phase 1 v2 compatibility function remains intact during this rollout, so rollback does not require a database rollback.

## Next controlled slice

After production verification:

- remove `public_booking_book_appointment_v2` from the browser-facing booking RPC allowlist
- revoke browser execution of v2 if no supported client still needs it
- remove the transient `public_booking_location_intents` creation dependency if no other flow uses it
- certify the resulting public-booking creation path again
