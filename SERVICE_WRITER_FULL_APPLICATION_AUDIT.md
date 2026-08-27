# Service Writer Full Application Audit

**Prepared by:** Manus AI  
**Audit date:** 27 August 2026  
**Repository:** `djoreally/ServiceWriterFinal`  
**Audit type:** Architecture, product-purpose, application-surface, database, authorization, privacy/PII, security, resilience, and SOC 2 readiness review  
**Assessment posture:** Evidence-based design and implementation review; not a formal SOC 2 attestation, penetration test, legal privacy opinion, or independent auditor report.

## Executive conclusion

Service Writer is implemented as a multi-tenant service-operations platform whose functional center is the complete customer-to-service lifecycle: public booking, customer and vehicle records, appointments, dispatch and technician execution, work orders and service records, quotes, invoices, payments, messaging, CRM automation, fleet workflows, notifications, and operational reporting. The repository contains a very broad product surface: one catch-all Next.js page router, 167 legacy page components, 46 API route handlers, 67 live public-schema tables, a large command/query layer, and 545 test files or test-like artifacts by repository count.

The product purpose is coherent at the domain level, but the implementation is in a **hybrid and partially converged state**. The current application contains overlapping legacy and newer domain surfaces, migration/live-schema drift, broad role names in policies, public booking RPCs, and many production database objects that are not represented by the current migration count. The system is operationally functional and the current repository passes TypeScript, production build, and its full Jest suite, but it is **not ready to claim SOC 2 readiness without remediation and evidence collection**.

The most important risks are authorization-boundary risk around `SECURITY DEFINER` RPCs callable by anonymous or authenticated roles, inconsistent or insufficiently demonstrable tenant and role enforcement in RLS policies, disabled leaked-password protection, the absence of production storage buckets and storage policies despite an application asset surface, extensive PII and sensitive operational data without an evidenced retention/deletion program, and substantial database performance debt. These findings do not prove a successful exploit; they identify control conditions that require remediation and adversarial testing.

| Overall area | Assessment | Basis |
|---|---:|---|
| Intended product purpose | **Defined but overextended** | Strong service-operations core with CRM, fleet, marketing, subscription, and legacy/public content surfaces that increase complexity and control scope |
| Build and code health | **Pass with warnings** | TypeScript and production build pass; lint has 25 warnings, mostly `any` usage |
| Automated behavior coverage | **Pass with limits** | 115 suites passed, 582 tests passed; one suite and three tests skipped |
| Database architecture | **Needs hardening** | 67 live tables, broad relational model, all live public tables report RLS enabled, but migration/live drift is material |
| RPC security | **High risk** | Multiple public `SECURITY DEFINER` functions are executable by `anon` and `authenticated` roles |
| RLS and tenant isolation | **Needs independent verification** | Policies exist broadly, but many are permissive and role-generic; predicate bodies were not fully evidenced in the compact policy query |
| PII/privacy | **Needs formal program** | Customer identity, contact, address, vehicle identifiers, notes, consent, messaging, inbound content, and integration data are present |
| Storage | **Incomplete/unknown** | No production buckets or storage policies were returned; application references asset URLs and logo/image fields |
| SOC 2 readiness | **Not ready to claim** | Technical foundations exist, but governance, evidence, access reviews, incident, vendor, retention, recovery, and change-management evidence are incomplete or unverified |

## 1. Scope and methodology

The review covered the checked-out repository, application routes and page components, navigation and feature declarations, server API helpers, commands and queries, database migrations, live Supabase metadata, RLS policy inventory, database functions and ACLs, triggers, storage buckets and storage policies, public booking and webhook boundaries, test/build/lint results, and relevant production notification endpoints already verified in the preceding repair work.

The live Supabase project queried was `rjfbrfognxqkyhdrpibx`, reported as active and healthy on PostgreSQL 17.6.1 in `us-west-2`. The audit used read-only metadata and advisor queries. No source code, database record, policy, secret, or production configuration was changed as part of this audit.

