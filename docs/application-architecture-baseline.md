# Canonical Service Writer Application Architecture

**Status:** Phase A certified baseline  
**Certification date:** 2026-09-03

This document is the authoritative application-architecture baseline for ServiceWriterFinal. Older notes that describe separate frontend/API deployments are historical and must not be used as implementation guidance.

## 1. Production topology

Service Writer is one Next.js App Router application deployed from `djoreally/ServiceWriterFinal` to one Vercel project.

```text
Browser
  |
  v
Vercel / Next.js App Router
  |-- app/layout.tsx
  |-- src/ClientOnlyShell.tsx
  |-- src/NextClientShell.tsx
  |-- src/App.tsx (preserved client UI + React Router compatibility navigation)
  `-- app/api/** (canonical server API)
          |
          +--> Supabase Auth / Postgres / Storage / Realtime / RLS
          +--> Resend transactional email
          +--> Enginemailer growth/marketing + controlled email fallback
          +--> Stripe / approved provider adapters
          `--> Vercel cron/background workers
```

Current production bindings verified during Phase A:

| Boundary | Canonical target |
|---|---|
| GitHub repository | `djoreally/ServiceWriterFinal` |
| Vercel project | `servicewriter.xyx` (`prj_LwYh6HJuUsB2LZG9eoKs23hDoJuw`) |
| Framework | Next.js |
| Node runtime | `24.x` |
| Production domains | `servicewriter.xyz`, `www.servicewriter.xyz`, `*.servicewriter.xyz` |
| Supabase production | `rjfbrfognxqkyhdrpibx` |
| Tenant key | `workspace_id` |

Project IDs are certification evidence, not application constants. Runtime code resolves configuration from the reviewed environment manifest.

## 2. Browser boundary

The preserved product UI remains client-rendered because it contains browser session state, maps, offline behavior, interactive scheduling, and a large compatibility route surface. React Router is intentionally retained **inside the single Next.js browser shell**. It is not a second deployment runtime.

The sequence is:

`app/layout.tsx` → `ClientOnlyShell` → `NextClientShell` → `App` → React Router routes.

`app/[[...path]]/page.tsx` exists only so Next.js resolves deep links before the client compatibility router selects the screen.

The browser may perform reviewed, tenant-scoped low-risk reads and Realtime subscriptions. Frontend route guards are UX controls, not the authoritative security boundary.

## 3. Server boundary

`app/api/**` is the only canonical application server API. Server routes own:

- authenticated workspace membership and role checks;
- privileged or consequential mutations;
- provider calls and credentials;
- webhooks and signature verification;
- idempotency and reconciliation;
- audit-sensitive actions;
- cron/background-worker execution.

A separate API application, Express authority, or second production server tree is not part of the production architecture.

## 4. Supabase boundary

Supabase owns identity, canonical business state, storage, realtime, RLS, transactional RPCs, and durable outboxes.

The tenant invariant is `workspace_id`. Tenant-owned queries must resolve and scope the active workspace. User IDs may legitimately represent an actor, member, assignee, creator, or identity link, but they are not a replacement tenant key.

Database authorization is authoritative for data access. Server authorization is authoritative for server operations. The browser must never receive the Supabase service-role credential.

The current canonical schema contract is recorded in `scripts/schema-contract.json` and enforced by `scripts/check_schema_contract.py`.

## 5. Messaging ownership

Provider ownership is explicit:

| Purpose | Primary provider | Rule |
|---|---|---|
| Transactional application email | Resend | Booking, appointment lifecycle, invoice/receipt, invitation and controlled test email use the transactional boundary. |
| Growth/marketing email | Enginemailer | Marketing sends remain consent/suppression controlled. |
| Transactional fallback | Enginemailer | Allowed only when the Resend attempt rejects/fails before provider acceptance and the fallback is configured. |

Domain workflows call internal messaging adapters; they do not embed provider-specific HTTP calls in browser code. `src/server/messaging/lifecycle-sender.ts` is the canonical lifecycle selection boundary.

## 6. Environment contract

Public runtime configuration uses `NEXT_PUBLIC_*`. Server credentials use non-public environment names. `VITE_*` runtime configuration is retired and forbidden.

Production must bind:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PROJECT_ID
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_CORS_ORIGIN
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_WEBHOOK_SIGNING_SECRET
ENGINEMAILER_API_KEY
ENGINEMAILER_FROM_EMAIL
ENGINEMAILER_WEBHOOK_SIGNING_SECRET
```

Additional provider secrets are enabled only for integrations in release scope. No secret may use a `NEXT_PUBLIC_` prefix.

## 7. Background work

Vercel cron invokes the canonical internal routes configured in `vercel.json`:

- `/api/internal/lifecycle/outbox`
- `/api/internal/notifications/push/outbox`

Durable state remains in Supabase. Workers must be idempotent and treat an empty queue as a successful no-op.

## 8. Explicitly retired architecture

The following are not valid production architecture:

- a Vite production deployment;
- a second frontend project for the same Service Writer application;
- a separate `apps/web-next` API deployment;
- a separate `apps/api` production authority;
- an Express adapter competing with `app/api/**`;
- runtime `VITE_*` variables or `import.meta.env`;
- direct privileged provider calls from browser code;
- client-visible service-role/provider secrets.

Historical source files or compatibility components may remain only when they are not independently deployed and do not create a competing business-data or authorization path.

## 9. Enforcement

Phase A is machine-enforced by `scripts/check-architecture-contract.mjs` and `scripts/architecture-contract.json`. CI must fail if the repository reintroduces a competing runtime, Vite configuration, incorrect provider ownership, or removes the canonical Next.js surfaces.

Schema drift is independently enforced by the schema-contract scanner. These two gates are complementary: architecture controls **where responsibilities live**; schema controls **what data contracts runtime code may use**.

## 10. Architecture release invariants

An architecture-safe release requires all of the following:

1. `npm run build` builds the consolidated Next.js application.
2. Vercel identifies the project as Next.js and deploys the intended Git SHA.
3. Production and preview use the reviewed Next.js environment contract.
4. All production Supabase configuration points to the intended project for that environment.
5. `workspace_id` remains the canonical tenant key.
6. Browser code has no service-role or provider secret path.
7. `app/api/**` remains the canonical server API.
8. Resend remains the transactional email owner; Enginemailer remains growth/marketing plus controlled fallback.
9. Architecture and schema-contract CI gates pass.
10. Any future architecture change must update the contract and this decision record in the same reviewed change.
