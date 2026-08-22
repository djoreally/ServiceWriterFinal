# Service Writer Full Authentication, RBAC, RLS, Integration, and Production Roadmap

## Purpose and operating rule

This is the complete implementation roadmap for moving Service Writer from locally validated code to a controlled live release. It is a planning document only. No implementation is performed by this document.

The release rule is simple: a capability is not considered complete because a route or component exists. It is complete only when its database authorization, API validation, frontend behavior, automated tests, deployment configuration, observability, rollback path, and production evidence all exist.

## Phase 0 — Freeze scope and establish release ownership

1. Confirm the canonical repository, production branch, Vercel project, Supabase project, application domains, and owners for each system.

1. Confirm whether production will use one Next.js deployment or a Vite frontend plus a separate Next.js API deployment.

1. Decide whether `service-writer-final` is the only production Vercel project and classify `servicewriter.xyx` as staging, rollback, or deprecated.

1. Define the first live-test release boundary. Keep payment capture, refunds, outbound messaging, destructive deletes, and broad invitations disabled until their acceptance tests pass.

1. Name technical owners for authentication, database/RLS, frontend, integrations, deployment, security incidents, and customer support.

1. Create a release issue with linked database migrations, code commits, test evidence, environment changes, and rollback instructions.

1. Create a production change calendar and maintenance window for database migrations.

1. Define severity levels, incident response contacts, and the rule for pausing rollout.

## Phase 1 — Repository and architecture baseline

1. Inventory every frontend route, Next.js API route, command, query, adapter, migration, webhook, scheduled process, and external integration.

1. Identify all remaining direct Supabase writes and all uses of legacy tables.

1. Identify all server-only code paths and ensure they cannot be imported by the Vite client bundle.

1. Define the API base URL and browser-to-API authentication strategy for the Vite/Next.js split.

1. Define CORS, cookie domain, SameSite, CSRF, and HTTPS requirements.

1. Define error envelopes and status codes for authentication, authorization, validation, not-found, conflict, rate-limit, and provider failures.

1. Define request correlation IDs and workspace IDs for logs.

1. Regenerate a dependency and runtime inventory, including Node.js versions and Vercel build settings.

1. Remove abandoned deployment assumptions from `vercel.json`, package scripts, and environment documentation.

1. Establish a source-of-truth architecture diagram and data-flow diagram.

## Phase 2 — Identity model and role vocabulary

1. Confirm Supabase Auth providers: email/password, magic link, OAuth, MFA policy, recovery, email confirmation, and session lifetime.

1. Normalize staff roles: `owner`, `manager`, `dispatcher`, `fleet_manager`, and `technician`.

1. Decide how legacy `admin` records map to owner or platform-administrator permissions.

1. Define a separate `customer` identity boundary; do not place customers into `workspace_members` as staff.

1. Define whether one authenticated user may belong to multiple workspaces.

1. Define active/inactive membership behavior and immediate access revocation.

1. Define account deletion, disabled-account, email-change, password-reset, and session-revocation behavior.

1. Define MFA requirements for owners, managers, and sensitive operations.

1. Define support impersonation, if allowed, with time limits, explicit consent, audit records, and no privilege escalation.

1. Define rate limits and lockout protection for login, recovery, invitation acceptance, and verification endpoints.

## Phase 3 — Workspace membership and customer identity schema

**Implementation status (2026-08-22): completed for the initial identity foundation.** The live Supabase project now contains the workspace-scoped `customer_users` link extension, hashed-token `invitations` table, append-only `invitation_events` audit table, lifecycle indexes, updated-at triggers, and generated TypeScript types. The pre-existing `customer_users` table was extended idempotently rather than replaced.

1. Verify `workspaces`, `profiles`, and `workspace_members` columns, constraints, indexes, and existing data.

1. Add or normalize the `member_role` enum to include `fleet_manager`.

1. Add membership status, invitation source, created-by, updated-by, and deactivation metadata where required.

1. Create `customer_users` or an equivalent link table with `workspace_id`, `customer_id`, `user_id`, status, verification timestamps, and audit metadata.

1. Add composite keys or unique indexes preventing duplicate workspace/customer/user links.

1. Add foreign keys that preserve workspace consistency across linked records.

