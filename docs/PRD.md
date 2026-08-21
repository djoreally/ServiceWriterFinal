# ServiceWriterFinal Full-Platform Product Requirements Document

**Document status:** Draft for implementation

**Product:** ServiceWriterFinal, working name subject to rebrand

**Primary users:** Independent automotive repair shops, mobile service operators, fleet managers, dispatchers, office staff, technicians, and vehicle-owning customers

**Primary competitors:** Shopmonkey, Droptop, and the adjacent Jobber/Housecall Pro workflow category

## 1. Executive summary

ServiceWriterFinal is a multi-tenant operations platform for automotive shops and service fleets. It combines a shop management system, fleet operations workspace, technician application, customer portal, scheduling, dispatch, work orders, inspections, quotes, invoicing, payments, communications, and lightweight marketing automation.

The product should not attempt to outspend Shopmonkey on breadth or to reproduce every accounting, catalog, and telematics integration in the first release. Its advantage should be **operational clarity**: the right next action, the right owner, the right vehicle, and the right customer context visible without forcing users to manage a complex project-management system. The desired experience is the power of Monday.com, Jobber, and Housecall Pro without their cognitive load for automotive work.

The preserved frontend already contains the visual language and a broad product surface. The greenfield rebuild will retain that UI as the interaction reference while replacing the legacy backend with a clean Next.js API layer, Express-compatible domain services where appropriate, Supabase Auth/Postgres/Storage/Realtime, and a small set of reliable third-party adapters.

## 2. Product thesis

> Automotive service teams do not need more software surfaces; they need fewer decisions per job.

Every major screen should answer four questions immediately:

| Question | Product behavior |
|---|---|
| What needs attention? | Prioritized work queue, exceptions, overdue approvals, failed syncs, and customer replies. |
| Who owns it? | Explicit owner, technician, dispatcher, or office assignee on every actionable item. |
| What is the next action? | A single primary CTA with secondary actions progressively disclosed. |
| What context prevents rework? | Customer, vehicle, location, job history, parts, authorization, and communication history in one context panel. |

## 3. Full-platform goals and delivery sequencing

### Full-platform goals

The complete platform must support a shop or fleet operator onboarding a workspace, inviting staff, configuring services and locations, creating customer and vehicle records, booking appointments, converting appointments into work orders, assigning technicians, documenting inspection results and media, generating quotes and invoices, collecting payments, communicating status, and reporting on job throughput.

Fleet users must be able to manage fleet clients, vehicles, locations, contracts, service requests, dispatch assignments, purchase-order references, and approval states. Technicians must be able to use a mobile-first workflow for today’s jobs, arrival/departure, notes, checklists, media, time, parts, customer communication, and completion.

The platform must provide strict workspace isolation, auditability, safe handling of customer and employee PII, an export/delete workflow, reliable retries for external calls, and a practical migration path from CSV exports.

### Sequencing boundaries, not permanent non-goals

The first delivery sequence will defer a full accounting ledger, a proprietary parts catalog, live GPS telematics, payroll, advanced route optimization, a marketplace, a custom payment processor, or a generalized Monday.com clone. It will provide integration seams and import/export contracts for these capabilities.

## 4. Target personas

| Persona | Primary job to be done | Success measure |
|---|---|---|
| Shop owner | Know whether the operation is profitable and under control | Can see today’s bottlenecks, unpaid work, and staff workload in under two minutes. |
| Service advisor/front desk | Move a customer from request to authorized job | Creates a clean appointment/work order without duplicate entry. |
| Dispatcher | Keep mobile and fleet work moving | Sees unassigned, late, blocked, and en-route jobs in one board. |
| Technician | Complete work correctly with minimal typing | Opens the next job, sees context, records evidence, and closes the job from a phone. |
| Fleet manager | Control downtime and approval flow | Tracks requests, vehicles, locations, approvals, contracts, and service history. |
| Customer/fleet contact | Understand status and approve/pay quickly | Receives clear links and completes approval/payment without an account if permitted. |
| Marketing/office operator | Bring back customers without violating trust | Runs permissioned, segmented campaigns with suppression and consent visibility. |

## 5. Full platform scope and delivery priority

