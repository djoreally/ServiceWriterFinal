# ServiceWriterFinal User Journeys, Sprint Plan, Testing, and Go-Live

## 1. User journeys

### Journey A: Workspace owner onboarding

The owner creates an account, verifies email, creates a workspace, selects shop/fleet/hybrid mode, enters timezone/currency, uploads a business logo, creates the first location, adds services, invites staff, and completes a guided “first job” walkthrough. The success state is a real appointment or fleet request created in under thirty minutes.

Acceptance requires that an owner cannot create a workspace without a valid name and slug, that duplicate slugs produce a helpful message, that a failed logo upload leaves the default brand intact, that invitations expire and can be resent, and that a workspace with no location offers a clear setup task rather than a blank calendar.

### Journey B: Office staff books and authorizes a shop job

Staff searches for a customer or creates one, selects a vehicle or adds it, chooses a service, selects a time/location, confirms contact details, and saves the appointment. The appointment card provides a direct convert-to-work-order action. The advisor adds a complaint, quote items, and approval request, sends the customer a secure link, and sees a timestamped approval event.

The workflow must prevent accidental duplicate customer creation, show vehicle uncertainty, protect tenant boundaries, handle an unavailable slot, preserve pricing snapshots, and show “approval pending” rather than implying approval.

### Journey C: Dispatcher assigns a fleet request

The dispatcher opens the exception inbox, sees a new fleet request, checks contract and site context, requests missing information if necessary, schedules the work, assigns a technician, and monitors status. The dispatcher can reassign or reschedule with a visible reason. Late and blocked jobs rise to the top automatically.

The dispatcher must not need to understand every project-management field. The default board contains only operational states; advanced contract, billing, and integration context lives in a drawer.

### Journey D: Technician completes a mobile job

The technician opens Today, sees the next job and route context, starts travel, arrives, opens the job, reads the customer/vehicle/service context, completes required checklist items, captures photos, records notes and time, flags parts or approval blockers, and marks the job complete. The customer-facing status updates only occur when the server accepts the command.

Offline drafts are clearly labeled. A technician can continue capturing evidence offline, but cannot see a false “paid” or “approved” state. Sync conflicts produce a review queue rather than silent overwrites.

### Journey E: Fleet manager handles an approval and invoice

The fleet manager opens a service request, reviews diagnosis and estimate, approves or declines, and receives a clear result. On completion, the platform generates an invoice based on the agreed quote and sends a payment link. Provider webhooks reconcile payment. The fleet account timeline shows all transitions and outstanding balances.

### Journey F: Marketing operator runs a compliant campaign

An authorized operator defines a segment such as customers with completed service in the last twelve months, chooses a channel and template, reviews the audience count and exclusions, sends a test, requests approval if policy requires, schedules or sends, and monitors delivery. The platform re-checks suppression and consent at send time.

## 2. Sprint roadmap

Assumption: two product engineers, one part-time designer/product owner, and one QA/support owner. Each sprint is two weeks. The team should shorten scope rather than silently lower security or data-integrity standards.

| Sprint | Focus | Exit criteria |
|---|---|---|
| 0 | Product/technical foundation | Rebrand decision, environments, domain model ADRs, repo conventions, CI, error tracking, test harness, Supabase project separation. |
| 1 | Auth and tenancy | Signup/login, workspace creation, invitation, membership, role checks, tenant-scoped API, RLS tests. |
| 2 | Customers, vehicles, locations | Search/list/detail/create/edit, duplicate hints, vehicle history links, logo/branding storage. |
| 3 | Catalog and appointments | Services, locations, business hours, appointment create/edit/cancel, conflict checking, calendar views. |
| 4 | Work orders and office workflow | Appointment conversion, work-order lifecycle, items, notes, assignment, activity timeline, exception states. |
| 5 | Technician full-platform foundation | Today view, mobile job detail, status actions, checklists, time, notes, attachments, offline draft queue. |
| 6 | Fleet OS core | Fleet clients, contacts, contracts, sites, vehicles, service requests, approvals, fleet dispatch board. |
| 7 | Quotes/invoices/payments | Quote snapshots, invoice lifecycle, hosted payment link, provider webhook idempotency, manual payment. |
| 8 | Notifications and customer portal | Transactional email/SMS adapter, secure customer links, delivery log, consent/suppression primitives. |
| 9 | Inspections, inventory, and reporting | Inspection templates/results, media review, basic parts/reservation, operational dashboard. |
| 10 | Integrations | Google Calendar, QuickBooks export/sync, provider health/retry screens, import/export wizard. |
| 11 | Marketing and product polish | Consent-aware segments/campaigns, role-based Today views, command palette, context drawer, bulk actions. |
| 12 | Pilot hardening | Performance, accessibility, security review, migration rehearsal, support playbook, pilot tenant onboarding. |
| 13 | Go-live preparation | UAT, backup/restore rehearsal, incident drills, final content, billing/legal, release candidate. |
| 14 | Controlled launch | Limited production cohort, daily review, rollback readiness, issue triage, decision on general availability. |

