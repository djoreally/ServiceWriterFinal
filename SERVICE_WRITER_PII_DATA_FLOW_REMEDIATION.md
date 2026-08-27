# Service Writer PII and Data-Flow Assessment

**Prepared by:** Manus AI  
**Assessment date:** 27 August 2026  
**Scope:** Production Supabase schema, application/API paths, integrations, database functions, RLS, triggers, outboxes, messaging, PWA push, retention posture, and remediation SQL  
**Status:** Review package; SQL is staged for approval and was **not executed**

## Executive summary

Service Writer processes a broad set of personal, confidential, operational, financial, and integration data. The primary subject populations are customers, guests, fleet contacts, prospects, technicians, workspace members, and external messaging recipients. The principal flows are public booking into customers and appointments; appointments into work orders and service records; quotes into invoices and payments; customer and fleet data into CRM and messaging; provider callbacks into webhook, message, and inbound-message records; workspace activity into audit events and notifications; and Google Calendar/provider connections into token and event records.

The application has useful privacy and security primitives: workspace identifiers on most business tables, RLS enabled on all 67 live public tables as reported by Supabase, consent and suppression tables, redacted message-body storage, encrypted-token column naming, webhook ingestion, worker outboxes, idempotency keys, and server-side membership helpers. Those primitives do not yet amount to a complete privacy or retention program.

The most urgent technical issue is the privilege boundary around public `SECURITY DEFINER` RPCs. Production inspection showed multiple public booking/customer/vehicle/payment-related functions executable by `anon` and `authenticated`. A valid role is not proof of authorization for a caller-supplied workspace or business-user identifier. The second urgent issue is RLS assurance: the policies exist broadly, but several table families use broad `ALL` policies, nullable workspace logic, user-only ownership, or policy helpers whose complete behavior must be tested under two-tenant adversarial scenarios.

The recommended posture is **privacy hardening before scale**: reduce RPC privileges, move privileged operations behind protected server routes, export and test complete RLS predicates, classify and minimize raw JSON/text fields, establish approved retention schedules, implement deletion/anonymization and subject-request workflows, and retain evidence for future SOC 2 and privacy reviews.

## 1. Applicable privacy and control principles

The European Commission describes GDPR principles including lawfulness, fairness and transparency, purpose limitation, data minimization, and storage limitation [1]. The California Consumer Privacy Act gives California consumers more control over personal information collected about them [2]. The FTC describes CAN-SPAM as rules for commercial email messages and associated business responsibilities [3]. Applicability depends on the organization, customer location, role as controller/business or processor/service provider, thresholds, contracts, and communications purpose; this document is not legal advice.

The operational implication is straightforward: Service Writer needs a data inventory that connects every field to a purpose, lawful basis or contractual purpose, recipient, retention period, access role, deletion behavior, and evidence record. A field placed in `metadata`, `payload`, `raw_payload`, `notes`, or `body` is still personal data if it identifies or describes a person.

## 2. End-to-end PII and sensitive-data flows

### 2.1 Public booking flow

A public visitor accesses a booking slug and receives public profile, catalog, package, slot, blocked-date, or settings information through public booking RPCs. The visitor submits name, email, phone, vehicle details, service selection, date/time, notes, and possibly payment-intent information. The flow can create or update a customer, vehicle, appointment, appointment items, consent records, and lifecycle notifications. Confirmation then sends email or SMS and may create message logs and provider delivery events.

**Primary risks:** caller-supplied tenant identifiers, enumeration of booking profiles or availability, excessive collection before a contract exists, replayed booking creation, arbitrary customer/vehicle attachment, unbounded notes/metadata, and marketing consent being mixed with transactional fulfillment. The public path needs a signed booking context, explicit public visibility checks, rate limiting, idempotency, payload limits, abuse monitoring, and a strict separation of transactional and marketing consent.

### 2.2 Service execution flow

Staff or technicians access appointments, assignments, work orders, service records, service line items, dispatch events, vehicle specifications, and customer-linked notes. These records can contain location, diagnosis, complaint, work performed, internal notes, mileage, vehicle identifiers, and technician identity. Completion may create or update service records and trigger invoice or notification behavior.