The control framing uses the AICPA Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy [1], NIST Cybersecurity Framework 2.0 for cybersecurity risk management [2], and OWASP ASVS 5.0.0 as an application-security verification baseline [3].

## 2. Intended purpose assessment

The intended purpose of Service Writer is to provide a workspace-based operating system for service businesses and their field or shop teams. A business can publish booking availability and services, receive customer requests, maintain customer and vehicle records, schedule and assign work, execute service using technician workflows, document the service, prepare quotes and invoices, accept or reconcile payments, communicate through email/SMS/in-app channels, and analyze or automate follow-up activity.

The platform also contains a second operating model for fleet clients. Fleet clients, contacts, contracts, service requests, dispatch assignments, and fleet invoices are represented as first-class domains. A CRM and marketing automation layer adds leads, profiles, activities, tasks, segments, campaigns, campaign members, messaging consents, suppressions, loyalty accounts, and ledger entries. Google Calendar synchronization, provider connections, webhooks, account import, subscriptions, public booking, and PWA push expand the integration and compliance surface.

The product purpose is therefore best stated as follows:

> **Service Writer is a multi-tenant service-business operating platform that coordinates customer intake, scheduling, dispatch, technician execution, service documentation, quoting, invoicing, payment, communication, fleet operations, and relationship automation.**

That purpose is credible, but the current screen inventory indicates a substantial legacy marketing/content and alternative-product surface. The business should formally decide which modules are contractual product scope and which are deprecated, experimental, or administrative-only. Every retained module must have an owner, data classification, authorization model, availability target, and lifecycle status.

## 3. Complete application-surface inventory

The repository has one Next.js catch-all page route (`app/[[...path]]/page.tsx`) and 167 legacy page components. This means route behavior is substantially composed through a client-side or legacy page registry rather than being represented as 167 independent Next.js filesystem routes. The inventory includes customer, staff, technician, admin, public, marketing, and integration surfaces.

| Surface family | Representative screens/components | Intended purpose |
|---|---|---|
| Core operations | Dashboard, Operations, CommandCenter, Appointments, AppointmentDetail, DispatchEngine, DispatcherDashboard | Schedule, coordinate, and monitor service work |
| Technician/field | FieldCompanion, TechnicianOS, TeamDashboard, Team OS navigation, WorkforceAuth | Technician identity, assigned work, execution, offline/field workflows |
| Customer/CRM | Customers, CustomerDetail, CRM, Messages, CustomerDashboard, CustomerMessagingPreferences | Manage customer records, interactions, communication preferences, and history |
| Vehicles/service | Vehicles, VehicleDetail, VehicleSpecs, Fleet, ServiceCatalog, ServiceDetail, ServicePackages, TirePricing, DetailingPricing | Maintain vehicle data, service offerings, pricing, and specifications |
| Financials | Quotes, Invoices, Payments, Financials, Expenses, PaymentSuccess, subscription screens | Price, bill, collect, reconcile, and report financial activity |
| Fleet | FleetManagerPortal, fleet navigation/layout components, fleet client/contract/request surfaces | Manage fleet accounts and service requests |
| Public/customer acquisition | PublicBooking, TenantBooking, BookingRedirect, FindProvider, ProviderProfile, PublicServices, PublicSubscriptions | Publish booking and service information and accept public demand |
| CRM/marketing | Marketing, RetentionEngine, AdvertisingNetwork, Newsletter, Campaign-related components, Loyalty-related tables | Run retention, campaign, loyalty, and marketing workflows |
| Administration | Settings, SessionManagement, InvitationCenter, AccountImport, AdminDashboard, AdminPlans | Configure workspaces, access, imports, and administration |
| Support/content | SupportPage, KnowledgeBase, Tutorials, TechnicalArticle, Faqs, About, ContactUs, Blog, WhatsNew | Provide support, education, and public content |
| Integrations | GoogleCalendarCallback, AgentIntegrations, OAuthConsent, webhooks, provider connections | Connect external systems and ingest delivery events |

