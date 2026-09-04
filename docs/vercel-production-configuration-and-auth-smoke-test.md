# Vercel Production Configuration and Authenticated Smoke Test

## Certified production target

Phase A verified the live deployment topology directly. The canonical Service Writer Vercel target is:

| Property | Certified value |
|---|---|
| Vercel project | `servicewriter.xyx` |
| Project ID | `prj_LwYh6HJuUsB2LZG9eoKs23hDoJuw` |
| Git repository | `djoreally/ServiceWriterFinal` |
| Framework | Next.js |
| Node | `24.x` |
| Production domains | `servicewriter.xyz`, `www.servicewriter.xyz`, `*.servicewriter.xyz` |
| Canonical server API | same project, `app/api/**` |
| Production Supabase | `rjfbrfognxqkyhdrpibx` |

A separate frontend/API deployment is not part of the current production architecture.

## Environment-variable mapping

There is one runtime surface and one public configuration family.

| Scope | Variables | Rule |
|---|---|---|
| Browser-visible Next.js configuration | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PROJECT_ID`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CORS_ORIGIN` | Public values only. |
| Supabase/server boundary | `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` | Server-only. |
| Transactional email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SIGNING_SECRET` | Server-only; Resend is primary transactional provider. |
| Growth/marketing email | `ENGINEMAILER_API_KEY`, `ENGINEMAILER_FROM_EMAIL`, `ENGINEMAILER_WEBHOOK_SIGNING_SECRET` | Server-only; Enginemailer owns marketing and controlled transactional fallback. |
| Other integrations | Stripe/SMS/Sentry/provider secrets | Server-only unless explicitly documented as public tokens. |

`VITE_*` variables are retired and must not be used to configure production.

## Required Vercel checks

For an exact release candidate:

1. Confirm the project is `servicewriter.xyx` and is linked to `djoreally/ServiceWriterFinal`.
2. Confirm the deployment metadata identifies the intended Git SHA and branch.
3. Confirm Vercel detects `nextjs`, Node `24.x`, `npm ci`, and `npm run build`.
4. Confirm the Next.js public variables identify the intended Supabase project.
5. Confirm server-only secrets are available only to server runtime scopes.
6. Confirm transactional email credentials are Resend and marketing credentials are Enginemailer.
7. Confirm webhook secrets match the endpoints configured at each provider.
8. Confirm `CRON_SECRET` protects internal lifecycle/push worker routes.
9. Confirm custom and wildcard Service Writer domains resolve to this project.
10. Do not promote a preview whose Git SHA differs from the certified candidate.

## Authenticated smoke-test procedure

The smoke test never bypasses application authentication or stores credentials in source control. Use the repository's committed Playwright/smoke tooling with an authorized test identity or protected storage state.

Example:

```bash
SMOKE_STORAGE_STATE=/tmp/servicewriter-auth.json \
SMOKE_PATHS='/,/dashboard,/appointments,/customers' \
VERCEL_DEPLOYMENT_URL='https://<exact-preview-url>' \
npm run smoke:vercel
```

The exact URL must be the deployment produced from the candidate SHA.

A production-safe minimum verifies:

| Check | Expected result |
|---|---|
| Public route | Expected page, no server/client exception |
| Authenticated dashboard | Authenticated application shell, correct workspace |
| Appointment/customer read | HTTP success and workspace-scoped data |
| API health/read route | Expected Next.js server response |
| Session expiry/logout | Protected data is no longer accessible |
| Browser console/network | No unexplained recurring 4xx/5xx/runtime loop |

Write, payment, refund, delete, or message-send smoke checks should use explicit controlled fixtures rather than arbitrary production records.

## Exact-SHA release rule

A Vercel deployment is evidence only when its metadata matches the candidate commit. `READY` on a different SHA does not certify the release.

For production promotion record:

- Git SHA;
- Vercel deployment ID;
- target (`preview` or `production`);
- deployment state;
- Supabase project ref;
- smoke-test result.

## Security requirements

Never commit environment files, Playwright storage-state files, service-role keys, provider API keys, webhook signing secrets, or payment secrets. Never print secret values in verification scripts. Rotate credentials that are exposed through logs, screenshots, or accidental client-visible configuration.
