# Production Rollback Plan

## Release record

| Field | Value |
|---|---|
| Application | ServiceWriterFinal |
| Release commit | `a528cd07f246980ee0f1089c717cc72e041e5f62` |
| Database project | Supabase `rjfbrfognxqkyhdrpibx` |
| Rollback plan ID | `SWF-ROLLBACK-<release-id>` |
| Incident/change owner | `<named deployment owner>` |
| Decision authority | `<named release owner>` |
| Status | **Draft pending owner approval and restore rehearsal** |

## Stop conditions

Stop the rollout and enter incident mode if authentication bypass, cross-workspace data exposure, service-role exposure in browser assets, duplicate financial mutation, migration verification failure, sustained webhook signature failure, payment reconciliation drift, or inability to establish a safe recovery point is observed. Freeze new destructive operations and preserve request correlation IDs, deployment SHA, migration version, and provider event identifiers.

## Preferred rollback sequence

1. Record the incident, affected release SHA, deployment URL, migration version, first observed time, customer/workspace scope, and current operator.
2. Disable the affected feature flag or route at the edge/application layer. For messaging and payments, stop outbound sends or captures before changing database state.
3. Confirm whether the database change is additive. For additive changes, deploy a corrective migration that restores the prior behavior, preserves existing rows, and is reviewed by the database owner. Never run an improvised destructive `DROP`, truncate, or broad delete as a rollback.
4. If application code must revert, promote the last known-good immutable commit and set the Vercel deployment alias to that approved deployment. Keep the database schema forward-compatible with the reverted code.
5. If data integrity is affected or a corrective migration is unsafe, restore to the verified Supabase PITR/backup point recorded in `docs/backup-verification-evidence.md` under the database owner’s change record. Validate schema, RLS, tenant counts, orphan counts, and key workflow reads before reopening traffic.
6. Run public health checks, authenticated role guards, cross-workspace RLS tests, invitation lifecycle checks, webhook signature tests, and payment/messaging reconciliation checks.
7. Re-enable traffic gradually only after the release owner records a go decision and the incident owner confirms monitoring coverage.

## Recovery evidence

| Evidence | Required value |
|---|---|
| `ROLLBACK_PLAN_ID` | `<approved identifier>` |
| Last known-good commit | `<commit SHA>` |
| Last known-good Vercel deployment | `<deployment URL or ID>` |
| Supabase recovery point | `<PITR timestamp/export ID>` |
| Corrective migration | `<migration filename or N/A>` |
| Validation run | `<CI/E2E/RLS run link>` |
| Owner approval | `<ticket/sign-off link>` |

The repository’s `npm run verify:release` command reports a warning until `ROLLBACK_PLAN_ID` is supplied. It does not execute rollbacks or restore databases automatically.