The repository reports 1,484 `onClick` occurrences, 33 form occurrences, and 253 server-action-like declarations by a simple static scan. These counts are indicators of interaction density, not proof that every control has a distinct business action or that all actions are covered by end-to-end tests. The audit recommends generating a machine-readable control catalog from the component tree, including button label, route/action, required role, validation schema, mutation target, audit event, notification side effect, and test ID.

## 4. API and integration inventory

There are 46 route handlers. The primary families are appointments and appointment items, CRM, customers, dispatch, identity and health, imports, invitations, invoices, payments, public booking, quotes, service catalog, service records, vehicles, webhooks, work orders, work-order checklist, workspaces, lifecycle outbox processing, and notification push processing.

| API family | Security/business significance | Audit assessment |
|---|---|---|
| `/api/v1/public-booking/*` | Anonymous customer acquisition, profile/catalog/availability/confirmation, consent capture | Requires strict RPC privilege review, rate limiting, abuse controls, anti-enumeration, and privacy minimization |
| `/api/v1/webhooks/*` | Provider callbacks and inbound customer messages | Signature verification is present in the route flow; replay, timestamp, payload-size, and provider-specific verification should be independently tested |
| `/api/internal/*outbox` | Email/lifecycle and PWA push workers | Protected worker pattern exists; verify secret rotation, replay protection, lock recovery, and monitoring |
| `/api/v1/customers`, `/vehicles`, `/appointments` | Core PII and operational mutations | Uses workspace helper in inspected routes; require systematic cross-tenant negative tests |
| `/api/v1/quotes`, `/invoices`, `/payments` | Financial and customer-impacting mutations | Role checks and Zod validation are visible in inspected code; strengthen segregation of duties and immutable financial audit trail |
| `/api/v1/dispatch*`, `/work-orders*`, `/service-records*` | Technician and operational execution | Requires assignment-aware tests, field/offline conflict handling, and least-privilege review |
| `/api/v1/imports*` | Bulk data ingestion and possible mass mutation | Requires file/content controls, import authorization, rollback guarantees, rate limits, and detailed audit evidence |
| `/api/v1/health` | Operational monitoring | Confirm that health responses do not disclose topology, dependency details, or tenant data |

## 5. Live database inventory and data model

The live public schema contains 67 tables. All 67 reported RLS enabled. The model is relational and generally organized around workspace ownership, user identity, customers, vehicles, service execution, finance, messaging, CRM, fleet, integrations, and audit/outbox concerns.

| Domain | Live tables | Sensitive data and control implications |
|---|---|---|
| Identity and tenancy | `profiles`, `workspaces`, `workspace_members`, `customer_users`, `user_roles`, `invitations`, invitation events/attempts | User identity, membership, role, invitation tokens, tenant boundaries |
| Customer and vehicle | `customers`, `vehicles`, `vehicle_service_specs`, `service_records` | Names, email, phone, addresses, VIN, license plate, mileage, diagnosis, work performed, internal notes |
| Scheduling and operations | `locations`, `appointments`, `appointment_items`, `work_orders`, assignments, events, `dispatch_events` | Customer location, appointment notes, staff assignments, operational status and history |
| Quotes and finance | `quotes`, `quote_items`, `quote_conversions`, `invoices`, `invoice_lines`, `payments` | Financial amounts, payment-provider identifiers, billing status, customer linkage |
| Fleet | Fleet clients, contacts, contracts, requests, dispatch assignments | Business contacts, billing information, contracts, external references, service schedules |
| Messaging | Templates, consents, suppressions, logs, delivery events, inbound messages | Contact details, message bodies, consent evidence, provider payloads, inbound customer content |
| CRM and marketing | Profiles, leads, activities, tasks, segments, campaigns, members, loyalty accounts/ledger, CRM audit events | Prospect/customer PII, behavioral history, segmentation, campaigns, loyalty balances |
| Integrations and audit | Provider connections, webhook events, audit events, Google Calendar tokens/events | External account identifiers, encrypted calendar tokens, webhook payloads, audit metadata |
| Imports and settings | Import batches/records/mappings, workspace settings, catalog/settings | Source files and hashes, address/contact settings, terms, tax/pricing, operational configuration |
| Notifications and delivery | Lifecycle outbox, in-app notifications, push subscriptions, push outbox | Notification contents, push endpoint keys, user/workspace linkage, retry/error history |
| Legacy/unclear ownership | `inventory_items`, `subscription_plans`, `abandoned_bookings` | Some use `user_id` rather than `workspace_id`; this is a tenant-model consistency risk requiring explicit ownership rules |

