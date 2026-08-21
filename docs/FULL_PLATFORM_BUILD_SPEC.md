# ServiceWriterFinal Full Platform Build Specification

**Status:** Greenfield full-product specification

**Important scope statement:** This document defines the complete product. Delivery phases are sequencing and risk controls; they do not define a reduced product boundary. All domains below are part of the intended platform.

## 1. Complete product boundary

ServiceWriterFinal is a unified operating system for automotive service businesses and managed fleets. The full product includes a public web experience, authenticated shop workspace, fleet operations workspace, technician application, customer portal, administrative control plane, integration platform, communications system, marketing system, analytics/reporting layer, offline synchronization, AI assistance, import/export, subscription/billing, and production operations.

The product must be designed as one coherent system rather than a collection of modules. A customer, vehicle, fleet account, appointment, request, work order, inspection, quote, invoice, payment, message, campaign, and integration event must be linked through a common activity model and workspace security model.

## 2. Full domain map

| Domain | Full capability set | Primary users |
|---|---|---|
| Identity and tenancy | Signup, login, MFA-ready sessions, workspace creation, invitations, role/capability management, multiple workspaces, location scopes, impersonation with audit, account recovery, SSO-ready boundary | Owner, admin, all staff |
| Branding and workspace configuration | Business identity, logo, colors, terminology, tax, currency, timezone, hours, locations, document templates, customer-facing settings, email sender, legal footer | Owner, admin |
| CRM | Customer profiles, household/company accounts, contacts, deduplication, tags, segmentation, consent, notes, timeline, portal access, import/export, GDPR actions | Office, marketing, customer |
| Vehicle management | Vehicle identity, VIN, plate, ownership, mileage, specifications, service history, maintenance schedule, photos, documents, fleet association, enrichment providers | Office, technician, fleet |
| Catalog and pricing | Services, packages, labor, parts, filters, fluid specifications, price books, taxes, fees, discounts, coupons, estimates, location-specific pricing, effective dates | Owner, office |
| Scheduling | Appointment requests, availability, resources, bays, technicians, locations, business hours, blackout dates, reminders, rescheduling, waitlist, recurring maintenance | Office, dispatcher, customer |
| Shop workflow | Intake, check-in, work orders, diagnosis, labor, parts, approvals, inspections, attachments, internal notes, customer notes, status timeline, quality control, completion | Office, technician |
| Fleet OS | Fleet clients, contacts, vehicles, sites, contracts, service-level rules, purchase orders, request intake, approvals, batch jobs, recurring work, dispatch, billing, fleet reporting | Fleet manager, dispatcher |
| Dispatch | Board, calendar, workload, assignment, route context, travel, en-route/on-site states, reassignment, blockers, escalation, technician capacity, saved views | Dispatcher, office |
| Technician App | Today, job detail, offline drafts, job status, time clock, checklists, inspections, media capture, parts, messages, signatures, customer handoff, shift review, safety prompts | Technician |
| Inspections | Templates, sections, pass/fail/advisory/severity, required evidence, photos/video, customer presentation, approval recommendations, reinspection, PDF/report output | Technician, office, customer |
| Inventory and procurement | Parts catalog, suppliers, stock levels, bins, reservations, receiving, adjustments, purchase orders, transfers, substitutions, barcode/UPC scanning, reorder points, cost history | Office, parts, owner |
| Quotes and approvals | Quote builder, estimate versions, package pricing, approval links, partial approvals, declined services, expiration, authorization evidence, audit | Office, customer, fleet |
| Billing and payments | Invoices, line items, taxes, credits, deposits, manual payments, hosted payment links, refunds, surcharges, statements, fleet billing, reconciliation, exports | Office, owner, customer |
| Communications | Email, SMS, in-app messaging, job threads, templates, delivery status, replies, consent, suppression, attachments, transactional/marketing separation | All roles |
| Marketing and retention | Segments, campaigns, automations, reminders, service-due rules, coupons, referral/loyalty, reviews, campaign approvals, delivery analytics, suppression | Marketing, owner |
| Reporting and analytics | Revenue, ARO, conversion, utilization, cycle time, technician productivity, fleet downtime, inventory turns, campaign performance, payments, exceptions, custom reports, exports | Owner, manager, fleet |
| Integrations | Payments, accounting, calendar, email, SMS, maps, vehicle data, CARFAX-like history, analytics, error tracking, API keys, webhooks, health/reconciliation | Admin, owner |
| AI and voice | Workspace search, summaries, draft notes, suggested next actions, inspection summaries, voice capture/transcription, campaign drafting, report explanations, tool confirmation | All authorized users |
| Admin and platform | Plans, usage, feature flags, support tools, audit, rate limits, job queues, provider health, incident controls, tenant controls, data export/delete, abuse prevention | Platform admin |
| Data operations | CSV/XLSX import, staging, mapping, dedupe, validation, preview, commit, rollback strategy, export, archive, migration support | Owner, admin |
| Offline and sync | Local draft store, outbox, retries, conflict resolution, attachment queue, connectivity state, sync receipts, safe command classification | Technician, dispatcher |
| Subscription platform | Trials, plans, entitlements, invoices to platform customer, usage metering, grace periods, cancellation, workspace suspension, billing portal | Owner, platform admin |

