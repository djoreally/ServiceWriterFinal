# Environment and Secrets Manifest

## Purpose

This manifest defines the configuration boundary for Development, Preview, Staging, and Production. Public variables may be embedded in the Vite bundle or exposed to the browser. Server-only variables must exist only in the Next.js API deployment or protected provider configuration.

| Variable family | Scope | Rule |
|---|---|---|
| `VITE_*` | Vite build and browser | Public configuration only. Never place service-role keys, provider secrets, passwords, or signing secrets here. |
| `NEXT_PUBLIC_*` | Next.js build and browser | Public configuration only. Never place service-role keys, provider secrets, passwords, or signing secrets here. |
| `SUPABASE_SERVICE_ROLE_KEY` | Next.js server only | Required for protected server operations; never expose to the Vite project or browser. |
| `ENGINEMAILER_*`, `TWILIO_*`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Next.js server only | Provider credentials and webhook secrets remain server-side. Enginemailer is the active email provider. |
| `RESEND_*` | Next.js server only | Legacy rollback credentials only. No active email path selects Resend. |
| `SENTRY_*` and server observability credentials | Deployment/provider configuration | Use environment-specific DSNs and tokens; mask customer and payment data. |

## Environment scopes

Development may use local `.env` files that are never committed. Preview and Staging must use restricted Supabase and provider credentials with test domains, test payment mode, and staging webhook endpoints. Production requires exact Vite and Next.js public variables, server-only credentials in the API deployment, HTTPS application URLs, and demo authentication disabled.

The repository contains `scripts/verify-env-manifest.mjs`, exposed as `npm run verify:env`. It reports only whether variables are set and checks for public-prefix secret leaks, mismatched Supabase URLs, insecure production URLs, trailing CORS slashes, and production demo-login flags. It never prints variable values.

## Required production public variables

`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `VITE_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`, and `NEXT_PUBLIC_CORS_ORIGIN` must be configured in the correct Vercel project and environment. The Vite variables require a new frontend deployment after changes.

## Required production server variable

`SUPABASE_SERVICE_ROLE_KEY` must be configured only in the Next.js API deployment. Resend, Twilio, Stripe, Sentry, and PostHog variables should be enabled only when the corresponding integration is approved for the target environment.

## Release checklist

Before production promotion, run `ENVIRONMENT=production npm run verify:env` in a protected environment, inspect Vercel variable scopes individually, confirm the frontend and API point to the same Supabase project, confirm webhook origins and signing secrets, disable demo login, rotate any exposed credential, and redeploy after build-time variable changes.
