# Service Writer API Master Checklist

## B00 — Backend foundation and contracts
- [x] Repurpose starter as backend/API.
- [x] Restore Supabase server/admin, Stripe and Resend dependencies.
- [x] Add Drizzle/Postgres dependencies and server-only database environment contract.
- [x] Establish server-only Drizzle client.
- [x] Define API error envelope and request IDs.
- [x] Define request validation helpers and CORS policy.
- [x] Establish health/readiness endpoints.
- [ ] Align package-lock.json with backend package manifest.
- [ ] Baseline install/typecheck/lint/build GREEN.

## B01 — Database inventory and Drizzle mapping
- [x] Inventory existing production Service Writer tables, columns, enums, constraints and functions.
- [x] Map retained domain tables without destructive migration.
- [ ] Establish migration ownership and drift checks.
- [x] Verify tenant/workspace indexes and constraints.

## B02 — Authentication and authorization
- [x] Verify Supabase session/JWT server-side.
- [x] Resolve user membership/workspace server-side.
- [x] Never trust browser-supplied workspace or role.
- [ ] Define owner/admin/office/technician authorization policies.

## B03–B07 — Core APIs
Customers → Vehicles → Service Catalog → Appointments → Work Orders → Quotes/Approvals → Invoices → Payments → Business Settings.

Each endpoint requires validation, authorization, tenant isolation, persistence, error tests and contract tests.

## B08 — Public booking
- [ ] Resolve tenant server-side.
- [ ] Availability, customer, vehicle, service and appointment operations are server-owned.
- [ ] Final booking uses an idempotency key and server-owned transaction boundary.
- [ ] Payment initiation is server-owned.
- [ ] No browser-to-database business access.

## B09 — Production certification
- [ ] API unit/integration tests GREEN.
- [ ] Database contract/drift checks GREEN.
- [ ] Stripe webhook verification GREEN.
- [ ] Full booking-to-payment journey GREEN.
- [ ] Production health/readiness GREEN.
- [ ] Rollback artifact recorded.