The live data set is small but nontrivial: 186 customers, 224 vehicles, 201 appointments, 156 service records, 18 payments, 35 appointment items, 24 vehicle service specs, and other active records were reported. Small row counts do not reduce the sensitivity of the data or the need for lifecycle controls.

### 5.1 Schema and migration drift

Repository evidence identified approximately 43 migration-defined application tables, while live production reports 67 public tables. The difference may be explained by baseline migrations, legacy objects, or migrations not present in the checked-out branch, but it must be reconciled. A SOC 2 auditor needs a deterministic answer to: which migration state produced production, which objects are authoritative, which objects are deprecated, and how schema changes are approved, reviewed, tested, and rolled back.

The 67-table live inventory also shows many tables with composite workspace-aware foreign keys, but Supabase performance advisors report a large number of uncovered foreign keys. Schema correctness and query performance should be addressed together through an authoritative migration and index plan.

## 6. RPC and database-function audit

Production function inspection found private helper functions for workspace and CRM authorization, worker-only claim/complete functions, public booking functions, financial and service lifecycle functions, and multiple legacy/compatibility functions. The strongest finding is that several public functions are `SECURITY DEFINER` and ACL-executable by `anon` and `authenticated`.

| Finding | Severity | Evidence and impact |
|---|---:|---|
| Public `SECURITY DEFINER` RPCs callable by `anon` | **P0/P1** | Supabase advisor warnings cover booking, public catalog/settings, slot lookup, public blocked dates, appointment-service insertion, payment-intent recording, customer and vehicle upserts, and booking configuration. Any missing input or ownership check can cross tenant boundaries or create/modify records as the function owner. |
| Authenticated execution of privileged `SECURITY DEFINER` RPCs | **P1** | The same class of functions is callable by signed-in users. A valid account is not equivalent to membership in the target workspace. |
| `citext` extension and implementation functions in `public` | **P2** | Advisor reports extension-in-public and public ACLs on citext implementation functions. Move extensions to a controlled schema where feasible and remove unnecessary executable privileges. |
| Worker RPC separation | **Positive control** | Claim/complete outbox functions and enqueue functions are restricted to postgres/service role in the observed ACL output. Preserve this boundary and test that anon/authenticated calls fail. |
| Security-definer search path | **Mixed** | Inspected functions generally set `search_path` to `public` or empty; this is better than an implicit search path, but `public` remains broad. Use `search_path = ''` and fully qualified names where practical, and pin function ownership and ACLs. |
| Public booking input validation | **Positive but incomplete** | `book_appointment_safe` validates duration and nonnegative amounts, workspace availability, schedule constraints, vehicle/service ownership, and slot collision. It still requires rate limits, anti-automation controls, abuse monitoring, and independent negative testing. |
| Legacy compatibility surface | **P1/P2** | The RPC inventory contains v1/v2 and legacy-style functions. Every function must have an owner, purpose, caller matrix, deprecation date, and test coverage. |

The recommended remediation sequence is to inventory every function by identity arguments, owner, volatility, security mode, `search_path`, ACL, tables touched, caller, and expected tenant predicate; revoke default/public execute; grant only the minimum role; add explicit authorization assertions inside every security-definer mutator; and create negative tests for cross-workspace IDs, arbitrary customer IDs, arbitrary appointment IDs, arbitrary business-user IDs, and replayed requests.

## 7. RLS and authorization audit

The live query returned a broad RLS policy matrix. There are policies for most major domains, including workspace/member, customer, appointment, financial, fleet, messaging, CRM, invitation, notification, and outbox tables. However, the compact query exposed policy names and command scopes rather than complete `USING` and `WITH CHECK` expressions, so this audit does not certify predicate correctness.

