# SECURITY DEFINER RPC Refactor Report

**Status:** Implemented in repository; database migration staged, not applied to production.  
**Date:** 27 August 2026

## Refactor result

The public booking flow no longer calls the legacy high-risk mutation RPCs directly. It now calls a dedicated slug-bound RPC family. Each public RPC resolves the workspace from the canonical booking slug and rejects an invalid or disabled booking context before performing any mutation.

| Legacy function | New public contract | Tenant/ownership control |
|---|---|---|
| `upsert_customer` | `public_booking_upsert_customer` | Resolves workspace from slug; validates email/name; returns an existing customer without overwriting it; inserts only within resolved workspace |
| `upsert_booking_vehicle` | `public_booking_upsert_vehicle` | Resolves workspace from slug and customer from booking email; no caller-supplied customer UUID; legacy vehicle mutation is constrained to that tenant |
| `book_appointment_safe` | `public_booking_book_appointment` | Resolves workspace from slug; validates duration, amounts, hours, lead/advance window, service, vehicle workspace, vehicle-to-customer ownership, and slot conflict; creates/uses customer without public overwrite |
| `save_appointment_booking_configuration` | `public_booking_save_configuration` | Requires valid slug plus a recent `public_booking` appointment in the same workspace |
| `insert_booking_appointment_services` | `public_booking_insert_services` | Requires valid slug plus a recent `public_booking` appointment in the same workspace |
| `record_public_booking_payment_intent_v1` | `public_booking_record_payment_intent_v2` | Requires valid slug plus an appointment in the resolved workspace; the legacy payment function retains its email/freshness/amount checks |
| `set_vehicle_tire_spec_v1` | `public_booking_set_vehicle_tire_spec_v2` | Resolves customer from booking email and requires the vehicle to belong to that customer and workspace |

The legacy mutation functions are explicitly revoked from `PUBLIC`, `anon`, and `authenticated`. They remain available only for trusted server-side compatibility. New public grants are an explicit allowlist for the dedicated booking contracts. All new `SECURITY DEFINER` functions use `search_path = pg_catalog, public`.

## Application changes

`src/application/commands/booking-submit.command.ts` now uses typed secure RPC contracts. `src/hooks/useBookingSubmit.ts` passes the booking slug and validated guest email rather than treating `business.user_id` as an authorization credential. The public booking journey fixture and command tests were updated, and generated Supabase function types now include the secure contracts.

The authenticated service-form compatibility layer already uses protected Next API routes for staff customer and vehicle mutations and was not redirected through the public booking contracts.

## Verification

| Check | Result |
|---|---|
| TypeScript | Passed: `npm run typecheck` |
| Focused unit/contract/journey tests | Passed: 4 suites, 15 tests |
| Production build | Passed: `npm run build` |
| Lint | Passed with 25 pre-existing warnings and 0 errors |
| Production database migration | Not applied; requires reviewed staging and change window |
| Adversarial database authorization tests | SQL test plan provided; must run after migration in staging/production-safe harness |

The journey tests emit existing React Router deprecation warnings and offline-rollout informational messages; these are not caused by the RPC refactor.

## Required deployment sequence

First compare the migration’s exact function signatures against the live Supabase function catalog. Then apply `20260827100000_secure_public_booking_rpc_context.sql` in staging. Run public booking success, duplicate/retry, invalid-slug, cross-tenant UUID, wrong-customer vehicle, stale-appointment, invalid-service, invalid-amount, and slot-conflict tests. Verify that legacy RPC calls from browser roles fail with permission denied while the new slug-bound RPCs succeed only for the intended tenant.

After staging passes, deploy application code and migration together using a controlled change window. Monitor public booking errors, appointment creation, customer creation, payment-intent creation, service/configuration inserts, and tire-spec saves. Retain the post-migration ACL and RLS query outputs as change evidence.

## Remaining risks

The public booking endpoints remain intentionally public and therefore still require edge/API rate limiting, abuse detection, payload-size limits, CAPTCHA or equivalent risk controls where appropriate, and replay/idempotency enforcement. The public wrapper delegates vehicle and configuration persistence to legacy server-side functions; those functions are no longer browser-callable, but should be migrated into a private schema or fully self-contained secure functions in a later cleanup.

The new wrappers have not been executed against the live database in this session. PostgreSQL function-body behavior, enum casts, exact overload resolution, and production constraints must be verified in staging before production application. No production database changes were made.
