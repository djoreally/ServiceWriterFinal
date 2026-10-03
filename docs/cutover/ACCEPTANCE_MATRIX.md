# Stage 22 production acceptance matrix

All scenarios must execute against the exact backend/frontend candidate SHAs and a production-equivalent database/environment.

| Area | Required acceptance evidence |
|---|---|
| Authentication | Supabase browser login succeeds; frontend forwards cookie session and bearer session to backend; unauthorized and cross-workspace requests fail |
| Workspace | list/select workspace; role/tenant isolation; owner continuity |
| Customers | create/read/update/archive; first-name-only compatibility; tenant isolation |
| Vehicles | create/read/update/archive; customer linkage; VIN validation; oil/spec metadata compatibility |
| Services | catalog list/create/update/archive; legacy service-ID mapping verified |
| Scheduling | availability windows, blocks, notice, horizon, same-day, capacity and concurrent booking |
| Appointments | create/read/update/reschedule/confirm/start/complete/cancel/no-show; legal transition enforcement; technician assignment gate |
| Work orders | appointment conversion + standalone create; update; transitions; assigned technician; lines; fleet authorization revalidation |
| Inspections | template/version, findings, evidence, completion/cancel |
| Estimates | versioning, totals, immutable financial snapshot, sent/superseded/expired |
| Approvals | public token one-time secret behavior, approve/decline/partial, exact estimate version, work-order application |
| Parts/Labor | catalog, execution, approval provenance, procurement, returned/cancelled exclusion, gross-profit math |
| Invoices | work-order-backed create, manual compatibility lines, server totals, issue numbering, immutable issued document, void protection |
| Payments | cash/manual settlement, Stripe intent, webhook success/failure/cancel, partial payment, overpayment/unapplied funds, refunds |
| Communications | booking/appointment/completion email queue/send, consent checks, retries, Resend delivery callbacks |
| Public booking | profile/catalog, backend-only availability, single and multi-vehicle, capacity race, consent, pay-later, confirmation email |
| Fleet | account/contact/vehicle, PO/threshold authorization, stale authorization invalidation |
| Business settings | identity/tax/payment/service-area/branding policy; merged validation |
| Webhooks/events | signature verification, replay rejection, dedupe, retry, canonical outbox event |
| Developer API | issue/rotate/revoke/expire key, rate limit, tenant isolation, events/services scope |
| Developer docs | `/developers`, OpenAPI, SDK sample and Node sample match runtime |
| Legacy shutdown | every documented disabled route returns 410 and performs no business write |
| Browser boundary | network/session replay proves no canonical core business-table/RPC/Edge Function access from browser |
| Data reconciliation | counts, IDs, service references, invoice totals and net payments match signed reconciliation report |
| Failure/rollback | backend unavailable fails closed; partial booking fails atomically; rollback drill restores previous frontend/backend routing without data loss |

## Release rule

A structural verifier is not runtime acceptance. Any missing row in this matrix keeps production activation blocked.