1. Define invitation tables for staff and customers, including hashed single-use token, normalized email, intended role, expiry, status, inviter, acceptance metadata, and revocation metadata.

1. Add idempotency and uniqueness constraints for pending invitations.

1. Add audit tables for invitation creation, resend, acceptance, revocation, role change, membership deactivation, and customer-link changes.

1. Add indexes for email lookup, token digest lookup, workspace lookup, expiry cleanup, and active membership resolution.

1. Backfill or migrate existing users and memberships under an explicit mapping plan.

1. Generate and review updated Supabase TypeScript types.

1. Validate all migrations in a disposable database and staging before production.

## Phase 4 — Security-definer helpers and RLS

**Implementation status (2026-08-22): completed for identity and invitation surfaces.** Locked-search-path security-definer helpers now resolve active members, staff, admins, and customer ownership. RLS policies restrict identity links and invitation administration to the appropriate workspace roles; invitation audit events are append-only at the policy layer. Broader tenant-table coverage and dedicated multi-workspace regression fixtures remain part of the later security certification work.

1. Review every tenant-owned table for a required, non-null `workspace_id` or an unambiguous ownership path.

1. Add composite foreign keys where a child row must belong to the same workspace as its parent.

1. Implement locked-search-path security-definer helpers for member, staff, admin, owner, dispatcher, fleet manager, technician assignment, and customer ownership checks.

1. Revoke helper execution from public and anonymous roles where appropriate.

1. Grant only the required helper execution privileges to authenticated or service roles.

1. Add member-read RLS policies for workspace-owned rows.

1. Add owner/manager write policies for administrative and operational tables.

1. Add dispatcher policies limited to dispatch and operational fields.

1. Add fleet-manager policies limited to fleet accounts, fleet vehicles, fleet work orders, and fleet reporting scope.

1. Add technician policies limited to assigned jobs and execution fields.

1. Add customer policies through `customer_users`, limited to owned vehicles, appointments, approvals, invoices, receipts, and message threads.

1. Add service-role-only policies or RPC grants for webhooks and provider callbacks.

1. Verify no policy relies solely on a client-supplied workspace ID.

1. Test null, deleted, inactive, cross-workspace, and changed-parent cases.

1. Test read, insert, update, delete, RPC, storage, and realtime access separately.

1. Add RLS regression tests using at least two workspaces, multiple staff roles, fleet scope, technician assignments, and customer links.

## Phase 5 — Server-side identity resolution

**Implementation status (2026-08-22): completed for the Next.js bridge foundation.** `GET /api/v1/identity` resolves the authenticated user, active workspace memberships, and customer links through the server-side Supabase client. Invitation lifecycle routes enforce authenticated identity, workspace-admin authorization, normalized email matching, token digest verification, expiration/revocation/replay checks, membership upsert, customer linking, and audit events. Session refresh, cache invalidation, rate limits, and suspicious-attempt telemetry remain scheduled hardening items.

1. Build one authoritative server-side identity resolver.

1. Resolve the authenticated Supabase user, active memberships, selected workspace, effective role, and customer links.

1. Reject a requested workspace that is not an active membership.

1. Reject an inactive or deleted user before returning protected data.

1. Support multi-workspace selection without trusting local storage as authorization.

1. Return a stable identity contract to the frontend.

1. Add cache invalidation after membership, role, workspace, or invitation changes.

1. Add session expiry and refresh behavior.

1. Add audit logging for role resolution failures and suspicious workspace-switch attempts.

1. Ensure API routes use this resolver consistently rather than duplicating authorization logic.

## Phase 6 — Invitation lifecycle

1. Define staff invitation eligibility by inviter role.

1. Define customer invitation eligibility from an existing customer record.

1. Normalize emails consistently and bind tokens to the intended email.

1. Generate cryptographically secure raw tokens and store only a digest.

1. Add expiry, one-use, revoke, resend, and replay protection.

1. Prevent invitation acceptance into a different workspace or role.

1. Handle existing authenticated users and new users separately.

1. Handle an email that already belongs to a different customer or workspace.

1. Add acceptance transaction: verify token, verify identity, create/link membership, consume token, audit event.

1. Add resend cooldown and invitation rate limits.

