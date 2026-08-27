# Vercel Production Configuration and Authenticated Smoke Test

## Executive conclusion

The repository has two Vercel-backed deployment targets recorded in GitHub deployment events:

| Target | Latest observed behavior | Recommendation |
|---|---|---|
| `service-writer-final` | Repeated successful production deployment statuses, including the latest `main` commit `062de67c`. | Treat as the **canonical production target**, subject to owner confirmation. |
| `servicewriter.xyx` | Repeated failed production deployment statuses for the same commits, with Vercel inspection commands supplied for failed deployments. | Treat as a stale, secondary, or misconfigured target until its ownership and purpose are confirmed. |

The latest `service-writer-final` deployment record completed successfully, but its generated URL is protected by Vercel SSO. An unauthenticated request therefore receives a redirect to the Vercel login flow. This is access protection, not proof that the application’s authenticated flows work.

## Environment-variable mapping

The repository contains two runtime surfaces and therefore two distinct public Supabase variable sets.

| Runtime surface | Required variables | Vercel configuration location | Secret handling |
|---|---|---|---|
| Vite frontend | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | `service-writer-final` project, Production/Preview environments as appropriate | URL and project ID are public configuration. The publishable key is safe for browser use but should still be managed through Vercel environment configuration. |
| Next.js API | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CORS_ORIGIN` | The Next.js project/environment that serves `apps/web-next` | Public variables are exposed to the browser where prefixed `NEXT_PUBLIC_`; use the correct environment-specific values. |
| Next.js server-only integrations | `SUPABASE_SERVICE_ROLE_KEY`, `ENGINEMAILER_API_KEY`, `ENGINEMAILER_FROM_EMAIL`, `ENGINEMAILER_WEBHOOK_SIGNING_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Next.js Production environment only | Store as encrypted Vercel secrets. Never use these in Vite variables, client components, browser bundles, or `NEXT_PUBLIC_` names. |
| Optional frontend services | `VITE_API_BASE_URL`, `VITE_MAPBOX_PUBLIC_TOKEN`, `VITE_POSTHOG_HOST`, `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_PUBLIC_POSTHOG_HOST`, `VITE_PUBLIC_POSTHOG_KEY`, `VITE_SENTRY_DSN`, feature flags, and demo flags | Vite project Preview/Production according to feature policy | Public tokens may be client-visible. Demo-login and recording flags must be disabled in production unless explicitly approved. |

The current root `.env.example` covers the basic Vite variables but does not enumerate every referenced frontend variable. `apps/web-next/.env.example` covers Supabase, messaging, and CORS variables but does not represent every possible Vercel setting. Before production, create a reviewed environment manifest and compare it against the code-level environment reference inventory.

## Required Vercel checks

Verify the following separately in each Vercel project and environment:

1. The Git repository is `djoreally/ServiceWriterFinal` and the branch is `main`.
2. The `service-writer-final` project uses the intended root directory and build command for the Vite frontend.
3. The Next.js project, if separate, uses `apps/web-next` as its root directory and has `next` in its package dependencies.
4. Vite builds receive the `VITE_*` values at build time. Changing them requires a new deployment because Vite embeds them into the client bundle.
5. Next.js runtime values are set in the correct Production environment and server-only values are not copied into frontend project settings.
6. The Supabase URL and publishable key point to the same project. Do not mix values from the older `servicewriter.xyx` target or a previous Lovable project.
7. `NEXT_PUBLIC_CORS_ORIGIN` equals the exact browser origin that calls the Next.js API, including scheme and host but excluding a trailing path.
8. Webhook URLs point to the canonical Next.js deployment and signing secrets match the configured Resend/Twilio providers.
9. Vercel Protection is intentionally configured. For external smoke testing, use an authorized Vercel session or a protected staging/custom-domain route; do not disable protection merely to make a test pass.

## Authenticated smoke-test procedure

The smoke test does not bypass Vercel SSO, defeat authentication, or accept credentials in source control. It uses a Playwright storage-state file created interactively by an authorized operator.

### 1. Create an authorized storage state

Run this from a trusted workstation, not in CI, and do not commit the resulting JSON file:

```bash
npx playwright codegen \
  --save-storage=/tmp/servicewriter-vercel-auth.json \
  https://service-writer-final.example.com/login
```

Complete the normal Vercel Protection login and application login in the opened browser. Close the browser after the authenticated landing page is visible. Review the file path permissions and delete it when testing is complete.

If Vercel Protection and application login use separate domains, first obtain an authorized Vercel session in the deployment URL, then complete the application login. The storage state must contain the cookies/local-storage values required by the actual deployment.

### 2. Run the smoke test

Use the committed script:

```bash
SMOKE_STORAGE_STATE=/tmp/servicewriter-vercel-auth.json \
SMOKE_PATHS='/,/dashboard,/appointments,/customers' \
VERCEL_DEPLOYMENT_URL='https://service-writer-final.example.com' \
npm run smoke:vercel
```

Replace the URL and route list with the canonical deployment and routes that are known to exist in the deployed application. The script checks for SSO redirects, HTTP errors, a mounted React root, page errors, console errors, hidden bodies, and horizontal overflow.

### 3. API bridge verification

For protected API routes, use the browser-authenticated context rather than placing a bearer token in a shell history or CI log. Add only non-destructive GET checks to `SMOKE_PATHS` when the route is a page. For write routes, use a dedicated staging workspace and an explicit test fixture; do not run conversion, payment, message-send, delete, or refund operations against production as part of a generic smoke test.

A production-safe minimum is:

| Check | Expected result |
|---|---|
| Public landing page | HTTP 200, React root mounted, no console/page errors. |
| Authenticated dashboard | Normal application page, not Vercel SSO or application login. |
| Workspace selection | Authenticated user resolves to an expected workspace. |
| Read-only customer/appointment route | HTTP 200 and no cross-workspace data visible. |
| API health route | Expected health response according to the deployed Next.js route contract. |
| Logout/session expiry | User returns to the expected login boundary without stale protected data. |

## Deployment-target decision record

Use `service-writer-final` as the canonical production target only after the Vercel project owner confirms the custom domain, root directory, environment variables, and deployment protection settings. The repeated success pattern for this target and repeated failure pattern for `servicewriter.xyx` strongly indicate that `servicewriter.xyx` is not the healthy production deployment.

Do not delete or disable `servicewriter.xyx` until its DNS, domain assignment, project ownership, and rollback role are confirmed. First remove its production promotion trigger or mark it as non-production, then document the change.

## Security requirements

Never commit `.env` files, storage-state JSON, service-role keys, provider authentication tokens, or webhook signing secrets. Do not print environment values in diagnostics. Rotate any credential that may have appeared in logs or screenshots. Use staging credentials for pull requests and production credentials only in protected Vercel Production environments.