## 3. Testing strategy

The test pyramid is deliberately practical. Domain rules and authorization receive the largest unit-test investment; provider calls are contract-tested and replay-tested; browser journeys cover only the highest-value flows.

### Jest unit and integration suites

Use Jest for command/query modules, validation, state reducers, role authorization, RLS-facing repository behavior, provider adapters, idempotency, consent filtering, branding snapshots, import parsing, offline queue conflict handling, and error classification. Each foundation domain should have tests for happy path, validation failure, authorization failure, retry, duplicate request, and partial provider failure.

Minimum foundation Jest suites include:

| Suite | Required tests |
|---|---|
| Auth/tenancy | Membership removal, workspace switching, role denial, invitation expiry, slug collision. |
| Scheduling | Conflict, timezone/DST, cancellation, reschedule, concurrent booking. |
| Work orders | Valid status transitions, invalid transition, assignment, completion requirements, duplicate command. |
| Fleet | Request approval, contract association, dispatch reassignment, cross-workspace reference rejection. |
| Payments | Duplicate webhook, signature failure, timeout after success, refund state, manual payment audit. |
| Marketing | Consent, suppression, unsubscribe, deleted customer, last-second audience recheck. |
| Branding | Invalid logo, signed URL expiry, fallback, immutable invoice/email snapshot. |
| Offline | Draft persistence, replay order, conflict, network recovery, false-success prevention. |

### Browser E2E

Use Playwright for cross-browser journeys: onboarding, office booking, appointment conversion, dispatcher assignment, technician completion, fleet approval, payment-link return, and marketing suppression. Run Chromium on every pull request and Chromium/WebKit/Firefox nightly or before release. Seed a deterministic test tenant and reset it per test file.

### Security and privacy testing

Run automated RLS tests with at least two workspaces and multiple roles. Attempt direct object-ID substitution, relationship traversal, unauthorized RPC invocation, stale membership use, and webhook replay. Run dependency audit and secret scanning in CI. Validate that logs and telemetry do not contain test PII patterns.

### Performance budgets

The initial authenticated shell should become interactive within a defined budget on a representative mobile connection. Large pages must use route-level code splitting. The current preserved build includes large map, spreadsheet, voice, and reporting chunks; these should be deferred or split before broad launch.

## 4. Go-live checklist

### Product readiness

All foundation acceptance tests pass; pilot users complete the five critical journeys; role-specific views have reviewed copy; empty/error/offline states exist; customer-facing messages and legal pages are approved; support escalation and data-export procedures are documented.

### Data and infrastructure readiness

Production and staging Supabase projects are separate. Migrations are versioned and rehearsed on a clean project. Backups and restore procedures are tested. Storage buckets have explicit policies. Secrets are stored in Vercel/Supabase secret configuration, not the repository. Cron and queues have alerting and retry limits. Domains, email authentication, SMS sender, payment webhooks, OAuth redirect URLs, and webhook signatures are verified in production-like staging.

### Security readiness

RLS tests pass. Security-definer functions have fixed search paths and explicit authorization. Admin routes require server-side role checks. Rate limits exist on auth, public booking, upload, search, webhooks, and marketing sends. PII is redacted from logs. A dependency audit and lightweight threat model are complete.

### Launch controls

Release behind feature flags. Start with one internal workspace, then two to five pilot workspaces. Maintain a rollback plan for frontend deployment, migrations, provider adapters, and feature flags. Do not roll back a database migration destructively during an incident; use a forward fix or application rollback compatible with the current schema.

### Operational metrics

Monitor API error rate, 401/403 rate, RLS denial anomalies, queue age, webhook failures, payment reconciliation lag, email/SMS bounce and complaint rates, sync degradation, browser errors, page performance, and technician completion latency.

## 5. Budget controls

The team should prioritize capabilities that compound: tenancy, work orders, technician workflow, fleet dispatch, payments, and reliable notifications. Buy commodity infrastructure rather than build it. Delay proprietary vehicle data, advanced AI, route optimization, and multi-provider parity until pilot usage proves demand. Keep integrations behind adapters so a low-cost provider can be replaced without changing core tables or UI.