1. Add invitation email templates, link expiration text, support contact, and privacy wording.

1. Add API routes for create, resend, revoke, list, accept, and role change.

1. Add UI for invitation status, pending invitations, expiration, resend, revoke, and errors.

1. Add tests for duplicate invitations, expired tokens, revoked tokens, wrong email, replay, cross-workspace attempts, and deactivated inviters.

## Phase 7 — Route guards and navigation

1. Extend the shared access-policy matrix with fleet-manager and customer route groups.

1. Keep frontend route guards as UX protection only; enforce every permission again in the API and RLS.

1. Define staff landing routes by role.

1. Define separate customer shell and customer route namespace.

1. Add route-level loading, unauthorized, forbidden, not-found, and session-expired states.

1. Ensure unlisted protected routes deny by default.

1. Ensure navigation hides or disables controls consistently with capability policy.

1. Prevent prefetching or cached rendering of routes a user cannot access.

1. Test direct URL entry, browser back/forward, workspace switching, refresh, expired session, and role change while a page is open.

1. Test mobile navigation and narrow viewport behavior for every role.

## Phase 8 — Role-specific screens and workflows

### Owner

1. Workspace onboarding and settings.

1. Team management and role changes.

1. Integrations, billing, plans, reports, expenses, and audit access.

1. Full customer, vehicle, appointment, quote, invoice, payment, service-record, dispatch, and fleet access.

1. Owner-only confirmation for destructive or financial actions.

### Office manager

1. Operations dashboard.

1. Customer and vehicle CRUD.

1. Appointment management.

1. Quote creation/conversion.

1. Invoice and payment operations without owner-only financial administration.

1. Team visibility with restricted invitation/role controls.

1. Operational reporting without platform settings.

### Dispatcher

1. Dispatch board and command center.

1. Assignment, status transitions, technician availability, route context, and operational messaging.

1. Read-only quote/catalog context unless explicitly granted.

1. No billing, payment, owner settings, or unrestricted customer export.

1. Conflict resolution and optimistic concurrency UI.

### Fleet manager

1. Fleet dashboard.

1. Fleet account/customer view.

1. Fleet vehicles and maintenance schedules.

1. Fleet work orders and appointment scheduling.

1. Fleet utilization, service history, and fleet reports.

1. Fleet-scoped messaging.

1. No shop-wide billing, platform settings, or unrelated workspace data.

### Technician

1. Today/assigned jobs view.

1. Job detail, checklist, photos, notes, signatures, parts/labor capture, and status transitions.

1. Limited customer and vehicle context.

1. Offline queue, retry, conflict, and sync status.

1. No workspace-wide customer search, billing, settings, or team administration.

### Customer

1. Customer dashboard.

1. Own vehicles.

1. Own appointments and booking.

1. Quote review and approval.

1. Invoice, payment, and receipt history.

1. Service history.

1. Messages with the shop.

1. Profile, consent, notification, and session management.

1. Explicit absence of workspace-wide lists, staff routes, reports, and internal notes.

## Phase 9 — API route authorization and validation

1. Inventory every API route and assign required role/capability.

1. Add strict Zod schemas for path params, query params, headers, body, pagination, sort, filters, and idempotency keys.

1. Validate UUIDs, enums, monetary values, dates, phone/email formats, and maximum lengths.

1. Reject unknown fields where the contract requires strictness.

1. Normalize API errors without leaking cross-tenant existence.

1. Enforce workspace membership and resource ownership server-side.

1. Add idempotency to invitation, payment, message, quote conversion, and other retryable mutations.

1. Add optimistic concurrency/version checks to dispatch, appointment, service-record, and fleet updates.

1. Add request correlation IDs and audit metadata.

1. Add consistent CORS and CSRF behavior.

1. Add rate limits to auth, invitations, public booking, webhooks, and expensive queries.

1. Verify API routes run in the intended Vercel runtime and do not import browser-only modules.

## Phase 10 — Data-domain completion

1. Finish remaining direct legacy writes.

1. Confirm customers, vehicles, appointments, repair orders, quotes, invoices, payments, service records, dispatch, fleet, and messaging all use the bridge boundary.

1. Complete quote conversion migration and post-migration audit.