**Primary risks:** technicians seeing unassigned or unrelated customer data, customer-facing screens exposing internal notes, child-row UUID access bypassing parent authorization, offline conflict overwrites, and retention of sensitive service narratives longer than needed. Internal notes and operational location data need separate authorization and presentation rules.

### 2.3 Quote, invoice, and payment flow

Quotes and quote items become service records or invoices. Invoice lines and payment records carry amounts, currency, status, provider identifiers, customer linkage, and metadata. Payment triggers reconcile invoice status and may generate messages or lifecycle events.

**Primary risks:** changing financial history through broad update permissions, using provider IDs or metadata as if they were payment secrets, duplicate payment/reconciliation side effects, insufficient segregation of duties, and disclosure of financial information to roles that only need operational access. Financial records need immutable event history, explicit role separation, concurrency tests, reconciliation reports, and retention aligned with accounting and tax requirements.

### 2.4 Messaging and marketing flow

Customers, fleet contacts, leads, and guests can be placed into email/SMS/in-app notification flows. Consent and suppression rows record channel, purpose, status, source, legal basis, evidence, timestamps, and contact points. Message logs, delivery events, inbound messages, lifecycle outbox records, and provider webhooks create additional copies of contact data and message content.

**Primary risks:** sending after revocation, using transactional consent for marketing, stale suppression state, raw payload retention, provider data duplication, internal users reading message bodies unnecessarily, and marketing segmentation persisting after a deletion request. Consent must be versioned and immutable as evidence; current preference state should be separate from historical evidence; all send paths must perform channel/purpose checks immediately before dispatch.

### 2.5 Fleet and CRM flow

Fleet clients, contacts, contracts, service requests, dispatch assignments, CRM profiles, leads, activities, tasks, segments, campaigns, campaign members, loyalty accounts, and loyalty ledger entries expand the purpose beyond service execution. These tables support relationship management and marketing automation, which creates profiling and secondary-use considerations.

**Primary risks:** repurposing operational customer data for marketing without a documented basis, broad CRM capability predicates, campaign member snapshots surviving customer deletion, loyalty history without a defined financial/contractual purpose, and fleet contacts being visible across workspace boundaries. CRM data should have an explicit purpose and retention policy distinct from the core service record.

### 2.6 Identity, invitation, and integration flow

Profiles, workspace memberships, roles, invitations, invitation events, invitation delivery attempts, Google Calendar sync tokens, provider connections, appointment calendar events, and webhook events support authentication and external synchronization.

**Primary risks:** invitation token exposure, token or secret leakage into logs, failure to revoke calendar access, external-account identifiers being exposed to clients, replayed provider events, and retention of integration data after disconnect. Tokens must be server-only, encrypted with managed keys, rotated/revoked on disconnect, and excluded from client projections and logs.

### 2.7 Notification and PWA flow

An in-app notification is linked to a user and workspace, then a database trigger creates push outbox rows for active subscriptions. Worker-only claim and completion functions deliver the push through the Web Push provider. Subscription records include endpoint, `p256dh`, `auth_key`, user agent, and timestamps.

**Primary risks:** push endpoints being treated as harmless identifiers, notification metadata carrying PII, stale subscriptions, user/workspace mismatch, and notification content leaking customer or financial information on a lock screen. Notifications should use minimal text, avoid sensitive details by default, allow user preference controls, and purge disabled/stale subscriptions and delivered outbox rows on a defined schedule.

## 3. Table-by-table classification and retention

The complete 67-table classification is attached as `SERVICE_WRITER_PII_TABLE_MATRIX.md`. The matrix assigns every live table a sensitivity category, likely data elements/flow, and a retention direction. It is intentionally a control starting point, not a legally binding schedule.