| Priority | Domain | Full-platform outcome |
|---|---|---|
| Foundation | Identity and tenancy | Authenticated users, workspace creation, invitations, roles, workspace isolation, audit events. |
| Foundation | Customers and vehicles | Searchable records, deduplication hints, ownership, history links. |
| Foundation | Catalog and locations | Services, packages, pricing, operating locations, business hours. |
| Foundation | Appointments and work orders | Booking, calendar/list view, status lifecycle, assignment, notes, customer/vehicle context. |
| Foundation | Technician workflow | Today view, job detail, checklist, media, status, time, completion. |
| Foundation | Fleet OS | Fleet clients, vehicles, sites, service requests, contracts, dispatch, approvals. |
| Foundation | Quotes, invoices, payments | Draft/send/approve, invoice, payment link, manual payment, reconciliation status. |
| Foundation | Notifications | Transactional email and SMS abstraction with templates, consent, retries, and event log. |
| Expansion | Inspections and media | Configurable inspection templates, results, photos, customer presentation. |
| Expansion | Inventory and purchase orders | Parts catalog, reservations, low-stock alerts, PO references. |
| Expansion | Calendar and accounting adapters | Google Calendar and QuickBooks sync with reconciliation pages. |
| Expansion | Basic retention marketing | Segments, campaigns, suppression, consent, delivery metrics. |
| Advanced | AI assistant | Search and summarize workspace data; never perform high-risk actions without confirmation. |
| Advanced | Advanced routing and telematics | Route suggestions, GPS, vehicle data, and optimization after operational data quality is proven. |

## 6. Core workflow requirements

### 6.1 Appointment to completed job

A customer request becomes an appointment with a customer, vehicle, location, service, source, and desired time. Staff may confirm, reschedule, cancel, or convert the appointment to a work order. A work order must have a visible status, priority, owner, and next action. A technician may start work only when the job is assigned or explicitly overridden by a permitted staff member. Completion requires a completion summary, required checklist fields, and an authorization/payment state appropriate to the workspace policy.

### 6.2 Fleet request to dispatch

A fleet contact or internal user submits a service request for a fleet vehicle. Staff triages it, attaches location and contract context, requests approval if needed, schedules it, assigns a technician or crew, and tracks the job through completion. The fleet timeline must show request, approval, dispatch, work, parts, invoice, and customer communication events without forcing the user to open several modules.

### 6.3 Technician day

The technician lands on Today, not a generic dashboard. The screen shows the next three jobs, travel/location cues, blockers, messages, and required actions. The technician can start a job, view customer/vehicle history, capture media, complete inspection items, add notes, record time/parts, request approval, mark blocked, and complete. Offline behavior must queue safe draft actions and show sync state; it must never silently report a payment or approval as completed while offline.

### 6.4 Office/dispatch board

The board is a focused operational queue rather than an unconstrained kanban. Columns represent meaningful states such as Unassigned, Scheduled, En Route, On Site, In Progress, Waiting, Awaiting Approval, and Completed. Users may filter by location, technician, fleet client, date, priority, and blocker. Drag-and-drop is permitted only when the user can understand the side effect and the action is reversible.

## 7. UX principles: Monday.com power without cognitive load

The interface must use progressive disclosure, role-specific defaults, one primary action per screen, saved views, keyboard shortcuts for power users, compact cards, clear status language, and visible system feedback. The platform should avoid exposing every database field. Advanced fields appear in a context drawer, not in the default workflow.

Use a shared interaction grammar: **status chip, owner chip, due/time indicator, blocker indicator, next-action button, context drawer, activity timeline**. A user should be able to understand a job card in under five seconds. Every destructive or externally visible action requires an explicit confirmation or undo window.

## 8. Success metrics

| Metric | MVP target |
|---|---:|
| New workspace setup to first appointment | Under 30 minutes with guided onboarding |
| Appointment creation completion rate | At least 90% of started flows |
| Appointment-to-work-order conversion | At least 95% without duplicate data entry |
| Technician job start latency | Under 30 seconds from opening Today |
| Work-order completion with required evidence | At least 90% |
| Unassigned jobs at start of day | Under 5% |
| Payment-link completion | Track by provider and workspace; establish baseline in pilot |
| Support tickets caused by unclear state | Declining weekly during pilot |
| PII incidents | Zero confirmed incidents |

## 9. Rebranding and business identity

