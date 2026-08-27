# Local Supabase Staging RPC Evidence

Date: 2026-08-27
Environment: Supabase Local via Docker, project `servicewriter-local-harness`
Database: local Postgres 17.6.1

The local harness applied the secure public-booking RPC migration successfully. The staging test suite passed the following controls:

| Test | Result |
|---|---|
| Legacy privileged RPC grants revoked from `PUBLIC`, `anon`, and `authenticated` | PASS |
| Secure public RPC allowlist grants present for `anon` | PASS |
| Repeated customer submission returns the same customer ID | PASS |
| Valid tenant-one booking succeeds | PASS |
| Invalid booking slug rejected with `BOOKING_CONTEXT_INVALID` | PASS |
| Cross-tenant vehicle/service references rejected | PASS |
| Repeated booking for the occupied slot rejected with `SLOT_UNAVAILABLE` and no duplicate appointment | PASS |
| RLS enabled on all eight local fixture tables | PASS |

The local harness used deterministic fixtures for two workspaces, two booking slugs, tenant-specific service catalog rows, a tenant-two customer, and a tenant-two vehicle. Production was not modified.
