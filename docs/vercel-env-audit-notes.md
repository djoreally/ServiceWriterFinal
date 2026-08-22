# Vercel environment audit notes

Audited the authenticated Vercel dashboard on 2026-08-22.

## Canonical project candidate: service-writer-final

Dashboard URL: `https://vercel.com/tyreese-burtons-projects/service-writer-final/settings/environment-variables`

Visible project variable names included: `VITE_ENABLE_DEMO_LOGIN`, `VITE_DEMO_EMAIL`, `VITE_DEMO_PASSWORD`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_PUBLISHABLE_KEY`.

The dashboard displayed an `All Environments` filter. Values were not revealed or stored. The visible list did not show the required `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, or `VITE_SUPABASE_PROJECT_ID` names in the first page of results. This requires explicit search/filter verification before the Vite deployment can be considered correctly configured.

## Secondary project: servicewriter.xyx

Dashboard URL: `https://vercel.com/tyreese-burtons-projects/servicewriter.xyx/settings/environment-variables`

Visible project variable names included Sentry variables (`SENTRY_VERCEL_LOG_DRAIN_URL`, `SENTRY_ORG`, `SENTRY_PUBLIC_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_OTLP_TRACES_URL`, `SENTRY_PROJECT`), Postgres variables, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, and multiple PostHog naming variants including `VITE_POSTHOG_HOST`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`, `PUBLIC_POSTHOG_PROJECT_TOKEN`, `NUXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, and `NUXT_PUBLIC_POSTHOG_HOST`.

The secondary project’s variable set appears to contain older/mixed framework configuration and does not establish that it has the current Vite Supabase variables or Next.js API variables. Its deployment records also repeatedly failed for commits that successfully deployed to `service-writer-final`.

## Security finding

The canonical project visibly contains sensitive-looking unprefixed Supabase, Postgres, Stripe, and service-role variables. Their values and scopes were not revealed. Vercel must be checked per environment to ensure server-only values exist only in the Next.js/API project and are not present in the Vite frontend project. Public browser variables should use `VITE_` or `NEXT_PUBLIC_` prefixes only when intentionally exposed.

## Confirmed mismatch from project search

On the canonical `service-writer-final` Vercel project, searching for `VITE_SUPABASE_URL` returned `No Results Found`. The dashboard does show unprefixed `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, but the exact Vite-prefixed frontend variables required by the repository were not found in the project variable list. This is a concrete production configuration blocker for the Vite bundle unless the variables are configured through another linked/shared environment mechanism.
