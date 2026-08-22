# Production Release Readiness Checklist

## Release gate

A release is promotable only when the application commit, database migration set, environment manifest, provider configuration, observability release, backup evidence, and rollback procedure are linked to the same release record. The repository utility `npm run verify:release` performs structural checks and prints warnings for evidence that must be supplied by the deployment operator.

| Gate | Required evidence | Status rule |
|---|---|---|
| Repository | Clean working tree and immutable commit SHA | Required before promotion. |
| Database | Ordered migrations, verified backup/PITR point, expected lock duration, restoration or rollback procedure | Required before applying production DDL. |
| Supabase Auth/RLS | Provider redirects, email settings, RLS advisor review, storage/realtime scope checks, two-workspace isolation evidence | Required before enabling authenticated production traffic. |
| Vercel | Canonical project, root directory, Node version, public variables, API origin, protection settings, deployment URL | Required before production promotion. |
| Providers | Resend/Twilio signed webhooks, Stripe test/live separation and signatures, suppression and retry behavior | Required for each enabled integration. |
| Observability | Sentry release/environment, masked logs, alert owners, deployment and webhook visibility | Required before canary. |
| Certification | Role-by-role login, denied routes/mutations, customer/fleet scope, authenticated Playwright, real RLS, provider sandbox, offline/device checks | Required before broad rollout. |

## Evidence artifacts

Use the following records to complete the operator-owned release evidence: [backup verification evidence](./backup-verification-evidence.md), [production rollback plan](./production-rollback-plan.md), and [canonical Vercel deployment record](./canonical-vercel-deployment-record.md).

## Backup and rollback

Before a production migration, record `BACKUP_VERIFIED_AT` and `ROLLBACK_PLAN_ID` in the protected release environment. The backup record must identify a restorable Supabase PITR point or export and include a successful restore verification. The rollback plan must specify whether the change is reversed with an additive corrective migration or restored from backup; destructive rollback SQL must not be run as an automated generic step.

## Canary sequence

Apply additive schema changes first, validate row counts, orphan counts, duplicate counts, foreign-key consistency, and tenant mismatches, then enable new writes behind a feature flag. Run read-only verification and compare old/new totals before removing legacy writes. Stop the rollout if authentication, RLS, payment, messaging, or tenant-isolation thresholds fail.

## Deferred operator actions

The repository cannot create or verify a production backup, inspect Vercel environment scopes, or run authenticated staging tests without protected deployment access and staging credentials. Those actions remain explicit operator gates. Do not place storage-state files, service-role keys, provider secrets, or payment credentials in the repository or chat.
