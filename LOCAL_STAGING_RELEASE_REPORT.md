# Service Writer Local Staging Release Report

**Date:** 2026-08-27  
**Purpose:** Validate the secure public-booking RPC refactor in isolated Supabase Local staging before any production database or application release.

## Executive result

Supabase Local was initialized and run through Docker in an isolated harness project. The reviewed secure public-booking RPC migration applied successfully after two SQL defects were found by local PostgreSQL parsing: a missing closing parenthesis in the appointment insert expression and an implicit `PUBLIC` function-execution privilege that remained after the initial allowlist grants. The migration now explicitly revokes `PUBLIC` from every new secure RPC before granting execution only to `anon` and `authenticated`.

Production was not modified. The production baseline still contains the seven legacy privileged RPCs, each marked `SECURITY DEFINER` and executable by `anon` and `authenticated`; the new secure RPC family is not yet deployed there.

## Local staging environment

| Item | Result |
|---|---|
| Supabase Local | Started successfully via Docker |
| Local PostgreSQL | 17.6.1 |
| Local REST API | Available on `127.0.0.1:54321` |
| Local database | Available on `127.0.0.1:54322` |
| Test data | Two deterministic tenants, tenant-specific slug/settings, catalog, customer, and vehicle |
| Production impact | None |

The repository’s complete migration history cannot currently be replayed as-is because it contains an earlier migration-order/schema prerequisite problem. The isolated harness therefore creates only the exact base tables and legacy signatures required to execute the secure RPC migration and test its authorization behavior. This validates the refactor’s SQL and control boundaries, but it is not a substitute for a full production-schema restore test.

## Adversarial staging results

| Test | Result |
|---|---|
| Legacy privileged RPC execution revoked from `PUBLIC`, `anon`, and `authenticated` | PASS |
| New secure RPC family explicitly executable by `anon` | PASS |
| Repeated customer submission returns the same customer ID | PASS |
| Valid tenant-one booking succeeds | PASS |
| Invalid booking slug rejected with `BOOKING_CONTEXT_INVALID` | PASS |
| Cross-tenant vehicle and service references rejected | PASS |
| Repeated booking for an occupied slot rejected with `SLOT_UNAVAILABLE` and no duplicate appointment | PASS |
| RLS enabled on all local fixture tables | PASS |
| Secure RPCs use `search_path = pg_catalog, public` | PASS |
| Application TypeScript validation | PASS |
| Application lint | PASS; existing warnings remain |
| Focused unit, contract, and journey tests | PASS; 4 suites and 15 tests |
| Production build | Not completed in the final pass because the sandbox build worker was SIGTERM-terminated under high memory pressure; prior refactor validation had reached the build stage successfully |

## Important correction discovered during staging

The first local ACL inspection showed `PUBLIC` execution on the new secure functions. PostgreSQL functions receive default `PUBLIC` execution unless it is explicitly removed. The migration was corrected to run `REVOKE ALL ... FROM public` for each new secure RPC before granting the intended browser roles. A clean local database reset and the complete test suite then passed.

The final local ACL state contains only the owner, `anon`, `authenticated`, and `service_role` entries for the secure family; no implicit `PUBLIC` entry remains. The legacy family is revoked from browser roles.

## Production release gate

The following gates remain open before production:

1. Apply the corrected migration to production during an approved change window.
2. Run production post-migration queries that verify exact signatures, `SECURITY DEFINER` settings, `search_path`, and ACLs.
3. Run a controlled live booking smoke test using a dedicated test workspace or approved test fixture, not a real customer record.
4. Execute application and database rollback rehearsals.
5. Re-run the two-tenant negative suite against a production-like environment with the complete schema and real RLS policies.
6. Deploy the application and migration together so callers and database contracts cannot drift.

SOC 2 is being used as a governance and control-design guideline only. This report does not claim SOC 2 certification or legal privacy compliance.

## Artifacts

- `supabase/migrations/20260827100000_secure_public_booking_rpc_context.sql`
- `LOCAL_STAGING_RPC_EVIDENCE.md`
- `LOCAL_STAGING_RPC_PRIVILEGES.txt`
- `staging_rpc_tests.sql` in the isolated local harness
- `SECURITY_DEFINER_RPC_REFACTOR_REPORT.md`