1. Verify financial totals, currency, tax, refunds, and payment reconciliation.

1. Verify service-record and dispatch state machines.

1. Verify fleet work-order and vehicle relationships.

1. Verify customer-visible data projections exclude internal notes and sensitive fields.

1. Verify deletion/archive rules and retention requirements.

1. Verify search, pagination, sorting, and exports are workspace-scoped.

1. Regenerate types after final schema changes.

## Phase 11 — Production integrations

### Supabase

1. Confirm production project URL and project reference.

1. Apply migrations in order through an approved process.

1. Confirm backups/PITR and recovery point.

1. Verify Auth email settings, redirect URLs, SMTP, templates, and rate limits.

1. Verify RLS and storage policies in staging and production canary.

1. Verify realtime channels are workspace-scoped.

### Resend

1. Verify domain authentication and sender identity.

1. Configure API key and from address server-side only.

1. Configure signed webhook endpoint.

1. Verify delivery, bounce, complaint, retry, and suppression behavior.

1. Verify invitation, receipt, and operational email templates.

1. 

### Stripe

1. Confirm test/live mode separation.

1. Configure publishable key only for frontend use.

1. Keep secret key and webhook secret server-only.

1. Verify payment links, collection, refunds, failures, retries, and reconciliation.

1. Verify webhook signature validation and idempotency.

1. Verify customer-facing receipts and internal audit events.

### Observability

1. Configure Sentry DSN and release/environment tags.

1. Configure PostHog host/key with PII policy.

1. Remove or mask customer, payment, token, and message content from logs.

1. Configure alert thresholds and owners.

1. Verify deployment logs, function logs, webhook logs, and database error visibility.

## Phase 12 — Environment and secrets management

1. Build an environment manifest from code references.

1. Map every variable to Development, Preview, Staging, and Production.

1. Add exact Vite variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID`.

1. Add exact Next.js variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`, and `NEXT_PUBLIC_CORS_ORIGIN`.

1. Add server-only Supabase, Stripe, Resend, Twilio, Postgres, Sentry, and webhook secrets only to the server project.

1. Ensure no server-only key uses `VITE_` or `NEXT_PUBLIC_`.

1. Ensure no secret is printed by CI, builds, logs, browser diagnostics, or error responses.

1. Remove demo credentials and demo-login flags from Production.

1. Use separate staging providers or restricted test credentials for PRs.

1. Rotate credentials if they appeared in logs, screenshots, shell history, or commits.

1. Verify Vercel environment scopes individually; do not rely on `All Environments` assumptions.

1. Redeploy after changing build-time Vite variables.

## Phase 13 — Testing program

1. Unit test validators, policy functions, route matching, state machines, adapters, error normalization, and idempotency helpers.

1. Integration test every API route with authenticated and unauthenticated contexts.

1. Run real Supabase staging tests for RLS and tenant isolation.

1. Run concurrent tests against the real conversion RPC and other idempotent mutations.

1. Test invitation acceptance against real Auth staging behavior.

1. Test role changes and membership deactivation while sessions are active.

1. Test customer isolation and fleet-manager scope.

1. Test webhook signatures, retries, duplicate events, and out-of-order events.

1. Test payment and messaging provider failure behavior.

1. Test offline queue persistence, retries, conflicts, and recovery.

1. Run mobile Playwright tests for each role’s primary flow.

1. Run desktop Playwright tests for office, dispatch, and owner workflows.

1. Run accessibility checks for keyboard navigation, focus, labels, contrast, and screen readers.

1. Run performance checks for initial load, route transitions, largest chunks, and narrow devices.

1. Run security checks for secret exposure, dependency vulnerabilities, headers, CORS, CSRF, rate limits, and IDOR.

1. Make CI gates deterministic and archive reports, coverage, traces, and migration evidence.

## Phase 14 — CI/CD and release automation

1. Fix GitHub account/billing access so Actions jobs can start.

1. Verify frontend CI injects required public Supabase build variables.

1. Verify Next.js CI injects safe staging values and never logs server secrets.

1. Run lint, typecheck, Jest, Vite build, Next.js build, migration sanity, Playwright, and summary jobs.

1. Add branch protection requiring the CI summary.

