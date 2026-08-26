# Service Writer Production-Readiness Audit

**Repository:** `djoreally/ServiceWriterFinal`  
**Branch:** `repair/predeploy-build-gate-20260825`  
**Audit commit:** `aa18ef6bc`  
**Author:** Manus AI  
**Audit date:** 2026-08-25

## Executive conclusion

The original **15 failing Jest tests have been resolved**. The complete suite now reports **110 passed suites, 1 intentionally skipped suite, 567 passed tests, and 3 skipped tests**. The Next.js production build, standalone TypeScript check, lint gate, and available browser smoke tests also pass.

The application is **not yet production-ready** from this sandbox’s evidence. The remaining blockers are predominantly release configuration and environment provisioning rather than compilation. The most immediate blocker is that the production environment has not been populated with the required Supabase, application URL, CORS, and server service-role settings. A live deployment URL, database migration verification, backup/restore evidence, rollback reference, and authenticated end-to-end credentials are also absent.

The changes were committed and pushed to the repair branch. The final working tree is clean.

## Test failures fixed

The 15 failures fell into three groups. Several tests referenced a removed `apps/web-next` path or an obsolete Jest alias; those were updated to the current `app` route and source layout. The dashboard reporting failure exposed a real application defect: pending payments associated with cancelled appointments were not excluded, and legacy customer/refund fields were not preserved during normalization. The remaining failures were caused by test fixtures that did not provide the current tenant-scoped workspace contract or the canonical dispatch read model.

The application and test changes now do the following:

| Area | Resolution |
|---|---|
| Quote-conversion integration test | Updated stale route and server alias references. |
| Dashboard reporting | Excludes pending payments for cancelled appointments and preserves legacy normalized fields. |
| Appointments page | Supports canonical and legacy schedule shapes, preserves service titles, and excludes fleet-linked records from the retail appointment boundary. |
| Technician dashboards | Reads `dispatch_operational_jobs_v1` when available and retains a direct-table fallback; normalizes van and fleet metadata safely. |
| Technician OS | Restores canonical workspace-owner and snapshot RPC reads with the existing fallback path. |
| Workspace test fixtures | Adds active workspace memberships and canonical dispatch read-model rows. |
| Dispatch E2E tests | Corrects nullable unassignment semantics and tests the documented Service Writer/Fleet boundary instead of asserting retired Fleet behavior. |
| Production integration gate | Removes stale Vite-prefixed Supabase requirements; the runtime is Next.js and uses `NEXT_PUBLIC_*`. |

## Validation evidence

| Check | Result | Meaning |
|---|---:|---|
| `npm test -- --runInBand` | **Pass** | 110 suites passed; 1 suite and 3 tests are intentionally skipped. |
| `npm run typecheck` | **Pass** | No TypeScript errors. |
| `npm run build` | **Pass** | Next.js compiled, generated 26 static pages, and completed optimization. |
| `npm run lint` | **Pass** | 0 errors and 22 warnings. |
| `git diff --check` | **Pass** | No whitespace errors. |
| Playwright smoke suite | **3 passed, 2 skipped** | Public/incomplete-invitation coverage passed; authenticated invitation cases require real storage state and workspace credentials. |
| Production environment gate | **Fails as expected** | Required production variables are absent in the audit sandbox. |
| Production integration gate | **Fails as expected** | Required production variables are absent in the audit sandbox. |
| Release-readiness gate | **Warnings remain** | Backup, rollback, Sentry release, demo-login, and live deployment evidence were not supplied during the audit. |

## Core application blockers and risks

This section excludes optional third-party service provisioning and focuses on whether the application itself can be promoted and operated safely.

### 1. Required production environment is not provisioned

The production environment gate reports these required variables as missing:

| Variable | Required for | Current evidence |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/API Supabase endpoint | Missing |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser authentication and data access | Missing |
| `NEXT_PUBLIC_SUPABASE_PROJECT_ID` | Canonical project identity and fallback resolution | Missing |
| `NEXT_PUBLIC_API_BASE_URL` | Browser-to-Next API base URL | Missing |
| `NEXT_PUBLIC_APP_URL` | Canonical public URL and callback/origin construction | Missing |
| `NEXT_PUBLIC_CORS_ORIGIN` | API CORS policy | Missing |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only administrative Supabase operations | Missing |

