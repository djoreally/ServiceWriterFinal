# Quote Conversion Production Deployment Checklist

## Scope

This checklist covers rollout of the workspace-scoped quote-conversion schema, the transactional `convert_quote_to_service_record_v1` RPC, the Next.js route `POST /api/v1/quotes/:id/convert`, and the concurrent idempotency test coverage.

> **Do not treat a green application build as proof that production data is safe.** Run the read-only verification script against the production project after applying the migration and before enabling conversion for all users.

## Required environment variables

| Variable | Required by | Production value and handling |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser client, server client, middleware | The production Supabase project URL. Safe to expose to the browser. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser client, server client, middleware | The Supabase publishable/anon key. Safe to expose to the browser when RLS is correctly configured. |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted server jobs only | Production service-role key. Store only in Vercel server-side environment variables; never prefix it with `NEXT_PUBLIC_`, commit it, or send it to clients. |
| `NEXT_PUBLIC_APP_URL` | Next.js application links and deployment configuration | Canonical HTTPS production URL. |
| `NEXT_PUBLIC_CORS_ORIGIN` | API CORS response headers | The exact frontend origin permitted to call the API. Do not use `*` when credentials are enabled. |

The quote-conversion route itself requires only the Supabase client variables and authenticated Supabase session. Resend, Twilio, Stripe, and other adapter variables are not required for the conversion transaction unless a separate post-conversion notification or invoice workflow is enabled in the same deployment.

For CI verification, additionally provide:

| Variable | Purpose |
|---|---|
| `QUOTE_CONVERSION_WORKSPACE_ID` | Optional workspace filter for a targeted audit. |
| `QUOTE_CONVERSION_PAGE_SIZE` | Optional REST page size for the audit script; default is 500 and maximum is 1,000. |
| `QUOTE_CONVERSION_FAIL_ON_WARN` | Set to `1` when warnings should fail the audit job. |
| `SUPABASE_URL` | Optional alias accepted by the audit script; otherwise it uses `NEXT_PUBLIC_SUPABASE_URL`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Read-only audit access through the Supabase REST API. Use a short-lived CI secret where supported. |

## Pre-deployment gates

| Gate | Required evidence |
|---|---|
| Source control | Migration, API route, command migration, tests, and checklist are committed and pushed. |
| Database backup | Confirm a recoverable Supabase backup or point-in-time recovery window before applying the migration. |
| Migration review | Review `supabase/migrations/20260821171500_quote_conversion_schema.sql` and `20260821172000_quote_items_rls.sql` against the production schema. |
| Workspace backfill | Confirm every existing quote and quote item can be assigned to one workspace. The migration intentionally fails closed when ownership remains null. |
| RPC review | Confirm the function uses `security invoker`, `search_path = public`, explicit workspace checks, quote row locking, and idempotency constraints. |
| RLS review | Confirm quote items, conversion records, and service-record line items have workspace-member read policies and operator write policies. |
| Application tests | Full Jest, strict typecheck, Next.js production build, and the quote-conversion concurrency integration suite are green. |
| Deployment configuration | Confirm Vercel Root Directory points to `apps/web-next` and production environment variables are configured for the Production target. |

## Database rollout

1. Put quote conversion behind a feature flag or restrict access to an internal operator cohort while the first production audit is running.
2. Apply the primary migration through the approved Supabase migration pipeline. Do not paste the SQL into an ad hoc production console without capturing the migration in source control.
3. Apply the follow-up RLS migration if the deployment target has already received the primary migration without the quote-item policies.
4. Confirm the new relations, indexes, constraints, enum types, policies, and RPC exist in the production database.
5. Run `python3 scripts/verify_quote_conversion_migration.py` with the production URL and service-role key from a secure shell or CI job. Save the JSON output as a deployment artifact.
6. Do not enable broad rollout if the audit reports any `error` finding. Investigate warnings, especially converted records with no line items, before proceeding.

## Application rollout

1. Deploy the Next.js application with the route at `/api/v1/quotes/[id]/convert`.
2. Verify the deployment exposes the route as a dynamic function and does not statically cache authenticated conversion responses.
3. Verify a signed-in operator can load a quote from the correct workspace and a non-member receives `403 forbidden`.
4. Convert one controlled test quote with a stable idempotency key. Confirm the response contains one conversion ID and one service-record ID.
5. Repeat the exact request. Confirm the same IDs are returned and no additional service record is created.
6. Send concurrent requests using the same idempotency key from a controlled test client. Confirm all successful responses refer to the same service record.
7. Send concurrent requests using different keys. Confirm exactly one request succeeds and the remaining request receives `409 quote_already_converted`.
8. Confirm the quote status is `converted`, the service record has the same workspace and quote IDs, and source quote items appear exactly once as line items.
9. Confirm inventory is not consumed merely by conversion; inventory reservation or deduction remains a separate workflow.

## Observability and alerting

Track the following signals during rollout:

| Signal | Expected behavior |
|---|---|
| `POST /api/v1/quotes/:id/convert` 2xx rate | Stable success rate for valid operator traffic. |
| `409 quote_already_converted` | Expected for duplicate attempts; alert only on an abnormal increase. |
| `409 quote_changed_refresh_required` | Indicates stale UI state and should be visible to the frontend. |
| 5xx conversion responses | Should remain near zero; inspect RPC errors and schema drift immediately. |
| Conversion audit count | Successful audit rows should correspond one-to-one with converted quotes. |
| Orphan line-item count | Must remain zero. |
| Cross-workspace findings | Must remain zero. |

Do not log quote customer data, quote snapshots, service-role credentials, request bodies, or idempotency keys in plaintext application logs. Log stable IDs, error codes, latency, and request correlation IDs only.

## Rollback strategy

The safest rollback is an application rollback, not an immediate destructive database rollback. If the route misbehaves, disable the feature flag or revert the application deployment while retaining the additive schema and audit records. Existing converted records remain readable and auditable.

Do not drop `quote_conversions`, `service_record_line_items`, new service-record columns, or workspace ownership columns during an incident. A destructive rollback could remove evidence or break already converted records. If the migration fails before completion, restore from the database transaction failure and resolve the schema mismatch before retrying. Any destructive cleanup requires a separately reviewed migration and verified backup.

## Completion criteria

Production rollout is complete when the migration is recorded, the verification script returns `pass`, the controlled conversion and replay tests succeed, tenant-isolation checks pass, no 5xx errors are observed during the monitoring window, and the feature flag is enabled for the intended operator population.