1. Add dependency caching and pinned action versions.

1. Add migration review and changed-SQL destructive-operation checks.

1. Add preview deployments for pull requests with staging configuration.

1. Add protected production deployment approval.

1. Record commit SHA, migration version, environment, and release identifier.

1. Upload test reports and build artifacts with retention policy.

1. Add automatic rollback or stop-the-line conditions for failed canaries.

## Phase 15 — Database rollout and data migration

1. Take and verify a production backup.

1. Confirm migration order and expected lock duration.

1. Apply additive schema changes first.

1. Backfill workspace IDs in batches with progress monitoring.

1. Validate orphan counts, duplicates, foreign-key consistency, and tenant mismatches.

1. Enable RLS in a controlled sequence.

1. Run read-only verification scripts.

1. Enable new API writes behind a feature flag.

1. Compare old/new counts and totals during dual-read or shadow validation where needed.

1. Stop the rollout if mismatch thresholds are exceeded.

1. Remove legacy writes only after the new path is proven.

1. Keep rollback scripts and restoration procedures available.

## Phase 16 — Staging certification

1. Seed a staging workspace for each role.

1. Create two independent workspaces for isolation tests.

1. Create staff and customer identities through the real invitation flow.

1. Verify each role’s login, workspace resolution, navigation, screens, and API access.

1. Verify denied routes and denied mutations.

1. Verify customer and fleet scoping.

1. Run real provider sandbox tests.

1. Run authenticated Playwright against the deployed staging URL.

1. Run concurrency and RLS tests against staging Supabase.

1. Run offline/device tests.

1. Collect evidence and sign off each acceptance criterion.

## Phase 17 — Production deployment

1. Confirm the canonical Vercel project and custom domain.

1. Confirm root directory, framework, build command, output directory, Node.js version, and API routing.

1. Confirm all Production environment variables and scopes.

1. Confirm Supabase production schema version.

1. Confirm provider webhook URLs point to the canonical deployment.

1. Confirm Vercel Protection and application authentication behavior.

1. Deploy the database migration during the approved window.

1. Run the migration verification script.

1. Deploy the application.

1. Run an authorized authenticated smoke test.

1. Run read-only API and tenant-isolation canaries.

1. Enable invitations and write operations gradually.

1. Keep payments, refunds, outbound messaging, and destructive actions behind explicit rollout controls until signed off.

1. Monitor errors, latency, auth failures, RLS denials, webhooks, and provider failures.

1. Announce release completion only after the observation window passes.

## Phase 18 — Post-launch operations

1. Monitor authentication success, recovery, invitation acceptance, role-resolution failures, and session expirations.

1. Monitor API 4xx/5xx rates by route and workspace.

1. Monitor RLS denials and suspicious cross-workspace attempts.

1. Monitor payment, messaging, and webhook success/failure rates.

1. Monitor offline sync failures and conflict queues.

1. Review audit logs for invitation, role, payment, and administrative actions.

1. Run the post-migration audit on a scheduled basis.

1. Rotate secrets according to policy.

1. Patch dependencies and rerun the release gates.

1. Review backup and restore readiness quarterly.

1. Review role permissions and access recertification quarterly.

1. Reduce lint warning debt by subsystem without weakening rules.

1. Retire the secondary deployment only after rollback and DNS responsibilities are formally closed.

1. Maintain a release retrospective and update this roadmap after each production incident or major domain release.

## Final go-live gate

The platform may move from controlled staging to production only when all of the following are true:

- The canonical deployment target is confirmed.

- The Vite/Next.js architecture and API base URL are explicit.

- Production environment variables are mapped and scoped correctly.

- Server-only secrets are partitioned from the frontend bundle.

- Authentication works for owner, manager, dispatcher, fleet manager, technician, and customer.

- Invitations are secure, expiring, replay-safe, and auditable.

- Real Supabase RLS tests pass for multiple workspaces.

- API routes enforce role and resource permissions independently of the UI.

- Payment, messaging, webhook, and offline workflows pass staging certification.

- Database migrations and data audits pass.

- Remote CI completes successfully.

- Authenticated production smoke tests pass.

- Monitoring, backup, rollback, and incident ownership are confirmed.

- The release owner signs the production acceptance record.