The most concerning pattern is the prevalence of generic policy names such as `*_staff_all`, `*_admin_all`, `*_member_write`, and `*_owner_all` applied to `authenticated`. The name alone does not establish whether the predicate correctly checks membership, role, active status, workspace equality, customer linkage, assignment, or row ownership. The control should be treated as **partially evidenced** until every policy expression is exported, reviewed, and tested.

Specific risk areas include:

1. **Tenant confusion.** Several tables are workspace-scoped, while `inventory_items`, `subscription_plans`, and `abandoned_bookings` visibly use `user_id` ownership patterns. The application must define whether these are user-owned, workspace-owned, or legacy transitional records and prevent mixed semantics.

2. **Child-row isolation.** Tables such as invoice lines, quote items, appointment items, work-order items, service-record line items, and calendar events must be protected both directly and through their parent workspace. A child row must never be readable or writable merely because an attacker knows its UUID.

3. **Role and assignment isolation.** Technician access must be limited to assigned work or explicitly permitted operational scope. Customer access must be limited to the linked customer identity and workspace. Staff access must not automatically imply owner/admin access.

4. **Client-writable audit and delivery records.** Audit, webhook, delivery, outbox, consent, suppression, and notification tables require strong write restrictions. A client should not be able to rewrite delivery history, inject audit events, mark messages delivered, or manipulate outbox state unless the action is a controlled server-side workflow.

5. **Public booking isolation.** Anonymous RPCs must derive the target workspace from a validated slug or booking context, not trust caller-supplied business-user or workspace identifiers without a strict public-visibility check.

The audit recommends a policy test matrix with anonymous, customer, technician, receptionist, service advisor, manager, admin, owner, and service-role identities across two or more workspaces. Each test should cover SELECT, INSERT, UPDATE, DELETE, RPC, and child-row access, including negative cases and inactive memberships.

## 8. Storage and file-access audit

The live query returned no rows from `storage.buckets`, and the storage-policy query returned no rows from `pg_policies` in the `storage` schema. This means no production Supabase Storage buckets were observed at audit time. The application nevertheless contains asset-oriented fields such as `logo_url`, `avatar_url`, `image_url`, `source_file_name`, and import-related fields. It also has multiple UI surfaces that imply logos, assets, imports, or media.

This creates an architectural decision point rather than an immediate exposure finding. If the product does not use Supabase Storage, remove or formally deprecate storage-related fields and document the external asset provider. If it does use file uploads, create explicit private buckets, MIME/type and size allowlists, malware scanning, object-level tenant policies, signed URL expiration, filename normalization, retention and deletion workflows, and audit events. Never rely on a URL column alone as an authorization control.

## 9. PII, confidential data, and privacy controls

The application processes materially sensitive business and customer data. PII includes names, email addresses, phone numbers, street addresses, postal codes, customer notes, guest booking information, and contact preferences. Vehicle-related data includes VIN, license plate, plate region, mileage, vehicle specifications, and potentially location context. Sensitive operational content includes diagnosis, technician notes, internal notes, work performed, complaint narratives, inbound message bodies, webhook payloads, consent evidence, and CRM activity.

Financial data includes invoice and payment amounts, provider payment identifiers, billing contacts, contract terms, and payment status. Integration data includes encrypted Google Calendar tokens, external account identifiers, webhook events, and provider metadata. Push subscriptions include endpoint URLs and cryptographic subscription keys, which should be treated as security-sensitive even though they are not traditional PII.

