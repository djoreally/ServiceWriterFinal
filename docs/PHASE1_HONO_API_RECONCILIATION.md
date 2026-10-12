# Phase 1 — Hono/API Reconciliation

## Conclusion

Service Writer does **not** need a new backend. The Hono API already exists on `main` and is substantial. Phase 1 must converge all application traffic onto that backend boundary and certify it.

## Branch sweep

The repository currently has 134 branches. All branch names were enumerated, then the branches most likely to contain backend/API/runtime/certification work were inspected for `src/server/hono` and compared with `main`.

Notable inspected branches include:

- `certify/api-platform-reconciliation`
- `fix/public-booking-rpc-contract-drift`
- `fix/production-audit-remediation-pass`
- `hardening/regression-lock-20261007`
- `hotfix/enforce-server-data-boundary`
- `runtime-consolidation-1-10`
- `chore/phase-a-architecture-certification`
- `chore/white-box-green`
- `repair/servicewriter-green-20260920`
- `fix/module1-appointments-booking-certification`

The post-Hono branches inspected carry an older Hono snapshot than `main`; several older branches predate the Hono tree entirely. No newer stranded Hono implementation was found in those candidate branches.

`main` contains newer/larger route modules than `certify/api-platform-reconciliation` for appointments, billing, CRM, documents, messaging, platform, vehicles, and work orders. The catalog module is shared/unchanged. Main has also removed at least one legacy Next route that shadowed a Hono endpoint (`appointments/:id/start`) and added newer audit/calendar behavior.

## Current Hono domains on main

`src/server/hono/app.ts` mounts domain routers for:

- appointments
- billing
- catalog
- CRM
- documents
- messaging
- platform
- vehicles
- work orders

The appointments router is already a large operational API surface including appointment CRUD, confirmation, start, completion, technician state, appointment items, dispatch events, assignment, public booking helpers, and related operations.

## What remains unfinished

Hono currently coexists with specific `app/api/**/route.ts` handlers. Next gives those specific route handlers precedence over the catch-all Hono mount, which creates a route-shadowing risk.

The repository also still contains direct Supabase usage outside the Hono route layer. Not every `supabase.from(...)` call is a bypass—server implementations legitimately use Supabase—but client/browser direct persistence paths must be classified and removed where they bypass application contracts.

The October 10 forensic audit already documented browser-direct Supabase writes in fleet operations, vehicle intelligence/import, audit/presence/analytics, and other areas. This is consistent with the current code search and explains why the API can be mostly built while the application still behaves like a hybrid architecture.

## Public booking atomicity gap

The current client call sequence is still compatibility-shaped:

1. `public_booking_upsert_customer` stages the entered booking address in `public_booking_location_intents`;
2. `bookAppointmentSafe` invokes `public_booking_book_appointment_v2` without a location argument;
3. the hardened v2 compatibility function obtains the staged address and routes into the location-aware v3 implementation;
4. after appointment creation, the client separately calls `public_booking_update_appointment_context_v2` with `location_address` and coordinates.

This is safer than the old behavior, but it is not the desired final contract. The canonical creation request should contain the appointment service location directly, and appointment creation should atomically persist both the appointment and its location.

Target flow:

`Hono create-public-booking command -> validated customer/vehicle/service/location -> one atomic database contract -> appointment + appointment-specific location`

The staged-intent compatibility mechanism can then be retired after all clients use the canonical request.

## Required convergence inventory

Every remaining `app/api/**/route.ts` must be placed into exactly one category:

### A. Intentionally standalone

Routes that have a legitimate runtime reason not to live under the normal Hono domain router, such as provider webhooks or OAuth callback boundaries, may remain standalone if documented and contract-tested.

### B. Not yet migrated

Business API routes that are not represented in Hono must be migrated into the appropriate domain router and contract-tested.

### C. Shadowing/duplicate

If a Hono implementation already exists, the specific Next handler must be removed after the Hono route passes parity tests. Two live implementations of the same operation are not allowed at Core Certified.

## Direct Supabase classification

Every browser/client Supabase call must be classified as:

- auth/session operation intentionally client-side;
- realtime/subscription operation intentionally client-side;
- read-only public data intentionally client-side and RLS-certified;
- **application data read/write that must move behind Hono**.

No business mutation may bypass Hono merely because RLS happens to allow it.

## Environment parity blocker

The project named `ServiceWriterFinalstaging and backup` is not a trustworthy certification environment.

Observed state:

- production has the modern migration history through 2026-10-10 and includes `workspace_settings`, appointment metadata, location ownership fixes, financial authority, double-booking protection, and canonical start-job work;
- the staging/backup project reports only 11 migrations;
- staging does not contain `workspace_settings`;
- staging `appointments` lacks the current `metadata` column.

Therefore staging cannot be used to certify current migrations or API contracts until rebuilt from the canonical migration chain.

## Core Certified backend exit criteria

- [ ] one authoritative Hono route per business operation
- [ ] no accidental Next-route shadows
- [ ] remaining standalone Next routes explicitly justified
- [ ] no browser-direct business mutation bypass
- [ ] public booking creation atomically includes appointment-owned location
- [ ] compatibility RPCs retired after call-site migration
- [ ] clean database environment can replay the complete canonical migration chain
- [ ] Hono API contract tests pass against that clean database
- [ ] tenant-isolation tests pass
- [ ] production smoke tests pass
