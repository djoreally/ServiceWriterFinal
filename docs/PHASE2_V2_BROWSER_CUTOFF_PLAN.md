# Phase 2 — v2 Browser Cutoff Plan

Date: 2026-10-12

## Objective

Retire browser access to the legacy `public_booking_book_appointment_v2` compatibility surface without immediately destroying the compatibility implementation.

This is a controlled deprecation step, not a hard delete.

## Current certified state

Canonical appointment creation is now:

`booking state -> typed Hono endpoint -> public_booking_book_appointment_v3 -> appointment-owned location + appointment`

Production Phase 2 is deployed and database-certified. The remaining release gate is one valid production POST through:

`POST /api/v1/public-bookings/appointments`

The resulting appointment must be verified before this cutoff is activated.

## Activation gate

Do not merge/apply this slice until all of the following are true:

- a valid production POST reaches `/api/v1/public-bookings/appointments`
- the request succeeds through the canonical Hono boundary
- the created appointment has a dedicated `location_id`
- that location belongs to the same workspace as the appointment
- the location is `customer_site`
- persisted address matches the submitted booking address exactly
- supplied coordinates match when present
- the appointment customer/vehicle remain tenant-owned
- production logs show no current-client dependence on `public_booking_book_appointment_v2`

## Stage 1 change

Migration `20261012184000_disable_legacy_public_booking_v2_browser_execute.sql` revokes `EXECUTE` from `anon` and `authenticated` on both production v2 overloads:

1. staged-location v2 signature
2. explicit-location v2 signature

The migration deliberately preserves `service_role` execution.

It deliberately does not:

- drop either v2 function
- drop `public_booking_location_intents`
- alter v3
- alter customer/vehicle upsert RPCs
- alter payment, service-line, reward, or dispatch behavior

## Hono allowlist change

At activation time, `public_booking_book_appointment_v2` must also be removed from `BOOKING_RPC_ALLOWLIST` in `src/server/hono/routes/appointments.ts`.

That source change is intentionally not being merged independently of the production POST gate. The database revocation and Hono allowlist removal must ship as one controlled browser-cutoff release.

## Verification after activation

After deployment/migration:

- confirm `anon` cannot execute either v2 overload
- confirm `authenticated` cannot execute either v2 overload
- confirm `service_role` still can execute both v2 overloads
- confirm canonical Hono booking still succeeds
- verify the new appointment-owned location invariants again
- verify `public_booking_location_intents` remains unused by current clients
- inspect production runtime/database errors for compatibility fallout

## Rollback

If a concrete regression appears during the cutoff window:

1. restore the v2 allowlist entry only if the old client path must be temporarily re-enabled;
2. restore `EXECUTE` to `anon, authenticated` on the affected v2 overloads;
3. do not modify v3 or appointment/location data to perform rollback;
4. identify the caller that still depends on v2;
5. migrate that caller to the typed Hono boundary before retrying the cutoff.

## Stage 2 — later physical deletion

Only after the browser cutoff has run cleanly and monitoring confirms zero supported callers:

- drop both `public_booking_book_appointment_v2` overloads
- stop address staging in `public_booking_upsert_customer` if no supported compatibility caller needs it
- drop `public_booking_location_intents`
- remove obsolete compatibility documentation/tests
- rerun booking, tenant-isolation, and appointment-owned-location certification

## Status

Prepared, not activated.

**Merge blocker:** valid production canonical Hono POST has not yet been observed and certified.