| Privacy control | Current evidence | Required hardening |
|---|---|---|
| Data minimization | Some redacted message fields exist (`body_redacted`), but raw payload/body columns also exist | Define field-level necessity, redact by default, and prohibit raw provider payload retention unless justified |
| Purpose limitation | Product domains are clear, but retention and secondary CRM/marketing uses are not | Maintain a data inventory with purpose, owner, lawful basis, retention, and sharing map |
| Consent and suppression | Dedicated consent and suppression tables exist with evidence/legal-basis fields | Add immutable consent history, versioned consent text, preference-center tests, and channel-specific enforcement tests |
| Access control | RLS and workspace helpers exist | Add field-level restrictions for sensitive notes, tokens, raw payloads, and payment-provider metadata |
| Retention/deletion | Timestamps and soft-state fields exist; no evidenced policy/worker was found | Implement documented retention schedules, deletion/anonymization jobs, legal holds, and subject-request workflows |
| Data subject rights | Customer preferences and unsubscribe screens exist | Add export, correction, deletion/restriction workflows with identity verification and audit evidence |
| Secrets and tokens | Calendar tokens are named encrypted; provider connections use secret references | Verify encryption key management, rotation, access logging, and failure behavior; ensure tokens never reach clients/logs |
| Logging privacy | Error paths avoid returning internal errors to clients in inspected helper; console logging remains | Establish structured, redacted logging and a prohibition on email/phone/body/token logging |
| Cross-border/vendor controls | Resend, Twilio, Google, Stripe/provider abstractions are present | Maintain vendor register, DPAs, subprocessors, data-region analysis, and breach obligations |

The application should classify data at column level: public, internal, confidential, restricted, or secret. `metadata`, `payload`, `raw_payload`, `notes`, and `body` JSON/text fields deserve special review because they can become unbounded containers for PII and secrets.

## 10. Security assessment

### 10.1 Positive controls observed

The application uses Supabase Auth, a server-side `requireUser` helper, workspace membership checks, Zod input validation in inspected routes, generic error responses, webhook adapters with signature-verification flow, protected internal worker routes, service-role separation for worker operations, idempotency keys in lifecycle and quote-conversion flows, and a PWA push outbox with claim/complete semantics. The notification repair also added an idempotent notification model and production service worker/public-key endpoint.

The production build passed, the TypeScript check passed, and the full Jest run passed 115 suites and 582 tests. These are meaningful engineering controls, but they do not substitute for adversarial authorization, dependency, browser, and operational testing.

### 10.2 Material findings

| ID | Severity | Finding | Recommended action |
|---|---:|---|---|
| SEC-01 | **P0** | Public and authenticated roles can execute multiple `SECURITY DEFINER` RPCs that create or modify booking/customer/vehicle/payment-related data | Revoke public/authenticated execute where not strictly required; for required public booking functions, constrain inputs, derive tenant from slug/context, assert invariants, rate-limit, and add abuse tests |
| SEC-02 | **P1** | Leaked-password protection is disabled in Supabase Auth | Enable compromised-password screening and document password/MFA policy |
| SEC-03 | **P1** | RLS predicate correctness and child-row isolation are not fully evidenced | Export full expressions, review every policy, and run two-tenant role matrix tests |
| SEC-04 | **P1** | Migration/live-schema drift weakens change provenance and auditability | Reconcile production against a tagged migration baseline and prohibit unmanaged production DDL |
| SEC-05 | **P1** | Generic authenticated policies and broad `ALL` policies may exceed least privilege | Replace broad policies with capability/role/assignment-specific policies and server-side command authorization |
| SEC-06 | **P1** | Raw webhook/inbound/message payload columns create data-exfiltration and retention risk | Redact/minimize, restrict access, enforce payload-size limits, encrypt where appropriate, and set retention |
| SEC-07 | **P1** | Public booking endpoints lack evidenced rate limiting, bot defense, replay protection, and abuse telemetry | Add edge/app rate limits, idempotency, nonce or booking context binding, CAPTCHA/risk scoring where appropriate, and monitoring |
| SEC-08 | **P2** | `citext` extension in `public` and public ACLs on implementation functions | Move extension/schema where supported and revoke unnecessary execution privileges |
| SEC-09 | **P2** | 25 lint warnings, predominantly `any` in API and Supabase integration paths | Replace untyped response/mutation paths with generated or validated types, especially financial and authorization code |
| SEC-10 | **P2** | No evidence in this audit of formal dependency vulnerability scanning, SAST, DAST, secret scanning, or SBOM publication | Add these checks to CI and preserve artifacts per release |

