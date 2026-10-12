# Phase 2 — Production Certification Result

Date: 2026-10-12

## Certified release

- Repository: `djoreally/ServiceWriterFinal`
- Phase 2 PR: `#122`
- Squash merge commit: `5f154bea273dafe3d356838c9f56eba34cb4b8d6`
- Production Vercel project: `servicewriter.xyx`
- Production deployment: `dpl_7LHyUvAbesCeu3ngBC9x6vu7P1jM`
- Deployment target: `production`
- Production state observed: `READY`
- Production aliases include `*.servicewriter.xyz`, `servicewriter.xyz`, and `www.servicewriter.xyz`

## Internal execution evidence

The production deployment cloned the exact merge commit from `main`.

The deployment's internal prebuild certification completed successfully. Evidence observed in the production build included:

- `regression-lock: PASS — known production failure modes remain pinned and responsive/E2E coverage is present.`
- `ONBOARDING SUNSET CERTIFIED: 11/11 invariants passed.`
- the optimized Next.js production build compiled successfully
- TypeScript execution entered successfully after compile
- Vercel completed the build and deployment

GitHub Actions remained non-authoritative for this release. The previously failing GitHub jobs emitted zero execution steps, so they did not report a code assertion failure and did not invalidate internal certification.

## Production database certification

Supabase production project:

- project: `service writermain`
- project ref: `rjfbrfognxqkyhdrpibx`
- status observed: `ACTIVE_HEALTHY`

MOMS tenant resolved from the live schema:

- workspace id: `250c258f-fad6-46e1-86de-3de41a7d4e1a`
- workspace: `MOMS Mobile Oil Change`
- booking slug: `momsoilchange`
- timezone: `America/New_York`
- public booking enabled: `true`

### Canonical v3 verification

The live `public.public_booking_book_appointment_v3` function was inspected directly and confirmed to:

- resolve the workspace from the booking slug
- validate email, phone, vehicle, service, lead time, and booking horizon
- require a non-empty appointment service address
- validate latitude and longitude
- verify the vehicle belongs to the matched customer and workspace
- acquire an advisory transaction lock
- reject overlapping appointments
- create a dedicated `locations` row with `location_type = customer_site`
- write that location id into the appointment atomically
- persist the submitted address and coordinates in appointment metadata
- run as `SECURITY DEFINER` with an empty `search_path`

A rollback-safe production certification used the dedicated MOMS test identity and owned vehicle. The function created, inside the certifying statement:

- temporary appointment id: `9b63c34a-8078-49a1-bdf0-63e49b848741`
- temporary location id: `47ccb9fe-08f1-4cd8-ab60-38dc5c3bf0ce`
- workspace: `250c258f-fad6-46e1-86de-3de41a7d4e1a`
- exact service address: `PHASE2-CERT-5F154BEA-20261012, Philadelphia, PA 19103`
- latitude: `39.952600`
- longitude: `-75.165200`

The certification asserted:

- appointment workspace matched MOMS
- location workspace matched appointment workspace
- location type was `customer_site`
- service address matched exactly
- coordinates matched exactly
- customer id matched the dedicated test customer
- vehicle id matched that customer's owned vehicle

The statement then intentionally raised `PHASE2_CERT_PASS`, causing PostgreSQL to roll the entire statement back atomically.

A separate residue query returned:

- appointment residue: `0`
- location residue: `0`
- marker location residue: `0`
- marker appointment residue: `0`

## Production Hono boundary status

The deployed production API catch-all was reached at `/api/v1/public-bookings/appointments`; Vercel reported the matched path as `/api/[[...route]]`.

The available execution tools in this session cannot issue an outbound POST to the production domain:

- the container runtime cannot resolve the production hostname
- Vercel's available URL fetch action is GET-only
- the production Supabase database does not currently have `http` or `pg_net` installed

No new production extension or temporary proxy was introduced merely to manufacture a POST test. That would have widened the production change surface for a certification operation.

Therefore the database and deployed application are certified, but a valid live POST through the canonical Hono endpoint remains the final gate before deleting the v2 compatibility surface.

## Legacy compatibility audit

The production database currently contains **two** overloads named `public_booking_book_appointment_v2`:

1. legacy staged-location signature, which reads `public_booking_location_intents` and delegates to v3
2. explicit-location signature, which accepts address/coordinates and delegates to v3

Both overloads currently grant `EXECUTE` to:

- `anon`
- `authenticated`
- `service_role`

`PUBLIC` does not have execute privilege on either overload.

Current `main` no longer calls v2 from `bookAppointmentSafe`; it calls the typed Hono endpoint `/v1/public-bookings/appointments` and supplies service address and coordinates explicitly.

The generic booking RPC proxy still contains `public_booking_book_appointment_v2` in `BOOKING_RPC_ALLOWLIST`.

The live `public_booking_location_intents` table contained:

- total intents: `0`
- active intents inside the two-hour legacy window: `0`

## Retirement gate

Do **not** remove the v2 compatibility surface yet.

Before retirement, prove one valid live POST through:

`POST /api/v1/public-bookings/appointments`

and verify that the resulting appointment:

- owns a dedicated `location_id`
- persists the exact submitted service address
- persists supplied coordinates
- has no cross-workspace location linkage
- is created through the canonical v3 path

After that proof, the retirement change must be a separate controlled slice that:

- removes `public_booking_book_appointment_v2` from `BOOKING_RPC_ALLOWLIST`
- revokes browser execution on **both** v2 overloads
- drops both v2 overloads only after caller verification
- removes `public_booking_location_intents` only after proving no remaining supported flow uses it
- reruns the affected internal certification before merge

## Status

Phase 2 canonical public booking creation is merged, deployed, and database-certified.

**Remaining gate:** one valid production Hono POST before v2 compatibility retirement.