Brand identity must be tenant-configurable but governed by a platform-level design system. Workspace owners can upload a logo, select an accent color within contrast constraints, set business name, address, phone, currency, timezone, invoice footer, email sender name, and customer-facing terminology.

The upload flow must validate file type and size, strip metadata where feasible, generate safe display variants, store originals in private storage, and expose signed URLs only when needed. A failed upload must not replace a working logo. Customer-facing email, PDF, portal, and payment-link views must use a versioned branding snapshot so historical documents do not unexpectedly change when a logo is replaced.

## 10. Edge cases and acceptance rules

| Area | Edge case | Required behavior |
|---|---|---|
| Tenancy | User belongs to multiple workspaces | Workspace context is explicit and never inferred from stale local state. |
| Tenancy | Membership removed during active session | API returns a typed authorization error; cached tenant data is cleared. |
| Scheduling | Two staff book the same resource | Server-side conflict check wins; UI offers alternate slot. |
| Scheduling | Daylight-saving transition | Store UTC timestamps plus workspace timezone; render local time with offset where ambiguity exists. |
| Fleet | Vehicle has no VIN | Use an internal vehicle identifier and mark VIN enrichment as optional. |
| Fleet | Same vehicle appears under two fleet clients | Permit only with explicit ownership/relationship model; surface possible duplicate. |
| Technician | Offline completion | Save local draft, show pending sync, prevent false payment/approval success. |
| Payments | Provider webhook arrives twice | Idempotency key and event ledger produce one financial state transition. |
| Payments | Payment succeeds but browser times out | Reconcile through provider event and show pending reconciliation, never ask for blind retry. |
| Media | Technician uploads a large/unsupported file | Client validates early; server revalidates; resumable upload or clear retry. |
| Notifications | Customer opted out of SMS | Suppress marketing and non-critical messages; permit legally required transactional notices where policy allows. |
| Marketing | Campaign includes a deleted customer | Exclude at send time and record exclusion reason. |
| Integrations | OAuth token expires | Mark connection degraded, queue retry, notify authorized admin, never expose token. |
| Imports | CSV contains duplicates or malformed dates | Stage import, report row-level errors, require confirmation before commit. |
| Security | User manipulates workspace ID | RLS and server authorization reject access; do not rely on hidden UI fields. |
| Branding | Logo is deleted while a PDF is rendering | Use immutable branding snapshot or fallback logo. |
| AI | Prompt asks to send or refund | Require explicit confirmation and permission check; AI cannot directly perform high-risk side effects. |

## 11. Privacy and marketing requirements

Marketing features require consent state, source, timestamp, policy version, channel, suppression reason, and lawful-purpose metadata. Store consent events append-only. Every campaign audience query must apply workspace scope, consent/suppression filters, bounce/complaint exclusions, and a last-second eligibility check before send.

PII should be minimized in analytics. PostHog/Sentry-style telemetry must mask customer names, emails, phone numbers, addresses, payment data, VINs where practical, and free-text notes. Logs must use correlation IDs and redacted structured fields. Export and deletion requests must be auditable and must distinguish records legally required for financial retention from records eligible for deletion or anonymization.

## 12. Competitive strategy

Shopmonkey competes with a broad all-in-one shop platform covering workflow, communication, multi-shop operations, estimates, invoices, payments, inspections, marketing, and reporting; its public pricing page lists monthly tiers beginning around $239 for the entry plan at the time of research [1] [2]. Droptop emphasizes fast-lube and service operations with quoting, invoicing, scheduling, dispatch, fleet management, dashboards, time clocks, VIN/barcode workflows, vehicle data, QuickBooks, payments, and a REST API/webhooks offering [3] [4].

ServiceWriterFinal should not compete feature-for-feature initially. It should win on a lower-complexity workflow, a better fleet/mobile experience for small operators, transparent integration boundaries, flexible deployment economics, and the ability to connect shop, fleet, and technician work without forcing separate products. Jobber and Housecall Pro should be treated as UX references for field-service simplicity, not as targets for immediate feature parity.

## References

[1]: https://www.shopmonkey.io/ — Shopmonkey product positioning and capabilities.

[2]: https://www.shopmonkey.io/pricing — Shopmonkey public pricing and plan comparison.

[3]: https://www.droptop.io/ — Droptop product capabilities and service-operations positioning.

[4]: https://www.droptop.io/pricing — Droptop public feature, API, webhook, and pricing information.