## 11. Availability, processing integrity, and resilience

The outbox design is a good foundation. Claim functions use row locking and `skip locked`; completion functions verify worker identity; retry limits and backoff exist; notification push delivery can discard invalid subscriptions; and lifecycle email delivery has a dead-letter state. These controls support processing integrity and at-least-once delivery.

The main integrity risks are duplicate side effects across overlapping legacy/new mutation paths, concurrent updates to financial records, manual or client-visible mutation of state tables, and incomplete evidence around idempotency across all endpoints. Payment reconciliation is trigger-based, which is useful but should be supplemented by an immutable payment ledger and reconciliation reports. Invoice numbering must be tested under concurrency and rollback. Quote conversion includes idempotency fields and snapshots, but the full state machine should be formally specified.

The performance advisor reported 208 findings: 144 INFO and 64 WARN, primarily uncovered foreign keys. These are not necessarily security defects, but they can become availability and cost risks under growth. Priority indexes should cover workspace and parent foreign keys used in authorization and joins, especially appointments, quotes, invoices, service records, notification delivery, messaging, and fleet dispatch.

Required resilience evidence includes documented RTO/RPO, restore tests, point-in-time recovery validation, queue backlog alarms, dead-letter operational runbooks, provider outage behavior, rate-limit behavior, deploy rollback, and a disaster-recovery exercise.

## 12. SOC 2 readiness assessment

The AICPA Trust Services Criteria provide the framework for evaluating controls related to security, availability, processing integrity, confidentiality, and privacy [1]. On current evidence, Service Writer has useful technical mechanisms but lacks enough documented and operating evidence for a SOC 2 readiness conclusion.

| Trust Services category | Current state | Readiness gap |
|---|---|---|
| Security | **Partial** | Strong authentication/RLS foundation, but RPC privilege exposure, disabled leaked-password protection, broad policies, and missing evidence for secure SDLC, access reviews, MFA, vulnerability management, and incident response |
| Availability | **Partial** | Vercel/Supabase/outbox architecture and health route exist; RTO/RPO, restore evidence, uptime objectives, vendor dependency plans, and DR exercises are not evidenced |
| Processing integrity | **Partial** | Validation, triggers, idempotency, and tests exist; complete lifecycle specifications, reconciliation controls, segregation of duties, exception handling, and production evidence are incomplete |
| Confidentiality | **Weak-to-partial** | RLS and redacted message fields exist; field-level classification, raw payload access, retention, encryption/key management, exports, and vendor data handling require formalization |
| Privacy | **Weak-to-partial** | Consent/suppression structures exist; privacy notice alignment, data inventory, lawful-purpose mapping, rights workflows, retention/deletion, and processor governance are not evidenced |

A SOC 2 program also needs organizational controls that cannot be inferred from source code: risk assessment, policies, employee onboarding/offboarding, access reviews, security awareness, vendor management, change approvals, incident response, business continuity, evidence retention, and management review.

## 13. Priority remediation plan

### Immediate: P0, before broad customer or partner expansion

First, close or constrain all public and authenticated execution paths for `SECURITY DEFINER` RPCs. The application must have an explicit allowlist of public booking functions, with every function fully qualified, locked to a safe search path, validated against a public booking context, and covered by anonymous abuse and cross-tenant negative tests. All other privileged functions should be revoked from `anon`, `authenticated`, and `PUBLIC` as appropriate.

Second, enable Supabase leaked-password protection and confirm the authentication policy, session lifetime, refresh-token behavior, MFA posture, email enumeration resistance, and account recovery controls. Third, create a two-workspace authorization test harness that verifies every sensitive table, child table, mutation route, RPC, and role combination.

### Near term: P1, within the next hardening cycle

Reconcile live production schema to a tagged migration baseline. Export full RLS expressions and function ACLs into version-controlled review artifacts. Replace broad generic policies with explicit tenant, role, capability, assignment, and active-membership predicates. Add structured, redacted security logging and monitoring for RPC failures, cross-tenant denials, webhook signature failures, unusual public booking volume, and outbox backlog.