## 3. Full role and capability model

Use role presets for simplicity and capability checks for precision. Presets include platform admin, workspace owner, workspace admin, manager, service advisor, dispatcher, fleet manager, technician, parts/inventory, marketer, accountant, receptionist, customer/fleet contact, and read-only viewer. Capabilities are scoped by workspace and optionally location, fleet client, or assigned job.

A user may have multiple capabilities but the UI should expose a role-oriented default view. Authorization is enforced in the API and database. The client is never the source of truth.

## 4. Full workflow state model

Every high-value object has a documented finite-state machine. Work orders support draft, scheduled, assigned, in progress, waiting for parts, awaiting approval, quality review, completed, cancelled, and archived. Fleet service requests add new, triaged, quoted, approved, scheduled, dispatched, in progress, completed, declined, and cancelled. Payments support pending, authorized, succeeded, failed, refunded, and disputed. Integration connections support pending, connected, degraded, revoked, and error.

Transitions must be explicit, role-checked, idempotent, auditable, and reversible where business rules permit. Every transition produces an activity event with actor, source, reason, before/after values, and correlation ID.

## 5. Full API surface

The initial Next.js route bridge should grow into these versioned route groups:

| Route group | Representative endpoints |
|---|---|
| `/api/v1/auth` | session, invite, accept-invite, password, MFA enrollment, logout |
| `/api/v1/workspaces` | list, create, update, members, roles, locations, branding, settings |
| `/api/v1/customers` | search, CRUD, merge, timeline, consent, portal access, export/delete |
| `/api/v1/vehicles` | search, CRUD, history, enrichment, maintenance, documents |
| `/api/v1/catalog` | services, packages, price books, taxes, coupons, filters, suppliers |
| `/api/v1/appointments` | availability, CRUD, conflict check, reminders, waitlist, convert |
| `/api/v1/work-orders` | CRUD, lifecycle transition, assignment, items, approvals, media, events |
| `/api/v1/inspections` | templates, start, results, media, publish, report |
| `/api/v1/fleet` | clients, contacts, contracts, sites, requests, approvals, batch jobs |
| `/api/v1/dispatch` | board, assignments, routes, capacity, exceptions, saved views |
| `/api/v1/technician` | today, start, arrive, checklist, time, notes, completion, sync |
| `/api/v1/inventory` | items, stock, reservations, POs, receiving, adjustments, barcode |
| `/api/v1/quotes` | CRUD, send, approve, decline, convert, versions |
| `/api/v1/invoices` | CRUD, issue, send, statement, payment link, refund, reconcile |
| `/api/v1/payments` | providers, intents, links, webhook receipt, refunds, reconciliation |
| `/api/v1/messages` | threads, messages, templates, delivery, replies, attachments |
| `/api/v1/marketing` | consent, segments, campaigns, approvals, send, metrics, suppression |
| `/api/v1/reports` | standard reports, filters, exports, saved reports, dashboards |
| `/api/v1/integrations` | connections, OAuth, health, sync, retry, webhook logs |
| `/api/v1/ai` | search, summarize, draft, transcribe, tool preview, confirmation |
| `/api/v1/imports` | upload, map, validate, preview, commit, error report, rollback marker |
| `/api/v1/admin` | tenants, plans, usage, support, flags, incidents, audit |

## 6. Full data and event architecture

The database is the source of operational truth. An outbox/event table records durable domain events. Workers consume events for notifications, provider synchronization, analytics projections, documents, and marketing. Commands are idempotent and produce an operation record. Webhooks enter through a verified, deduplicated inbox before changing domain state.

Long-running work must be asynchronous. The API returns an operation ID and current state rather than holding a request open for provider calls, media processing, report generation, transcription, or bulk import.

## 7. Full nonfunctional requirements

The platform must support strict tenant isolation, encrypted transport, secret separation, auditability, rate limits, abuse protection, backups, restore tests, error budgets, accessibility, responsive layouts, safe offline behavior, localization-ready dates/currency, and observability. A complete security review includes RLS, API authorization, storage policies, signed URL lifetime, webhook verification, OAuth state/PKCE, secret rotation, dependency scanning, PII logging review, and incident response.

The platform must be deployable on Vercel for web/API workloads while allowing a separate worker runtime for durable background jobs. It must not assume a single permanently running process. Supabase is the default persistence platform, but provider interfaces must avoid irreversible lock-in.

## 8. Full build sequence

Delivery sequencing is organized into foundations, core operations, field/fleet depth, commercial systems, intelligence/integrations, and platform scale. A domain is not considered complete until its UI, API, database/RLS, audit events, provider behavior, empty/error/offline states, Jest tests, browser journey tests, documentation, and operational metrics exist.

## 9. Definition of done for the full platform

The full platform is complete only when every domain in this specification has an implemented user journey, role matrix, database model, API contract, RLS coverage, audit events, event/retry behavior, import/export behavior where applicable, accessibility review, Jest suite, browser E2E suite, observability, support documentation, and production runbook. “Feature visible in the UI” is not completion.