Until these are configured in the Vercel Production environment, the client deliberately falls back to disconnected development mode and authenticated data flows cannot operate against the real tenant database.

### 2. Database migration and schema application are not evidenced

The repository contains **45 migration files**, and their filenames pass the structural naming check. However, this audit did not have credentials to confirm that those migrations are applied to the production Supabase project. The deployment depends on canonical workspace tables, dispatch RPCs, invitation routes, payment tables, and the operational read model. The generated Supabase types include `dispatch_operational_jobs_v1`, but no checked-in migration definition for that view was found during the audit. The application now has a direct-table fallback, but production must still verify the actual view/RPC/table surface and RLS policies against the target project.

This is a release blocker until the migration set is applied or independently certified against the exact production project.

### 3. Live deployment verification has not been run

`verify:deployment` refuses to run without an HTTPS `VERCEL_DEPLOYMENT_URL`. No live URL was available in the sandbox, so HTTP status, React root rendering, API health, redirects, and Vercel Protection behavior remain unverified. After deployment, the team must run the verifier against the actual preview or production URL and separately execute authenticated smoke coverage.

### 4. Backup and rollback evidence is missing

The release gate reports no `BACKUP_VERIFIED_AT` and no `ROLLBACK_PLAN_ID`. These are not compilation issues, but they are operational release blockers for a data-writing application. Before promotion, record a restorable Supabase backup/PITR point and attach the approved rollback or restoration procedure to the release.

### 5. Authenticated browser coverage is incomplete

The Playwright suite contains five tests. Three passed in the sandbox, while two authenticated invitation-center tests were skipped because `E2E_AUTH_STORAGE_STATE` and `E2E_WORKSPACE_ID` were not supplied. This does not prove a runtime defect, but it leaves authorization, workspace isolation, and invitation rendering unverified against a real deployment. Those tests should run in CI or as a pre-production smoke job with a restricted test account and non-production workspace.

### 6. Dependency security audit fails

`npm audit --omit=dev` reports **24 production dependency vulnerabilities: 14 high, 8 moderate, and 2 low; no critical vulnerabilities**. The affected dependency graph includes packages such as Next.js, Vite, React Router, `xlsx`, `sharp`, and transitive Babel/build packages. At least one high-severity `xlsx` advisory reports no automatic fix in the current lockfile state. This should be triaged before production, with upgrades, package replacement, or a documented risk acceptance for any issue that cannot be remediated immediately.

### 7. Lint is non-blocking during Next builds

The separate lint command passes with zero errors, but Next.js is configured with `eslint.ignoreDuringBuilds: true`. The current 22 warnings are not a deployment blocker, but future releases can introduce lint errors without failing `next build`. The production pipeline should run `npm run lint` as an explicit required step, or lint should be re-enabled during builds after the warning debt is reduced.

### 8. Generated Supabase client types are stale or incomplete

The browser client is exported as `any` because the checked-in generated `Database` type does not yet describe all canonical workspace tables. This allowed the build to pass but reduces compile-time protection at the data boundary. Production behavior is guarded by runtime API schemas and RLS, but the type surface should be regenerated from the final Supabase schema before the application is treated as fully hardened.

### 9. Product-scope boundary must be explicit

Core Service Writer appointment dispatch, technician dashboards, appointment lifecycle, quotes, reporting, and invitation access are covered by passing tests. Fleet dispatch entry points intentionally reject with a separation message, and the updated tests now assert that boundary. If the production launch promises Fleet scheduling or Fleet assignment inside this application, Fleet is still a blocker and requires a separate implementation and integration test plan. If Fleet is a separate product, the launch documentation and navigation should make that boundary explicit.

## Third-party integrations

The following integrations are intentionally separated from the core application findings because their availability depends on external accounts, secrets, provider configuration, and deployed webhooks or Edge Functions.