| Retention class | Typical tables | Recommended default direction |
|---|---|---|
| R0: ephemeral operational | Push outbox, transient lifecycle outbox, stale availability/recovery state | Purge after successful delivery plus a short operational/audit window; retain failures only as needed for incident analysis |
| R1: active-service PII | Customers, vehicles, appointments, work orders, service records, fleet requests | Retain while the customer/contract/service relationship requires it, then delete or anonymize subject to warranty, accounting, legal hold, and contractual needs |
| R2: financial/legal record | Invoices, invoice lines, payments, quotes, contracts, loyalty ledger | Retain according to approved accounting, tax, chargeback, warranty, and contract obligations; restrict access and preserve integrity |
| R3: communications evidence | Consents, suppressions, message logs, delivery events, inbound messages | Keep only the minimum evidence needed to prove consent, suppression, delivery, dispute handling, and legal obligations; redact bodies/payloads |
| R4: security/audit evidence | Audit events, CRM audit events, invitation events, webhook events | Immutable, access-controlled retention with a documented period, legal hold, integrity monitoring, and export capability |
| R5: secrets/integrations | Google tokens, provider connections, calendar event mappings, push credentials | Retain only while connected and operationally necessary; revoke/delete promptly on disconnect or expiry |
| R6: imports | Import batches, records, mappings | Keep status, counts, hash, and audit evidence; delete source row data and error payloads after the reconciliation window |

No retention period should be activated solely from the sample intervals in the SQL script. Legal, accounting, warranty, employment, communications, and contractual requirements must be approved by the data owner and counsel.

## 4. Detailed remediation plan

### Priority 0: close privilege and tenant escape paths

Revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` for every `SECURITY DEFINER` function by default. Restore access only to an explicit public-read booking allowlist and protected authenticated functions whose caller and tenant contract is documented. Move mutation RPCs behind server routes that authenticate the caller, derive workspace ownership from the booking context or session, validate all foreign keys within that workspace, and apply idempotency.

Add an automated privilege regression test that fails the build when a new `SECURITY DEFINER` function is executable by an unintended role. The test must enumerate exact identity arguments, because overloaded PostgreSQL functions can otherwise leave one unsafe signature exposed.

### Priority 1: make RLS provable

Export complete `USING` and `WITH CHECK` expressions for all policies and review them against a canonical authorization matrix. Test two workspaces with owner, admin, manager, dispatcher, fleet manager, service advisor, receptionist, technician, customer, anonymous, and service-role identities. The minimum negative tests are cross-workspace SELECT, INSERT, UPDATE, DELETE, child-row access, caller-supplied foreign keys, inactive membership, unassigned technician work, and customer access to internal notes.

Replace broad `ALL` policies where the business operation needs different read and write rights. Treat `workspace_id IS NULL` as a deliberate exception requiring a written purpose, not as an implicit bypass. Keep service-role worker tables inaccessible to browser roles and use protected routes/views for approved operational inspection.

### Priority 1: implement privacy lifecycle controls

Create a data register with table, column, classification, purpose, lawful basis, source, recipient/vendor, retention, deletion method, owner, and control evidence. Add a subject-request workflow for access, correction, deletion, restriction, and marketing preference changes. It must search primary, child, snapshot, outbox, message, CRM, import, audit, and provider records and apply anonymization or deletion according to legal holds and retention exceptions.

Separate current consent state from append-only evidence. Store consent-text version, policy version, collection context, IP/device evidence only if justified, and revocation event. Ensure every outbound channel checks current consent and suppression immediately before dispatch.

### Priority 1: protect logs, raw payloads, and integrations

Redact provider payloads and inbound message bodies by default. Store a minimized normalized event plus a hash or provider identifier where possible. Restrict raw payload access to a small server-side role, enforce payload-size limits, expire raw data, and prevent it from appearing in error logs. Ensure `metadata` fields are schema-validated and cannot silently become a secret or PII sink.

Keep Google OAuth tokens and provider secrets server-side. Verify envelope encryption and key rotation, delete or revoke tokens on disconnect, and ensure integrations are not represented by client-readable generic selects.

### Priority 2: operationalize retention and evidence

Implement approved scheduled jobs for each retention class, with dry-run counts, legal-hold exclusions, audit records, failure alerts, and retry behavior. Add restore and deletion verification tests. Create dashboards for consent violations, failed webhook signatures, outbox backlog, dead letters, stale push subscriptions, public booking abuse, and cross-tenant authorization denials.

## 5. SQL package contents and application sequence

`SERVICE_WRITER_SECURITY_HARDENING.sql` contains staged SQL for privilege reduction, explicit worker/public booking grants, search-path hardening, direct-table revocation for server-managed data, RLS policy changes for audit and abandoned-booking exceptions, and retention dry-run queries. It does not delete data and was not executed.

`SERVICE_WRITER_SECURITY_HARDENING_ROLLBACK_AND_TESTS.sql` contains post-change privilege checks, table-access checks, policy inspection, a rollback template that requires restoring exact pre-change definitions, and the required application-level negative tests. It is intentionally not a blind rollback script because broad pre-change grants should never be restored from memory.

Apply the package in this order:

1. Capture the current production ACL, RLS, function definition, trigger, and migration state as immutable change evidence.
2. Apply the privilege changes in staging.
3. Run public booking, customer, technician, finance, messaging, notification, webhook, and integration regression tests.
4. Run the two-tenant negative authorization suite.
5. Review all failed or newly denied application calls and migrate those calls to protected server routes.
6. Apply to production in a change window with worker monitoring and rollback readiness.
7. Run the companion validation queries and retain their outputs.
8. Activate retention jobs only after data-owner and counsel approval of periods and legal-hold behavior.

## 6. Important SQL review notes

The hardening SQL uses exact PostgreSQL function signatures for `REVOKE`, `GRANT`, and `ALTER FUNCTION`; signatures must be compared against the live function export before application. Any overloaded function not included in the script must be added or explicitly documented.

The script assumes `service_role` is the server-side execution role and that the application does not use browser-side direct reads of the revoked operational tables. If the application currently depends on such reads, migrate the call first rather than weakening the table boundary.

The public booking allowlist is not automatically safe merely because a function is named “public.” Each function body must return only intentional public data, set a safe search path, validate the booking context, and resist tenant enumeration and replay. The SQL therefore treats public mutation functions as protected until individually reviewed.

The retention queries are previews only. They do not establish legal retention periods and must not be changed into deletion statements until the organization approves a data schedule, legal-hold process, deletion/anonymization semantics, and vendor-side deletion obligations.

## 7. Acceptance criteria

The hardening effort should be considered complete only when all of the following are true:

| Control | Acceptance evidence |
|---|---|
| SECURITY DEFINER least privilege | No unintended `anon`/`authenticated` execute privileges; exact allowlist reviewed |
| RLS isolation | Automated two-tenant matrix passes for every sensitive table and child table |
| Public booking safety | Rate limiting, signed context, idempotency, abuse telemetry, and replay tests pass |
| PII inventory | Every production table and sensitive column has owner, purpose, classification, recipient, retention, and deletion method |
| Consent | Versioned consent evidence, revocation, suppression, and send-time checks pass |
| Deletion rights | Verified export, correction, deletion/anonymization, and legal-hold paths exist |
| Secrets | Tokens and provider references are server-only, encrypted, rotated, and revocable |
| Retention | Dry-run reports, approved schedules, purge/anonymization jobs, alerting, and evidence logs exist |
| SOC 2 evidence | Access reviews, change records, incidents, DR tests, vendor reviews, monitoring, and management signoff are retained |

## References

[1]: https://commission.europa.eu/law/law-topic/data-protection/data-protection-explained_en "European Commission — Data protection explained"

[2]: https://oag.ca.gov/privacy/ccpa "California Attorney General — California Consumer Privacy Act"

[3]: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business "Federal Trade Commission — CAN-SPAM Act: A Compliance Guide for Business"

[4]: https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022 "AICPA & CIMA — Trust Services Criteria"

[5]: https://www.nist.gov/cyberframework "NIST — Cybersecurity Framework 2.0"

[6]: https://owasp.org/www-project-application-security-verification-standard/ "OWASP Foundation — Application Security Verification Standard 5.0.0"

## Attachments

- `SERVICE_WRITER_PII_TABLE_MATRIX.md`: exhaustive 67-table classification and retention-direction matrix.
- `SERVICE_WRITER_SECURITY_HARDENING.sql`: staged hardening SQL and retention dry-run queries.
- `SERVICE_WRITER_SECURITY_HARDENING_ROLLBACK_AND_TESTS.sql`: validation queries, negative-test requirements, and rollback template.