Define the PII register and retention schedule. Minimize raw payloads, restrict sensitive notes and provider tokens, implement verified data export/deletion workflows, and document vendor/subprocessor handling. Add public booking rate limiting, idempotency/replay controls, payload-size limits, and abuse telemetry.

### Planned: P2, within the next reliability and governance cycle

Add missing foreign-key indexes based on workload, not blindly. Reduce `any` usage in security and financial paths. Add dependency scanning, SAST, DAST, secret scanning, SBOM generation, and release artifact retention. Document RTO/RPO and perform restore/DR exercises. Create an application control catalog that maps every screen and button to authorization, data access, side effects, audit event, and test coverage. Deprecate or isolate legacy screens, routes, tables, and RPCs that are not part of the contractual product purpose.

## 14. Required evidence package for a future SOC 2 readiness review

The following evidence should be assembled and retained under controlled access: architecture and data-flow diagrams; asset and data inventories; role/capability matrix; complete RLS and RPC privilege exports; migration history and approvals; CI build/test/lint/security artifacts; dependency and vulnerability reports; code-review records; access-provisioning and quarterly access-review evidence; MFA/password policy; incident-response plan and exercises; vendor/subprocessor register and reviews; backup/restore and DR test results; monitoring and alert history; queue/dead-letter operations; retention/deletion records; privacy notices and consent-text versions; subject-request records; change-management records; and management review of identified risks.

## 15. Audit limitations

This review did not perform exploit attempts, penetration testing, authenticated browser walkthroughs for every role, source-to-production binary comparison, review of every complete RLS predicate body, inspection of Vercel configuration and logs, inspection of all Supabase Auth settings, independent verification of encryption at rest/in transit, legal analysis of applicable privacy laws, or verification of organizational SOC 2 evidence. The report therefore uses calibrated language such as **risk**, **requires verification**, and **not evidenced**, rather than claiming that an exploit or compliance failure has been conclusively demonstrated.

## References

[1]: https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022 "AICPA & CIMA — 2017 Trust Services Criteria with Revised Points of Focus – 2022"

[2]: https://www.nist.gov/cyberframework "NIST — Cybersecurity Framework 2.0 Resource Center"

[3]: https://owasp.org/www-project-application-security-verification-standard/ "OWASP Foundation — Application Security Verification Standard, stable release 5.0.0"

## Appendix A: Audit evidence files

The detailed evidence supporting this report is retained in the audit workspace. Key artifacts include `servicewriter_screen_inventory.txt`, `servicewriter_live_table_summary.txt`, `servicewriter_advisor_summary.txt`, `servicewriter_api_auth_matrix.txt`, `servicewriter_auth_boundary_evidence.txt`, `servicewriter_pii_security_scan.txt`, `servicewriter_code_quality_inventory.txt`, `servicewriter_final_evidence.txt`, and `servicewriter_audit_framework_notes.md`.

## Appendix B: Production object counts

| Object | Count |
|---|---:|
| Live public tables | 67 |
| Live public tables with RLS enabled | 67 reported |
| Live storage buckets returned | 0 |
| Live storage policy rows returned | 0 |
| Repository legacy page components | 167 |
| Next.js filesystem page routes | 1 catch-all |
| API route handlers | 46 |
| Static `onClick` occurrences | 1,484 |
| Static form occurrences | 33 |
| Server-action-like declarations | 253 |
| Test suites passed | 115 |
| Test suites skipped | 1 |
| Tests passed | 582 |
| Tests skipped | 3 |
| TypeScript check | Passed |
| Production build | Passed |
| Lint errors | 0 |
| Lint warnings | 25 |
| Supabase performance advisor findings | 208: 144 INFO, 64 WARN |

**Final assessment:** Service Writer has a credible and substantial service-operations product core with several good engineering controls. It should now be treated as a hardening and governance project, not as a completed compliance-ready system. The highest-value next action is to close the privileged RPC and authorization boundary findings, then reconcile schema/policy provenance and establish the evidence program required for a defensible SOC 2 readiness assessment.
