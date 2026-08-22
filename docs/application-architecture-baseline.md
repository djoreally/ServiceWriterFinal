# Phase 1 Application Architecture Baseline

## Runtime surfaces

| Surface | Location | Runtime | Responsibility |
|---|---|---|---|
| Browser application | Repository root `src/**` | Vite + React | Mobile-first UI, navigation, route guards, client state, Supabase browser session, and API-bridge commands. |
| Server API | `apps/web-next/**` | Next.js App Router | Authenticated API routes, strict Zod validation, workspace authorization, service-role operations, webhooks, and server-side integrations. |
| Database | Supabase | Postgres/Auth/Storage/Realtime | Identity, workspace membership, tenant-owned data, RLS, transactional RPCs, and audit records. |
| CI | `.github/workflows/ci.yml` | GitHub Actions | Lint, typecheck, Jest, both builds, migration checks, and Playwright. |
| Hosting | Vercel | Static frontend plus Next.js server deployment | `service-writer-final` is the canonical frontend production candidate; the Next.js API must have an explicit deployment and URL. |

## Deployment contract

The current release boundary is a two-surface deployment. The Vite frontend is built with `VITE_API_BASE_URL` pointing to the deployed Next.js API origin. The Next.js API accepts requests only from `NEXT_PUBLIC_CORS_ORIGIN`, validates the Supabase session, resolves the active workspace membership, and performs database operations through the authenticated or service-role Supabase client as appropriate.

The root `vercel.json` is currently Vite-oriented and builds `dist`. It must not be treated as a deployment mechanism for `apps/web-next`. A separate Vercel project or an explicit consolidated Next.js migration is required before production API routes are assumed to exist.

## Environment contract

### Vite build variables

```text
VITE_APP_NAME
VITE_API_BASE_URL
VITE_SUPABASE_URL
VITE_SUPABASE_PROJECT_ID
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_APP_VERSION
VITE_MAPBOX_PUBLIC_TOKEN
VITE_POSTHOG_HOST
VITE_POSTHOG_PROJECT_TOKEN
VITE_PUBLIC_POSTHOG_HOST
VITE_PUBLIC_POSTHOG_KEY
VITE_SENTRY_DSN
```

### Next.js public variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_CORS_ORIGIN
```

### Next.js server-only variables

```text
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_WEBHOOK_SIGNING_SECRET
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

No server-only variable may use a `VITE_` or `NEXT_PUBLIC_` prefix. No server-only module may be imported by the Vite application.

## API boundary invariants

1. Every mutation uses the Next.js API bridge or a controlled database RPC; the browser does not perform direct privileged writes.
2. Every request validates path, query, header, and body data with Zod before database access.
3. Every workspace request validates that the authenticated user has an active membership for the requested workspace.
4. Every customer request validates a customer identity link rather than treating customer authentication as staff membership.
5. Every route returns a stable error envelope and does not leak cross-tenant record existence.
6. Every retryable mutation uses an idempotency key or optimistic concurrency token.
7. Every webhook validates provider signatures before applying state changes.
8. Every audit event includes workspace, actor, action, target, correlation ID, and timestamp.

## Source-of-truth rules

The shared frontend authorization matrix is `src/domain/auth/access-policy.ts`. Database authorization is authoritative for data access. API authorization is authoritative for server operations. Frontend guards are navigation and user-experience controls only.

Supabase migrations under `supabase/migrations` are the database source of truth. Generated types under `src/integrations/supabase/types.ts` must be regenerated after schema changes and reviewed in the same change.

## Release invariants

A release is not eligible for production until the Vite and Next.js deployments are both identified, the API base URL and CORS origin are verified, production Supabase variables point to the same project, server-only secrets are partitioned, real RLS tests pass, and an authenticated smoke test passes against the deployed surface.
