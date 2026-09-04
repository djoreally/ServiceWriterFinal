# Vercel environment audit notes — historical snapshot

> **Superseded for current architecture.** This file records an authenticated Vercel audit performed on 2026-08-22 before Service Writer's production architecture was consolidated and re-certified. It must not be used to choose the current Vercel project, runtime topology, or environment-variable contract. Current authority is `docs/application-architecture-baseline.md`, `docs/canonical-vercel-deployment-record.md`, and `docs/environment-and-secrets-manifest.md`.

Audited the authenticated Vercel dashboard on 2026-08-22.

## Historical project candidate: service-writer-final

Dashboard URL at the time: `https://vercel.com/tyreese-burtons-projects/service-writer-final/settings/environment-variables`

Visible project variable names included: `VITE_ENABLE_DEMO_LOGIN`, `VITE_DEMO_EMAIL`, `VITE_DEMO_PASSWORD`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_PUBLISHABLE_KEY`.

The dashboard displayed an `All Environments` filter. Values were not revealed or stored. The visible list did not show the Vite-prefixed Supabase variable names expected by the then-current repository architecture.

## Historical secondary project: servicewriter.xyx

Dashboard URL at the time: `https://vercel.com/tyreese-burtons-projects/servicewriter.xyx/settings/environment-variables`

Visible project variable names included Sentry variables, Postgres variables, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, and multiple PostHog naming variants including Vite-, Next.js-, and other framework-prefixed names. At that time the mixed configuration was evidence of unresolved deployment drift, not a certified topology.

## Historical security finding

The audit observed sensitive-looking unprefixed Supabase, Postgres, Stripe, and service-role variable names. Values and scopes were not revealed. The durable security rule remains valid: server-only values must never become client-visible configuration.

## What changed after this audit

Phase A architecture certification on 2026-09-03 verified the current production topology directly:

- Vercel project `servicewriter.xyx` (`prj_LwYh6HJuUsB2LZG9eoKs23hDoJuw`) is the canonical Next.js project.
- `servicewriter.xyz`, `www.servicewriter.xyz`, and `*.servicewriter.xyz` are attached to that project.
- `app/api/**` is the server API in the same deployment.
- Supabase project `rjfbrfognxqkyhdrpibx` is the production data/auth platform.
- `NEXT_PUBLIC_*` is the only current browser-visible runtime configuration family; Vite runtime configuration is retired.

Keep this file only as incident/audit history. Do not restore its pre-consolidation project-selection conclusions without a new verified architecture decision.
