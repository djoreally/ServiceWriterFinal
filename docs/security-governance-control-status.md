# Security and Governance Control Status

## Scope and conclusion

This document records repository-verifiable controls for Service Writer. It is not a SOC 2 report, certification, legal opinion, or proof that controls operate effectively in production. Production effectiveness requires dated evidence from the hosting, database, identity, email, payment, monitoring, and incident-management systems.

The repository contains useful control foundations: tenant-aware authorization code and RLS tests, structured operational audit events, environment and release verifiers, migration checks, backup/rollback runbooks, consent handling, and account-deletion coverage tests. These controls improve readiness, but they do not establish SOC 2 compliance by themselves.

## Implemented and locally verifiable

| Area | Repository evidence | Boundary |
|---|---|---|
| Audit event hygiene | `src/server/audit.ts` validates event names and correlation IDs, drops common PII/credential metadata keys, bounds metadata, and avoids logging database error text. | Audit writes are currently used by a limited set of server routes; coverage is not application-wide. |
| Release integrity | `scripts/verify-release-readiness.mjs` validates migration names, clean-tree state, HTTPS deployment URLs, optional expected SHA, and blocks production when backup, rollback, observability release, or approval evidence is absent. | Supplied evidence identifiers are assertions; the script cannot prove the external evidence exists or is valid. |
| Environment separation | `scripts/verify-env-manifest.mjs` reports presence without values, rejects secret-like public variables, checks HTTPS/CORS rules, checks Supabase URL/project alignment, and blocks production demo login. | Vercel scope and actual provider permissions require an authenticated operator review. |
| Erasure wiring | `src/lib/__tests__/gdpr-deletion-coverage.test.ts` checks that identified tables occur in soft- and hard-delete workflows. | Legal retention exceptions, identity verification, execution evidence, Storage/Auth deletion, and downstream processors require operational validation. |
| Backup/restore | `docs/backup-verification-evidence.md` and `docs/production-rollback-plan.md` define evidence and stop conditions. | The repository contains no proof of a recent full restore rehearsal. A catalog copy is not a complete disaster-recovery backup. |

## Required production evidence before a compliance claim

1. A control owner, frequency, evidence location, and exception procedure for each in-scope control.
2. Immutable or access-restricted audit retention, alerting on audit write failures, and route-by-route coverage of privileged and sensitive mutations.
3. A dated restore rehearsal covering Postgres, Supabase Auth, Storage objects, secrets/configuration reconstruction, measured RPO/RTO, and tenant-integrity checks.
4. A reviewed data inventory and retention schedule by record category, legal basis, deletion/anonymization method, processor, and financial/legal hold exception.
5. Production evidence for least privilege, MFA, access reviews, password protections, incident response exercises, vulnerability management, dependency remediation SLAs, and vendor management.
6. Independent auditor examination for any SOC 2 report. Product code and internal checklists alone cannot produce certification.

## Release command contract

For staging, missing operator evidence is reported as warnings. For production, the release verifier fails unless `BACKUP_VERIFIED_AT`, `ROLLBACK_PLAN_ID`, `SENTRY_RELEASE`, and `RELEASE_APPROVAL_ID` are supplied in the protected execution environment. `RELEASE_SHA`, when supplied, must equal the checked-out commit. Values must be evidence references, never credentials or customer data.