| Integration | Code surface | Required configuration | Current behavior / production impact |
|---|---|---|---|
| **Supabase** | Browser client, middleware, Next API routes, RPCs, storage, realtime, Edge Function URLs | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY` | Core dependency, not optional. Missing production values prevent authenticated operation. The app includes a same-project URL/key guard. |
| **Resend** | Invitation resend route, Resend adapter, webhook route | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SIGNING_SECRET` | Optional provider adapter with signed webhook verification. Invitation email delivery is unavailable until configured. |
| **Twilio** | SMS adapter, inbound and status webhook routes | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Optional SMS provider. SMS sending and inbound/status processing require credentials and valid webhook configuration. |
| **Stripe** | Payment routes and frontend payment configuration | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY` | Optional external payment provider in this Final branch. Manual payment recording is implemented; external provider actions return HTTP 501 when not configured. Validate whether Stripe is part of the launch promise. |
| **Sentry** | Server/client observability and error reporting | `SENTRY_DSN`, optionally `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_RELEASE` | Server DSN is present in the audit shell, but browser DSN, auth token, and release tag are not evidenced. Error capture may be incomplete and release correlation is not ready. |
| **PostHog** | Browser identity/analytics components | `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | Optional analytics. Not configured in the audit environment; product analytics will be absent until provisioned. |
| **Mapbox** | Geocoding, booking address display, command maps | `VITE_MAPBOX_PUBLIC_TOKEN` and/or `NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN` depending on component | UI explicitly degrades when the token is missing. Address/map features require a valid public token and domain restrictions. |
| **CARFAX** | Settings, export preparation, provider-sync and service-history queries | CARFAX credentials/configuration referenced by the admin UI and provider sync paths | Settings and feed preparation exist, but `activateCarfaxShop` explicitly throws “provider is not configured” and `recordCarfaxExport` is currently a no-op. CARFAX activation, delivery confirmation, and export audit logging are not production-complete. |
| **Provider sync / AI Edge Functions** | Supabase Edge Function URLs such as `provider-sync-manager`, `sync-appointment-to-provider`, and `ai-assistant` | Correct Supabase project, deployed functions, function secrets, and RLS/auth behavior | These are not independently verified in the sandbox. They must be deployed and smoke-tested in the target Supabase project. |
| **Fleet application boundary** | Fleet dispatch and scheduling command modules | Separate Fleet application/provider boundary | Fleet assignment functions intentionally reject inside Service Writer. This is acceptable only if Fleet is explicitly out of scope for this launch. |

The integration verifier was corrected so Supabase is checked using the actual Next.js `NEXT_PUBLIC_*` names instead of stale `VITE_SUPABASE_*` names. Optional provider variables remain optional in the verifier, but any provider represented in launch marketing or navigation must be configured and smoke-tested before claiming that capability is live.

## Required release actions

First, configure and validate the required production environment variables in Vercel and the target Supabase project. Confirm that the publishable key belongs to the same Supabase project as the URL, and keep the service-role key server-only. Second, apply and verify all database migrations against the exact production project, including workspace/RLS policies, dispatch RPCs, invitation data, payment data, and the operational read model. Third, provide an HTTPS deployment URL, execute the deployment verifier, and run authenticated browser smoke tests with a restricted test account.

Fourth, record backup/PITR verification and an approved rollback plan. Fifth, triage the 24 production dependency vulnerabilities and decide which must be upgraded before launch. Sixth, make a written product decision on Fleet, CARFAX activation, external Stripe payments, outbound email/SMS, and analytics: either configure and verify each promised capability or remove it from the production promise and navigation until it is implemented.

## Change and repository record

The repair was pushed to:

`https://github.com/djoreally/ServiceWriterFinal/tree/repair/predeploy-build-gate-20260825`

Commit:

`https://github.com/djoreally/ServiceWriterFinal/commit/aa18ef6bc`

The final working tree was clean after the commit. The application is **buildable and testable**, but promotion should remain blocked until the environment, schema, operational recovery, security audit, live deployment, and promised third-party capabilities are verified.

## Evidence files

The audit was supported by the repository’s own gates and logs, including `scripts/verify-env-manifest.mjs`, `scripts/verify-production-integrations.mjs`, `scripts/verify-release-readiness.mjs`, `scripts/verify-deployment.mjs`, `.env.example`, `vercel.json`, `next.config.ts`, the Supabase client, migration filenames, the final Jest log, the final build log, the final lint log, and the Playwright configuration and test results.
