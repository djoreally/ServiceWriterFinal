# Environment and Secrets Manifest

## Purpose

This manifest defines configuration for the single consolidated Next.js Service Writer application across Development, Preview, Staging, and Production. Browser-visible configuration uses `NEXT_PUBLIC_*`; server credentials remain unprefixed and server-only. Runtime `VITE_*` configuration is retired.

| Variable family | Scope | Rule |
|---|---|---|
| `NEXT_PUBLIC_*` | Next.js browser/build | Public configuration only. Never place service-role keys, passwords, provider secrets, or signing secrets here. |
| `SUPABASE_SERVICE_ROLE_KEY` | Next.js server only | Protected server operations only; never expose to the browser. |
| `RESEND_*` | Next.js server only | Primary transactional application email credentials and webhook verification. |
| `ENGINEMAILER_*` | Next.js server only | Growth/marketing delivery and controlled transactional fallback only. |
| `TWILIO_*`, `STRIPE_*` | Next.js server only | Provider credentials and webhook secrets remain behind server adapters. |
| `SENTRY_*` and server observability credentials | Server/deployment configuration | Environment-specific; scrub customer/payment data. |
| `VITE_*` | Retired | Forbidden in the canonical runtime/deployment. |

## Environment scopes

Development may use uncommitted local environment files. Preview and Staging should use restricted Supabase/provider credentials and non-production provider modes where supported. Production uses the single Vercel project and the exact Next.js public/server boundary defined below.

The repository contains `scripts/verify-env-manifest.mjs` and `scripts/verify-production-integrations.mjs`. They report only presence/state, never secret values, and fail production verification for missing required variables, public-secret naming mistakes, Vite-era configuration, or a Supabase URL/project-ref mismatch.

## Required production public variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_PROJECT_ID
NEXT_PUBLIC_API_BASE_URL
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_CORS_ORIGIN
```

`NEXT_PUBLIC_API_BASE_URL` is `/api` for the consolidated same-origin deployment unless an explicitly reviewed architecture change says otherwise.

## Required production server variables

```text
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_WEBHOOK_SIGNING_SECRET
ENGINEMAILER_API_KEY
ENGINEMAILER_FROM_EMAIL
ENGINEMAILER_WEBHOOK_SIGNING_SECRET
```

Resend is the primary transactional email provider. Enginemailer owns growth/marketing delivery and may be used as a controlled fallback only when the transactional Resend attempt fails before acceptance. Optional least-privilege Enginemailer overrides may be configured without changing that ownership model.

Other server-only provider variables are required only when their corresponding integration is in release scope.

## Supabase binding invariant

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PROJECT_ID` must identify the same project. Production is currently certified against project ref `rjfbrfognxqkyhdrpibx`; the ref is evidence/configuration, not a hard-coded application constant.

## Release checklist

Before production promotion:

1. Run `ENVIRONMENT=production npm run verify:env` in a protected environment.
2. Run the production integration verifier with actual protected environment values.
3. Confirm no `VITE_*` variables are being used as runtime configuration.
4. Confirm browser-visible names contain no service-role/provider secrets.
5. Confirm all Supabase variables identify the intended environment/project.
6. Confirm Resend transactional and Enginemailer marketing webhook secrets match their configured endpoints.
7. Confirm `CRON_SECRET` protects internal worker routes.
8. Redeploy after any build-visible environment change and certify the exact SHA.
