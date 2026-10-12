# Service Writer Core Certification

## Rule
A capability is not certified because its screen renders. It is certified only when database schema, domain contract, API behavior, authorization, automated tests, and production behavior agree.

## Feature freeze
Until this gate passes, changes should be limited to production outages, certification work, test coverage, schema corrections, security corrections, and backend contract stabilization.

## Certification sequence

### 0. Restore MOMS public booking
- Verify the production booking hostname resolves and serves the intended Service Writer deployment.
- Verify the public-booking configuration endpoint returns the MOMS workspace/business configuration.
- Verify service selection, vehicle capture, appointment-owned service address, availability, customer details, confirmation, and persistence.
- Verify the created appointment is readable from the authenticated operations application.
- Do not mark complete until a production smoke booking succeeds end-to-end.

### 1. Database inventory
Inventory every production table, view, enum, function/RPC, trigger, index, foreign key, unique constraint, default, RLS policy, and migration.

Required domains:
- users/auth identities
- workspaces and membership
- customers
- vehicles
- services / service catalog
- booking configuration
- appointments
- appointment service locations
- scheduling / availability
- invoices
- payments

### 2. Canonical ownership rules
- Appointment owns the service location used for that appointment.
- Customer profile data must never silently override an appointment location.
- Vehicle belongs to the correct customer/workspace boundary.
- Service catalog is the source of truth for sellable service definitions and pricing inputs.
- Payment records and invoices reference their owning business records explicitly.

### 3. Database certification
- Migration chain applies from a clean database.
- Schema constraints encode required invariants.
- Foreign keys and delete/update behavior are explicit.
- Required indexes exist for production access paths.
- No application-critical invariant exists only in UI code.

### 4. Security certification
- Authenticated user cannot access another workspace.
- Public booking can access only the intentionally public contract.
- Public confirmation cannot mutate arbitrary workspace data.
- Admin/service credentials never ship to the browser.
- RLS and server authorization agree.

### 5. Backend/API certification
Public booking and operations APIs must be testable without opening the browser.

Minimum contracts:
- get public booking configuration
- get services/service catalog
- get availability
- create public booking
- read appointment
- update/reschedule appointment
- cancel appointment
- customer CRUD
- vehicle CRUD
- invoice lifecycle
- payment lifecycle

### 6. Automated acceptance pipeline
Run in this order:
1. schema/migration validation
2. typecheck/static analysis
3. database contract tests
4. tenant-isolation/security tests
5. API contract tests
6. integration lifecycle tests
7. browser E2E tests
8. production smoke tests

A downstream stage does not make an upstream failure acceptable.

### 7. Frontend rule
The frontend is a replaceable client of certified APIs. Business invariants, tenancy rules, persistence behavior, and lifecycle state transitions must not depend on a specific React screen.

## Core Certified exit criteria
- [ ] Production schema inventory complete
- [ ] Migration chain applies cleanly
- [ ] Tenant isolation tests pass
- [ ] Auth tests pass
- [ ] Public booking configuration API passes
- [ ] Public booking confirmation API passes
- [ ] Appointment CRUD passes
- [ ] Appointment-owned service location is persisted and read back correctly
- [ ] Customer-address fallback is eliminated
- [ ] Customer CRUD passes
- [ ] Vehicle CRUD passes
- [ ] Service catalog contract passes
- [ ] Scheduling/availability passes
- [ ] Invoice/payment lifecycle passes
- [ ] Contract tests pass
- [ ] Integration tests pass
- [ ] Production MOMS smoke booking succeeds and persists correctly

Only after every required item above is green should ordinary frontend feature work resume.
