# Release Boundary and Ownership Decision Record

**Status:** Phase A architecture certified  
**Certification date:** 2026-09-03  
**Repository:** `djoreally/ServiceWriterFinal`  
**Primary branch:** `main`

## Canonical systems

| System | Canonical target | Role |
|---|---|---|
| Source repository | `djoreally/ServiceWriterFinal` | Application, API routes, migrations, tests, contracts and release workflows. |
| Production deployment | Vercel project `servicewriter.xyx` (`prj_LwYh6HJuUsB2LZG9eoKs23hDoJuw`) | Single Next.js production application. |
| Production domains | `servicewriter.xyz`, `www.servicewriter.xyz`, `*.servicewriter.xyz` | Public/custom tenant routing to the canonical Vercel project. |
| Database/Auth | Supabase `rjfbrfognxqkyhdrpibx` | Auth, Postgres, RLS, Storage, Realtime, RPCs and durable outboxes. |
| Server API | `app/api/**` in the same Next.js deployment | Authenticated server operations, providers, webhooks and workers. |
| CI/release contracts | GitHub Actions + build prerequisites | Type/build/tests plus architecture/schema drift enforcement. |

## Architecture decision

Service Writer uses a **single-surface Next.js deployment**. The preserved UI is client-rendered inside the Next.js shell, with React Router retained only as compatibility navigation. The server API is part of the same application under `app/api/**`.

A separate Vite frontend, separate `apps/web-next` API, separate `apps/api` authority, or Express production server is retired architecture and may not be reintroduced without a new reviewed architecture decision.

## Ownership invariants

| Responsibility | Canonical owner/boundary |
|---|---|
| Identity | Supabase Auth |
| Tenant ownership | `workspace_id` |
| Data authorization | Supabase RLS plus server workspace/RBAC checks |
| Transactional email | Resend |
| Growth/marketing email | Enginemailer |
| Transactional fallback | Enginemailer only after pre-acceptance Resend failure |
| Payments | Server-side Stripe/approved payment adapters and signed webhooks |
| Scheduled/background work | Vercel cron calling protected `app/api/internal/**` routes; durable state in Supabase |
| Release deployment | Exact Git SHA deployed by canonical Vercel project |

## Controlled-release constraints

Each domain remains subject to its own module certification. Architecture certification does not by itself certify payments, scheduling, invitations, offline synchronization, destructive operations, or customer self-service mutations. Those workflows move through their later certification phases on top of this fixed architecture.

## Go/no-go conditions

A candidate cannot be promoted if any of the following is true:

- its Vercel deployment is not tied to the intended Git SHA;
- a competing application/API runtime has been introduced;
- the architecture or schema contract fails;
- Supabase environment variables identify the wrong project;
- service-role/provider secrets are client-visible;
- tenant-scoped operations bypass workspace authorization/RLS;
- provider ownership is ambiguous or bypassed;
- the candidate fails its required build/type/test/security gates.

A release stops immediately on cross-workspace exposure, authentication bypass, service-role leakage, duplicate financial mutation, unverified provider webhook mutation, or unreconciled production deployment drift.

## Change control

Any future change to deployment topology, tenant ownership, browser/server responsibility, auth authority, or provider ownership must update `docs/application-architecture-baseline.md`, `scripts/architecture-contract.json`, and its enforcement in the same reviewed PR.
