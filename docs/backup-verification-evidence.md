# Production Backup Verification Evidence

## Release record

| Field | Value |
|---|---|
| Application | ServiceWriterFinal |
| Supabase project reference | `rjfbrfognxqkyhdrpibx` |
| Release commit | `a528cd07f246980ee0f1089c717cc72e041e5f62` |
| Target environment | Production |
| Verification status | **Pending operator completion** |
| Evidence owner | `<named database/release owner>` |
| Verified at (UTC) | `<YYYY-MM-DDTHH:MM:SSZ>` |
| `BACKUP_VERIFIED_AT` value | `<same UTC timestamp after successful verification>` |

## Required evidence

The database owner must attach a Supabase backup/PITR reference that is restorable and was created before the release migration window. Record the backup or PITR timestamp, retention policy, export identifier if applicable, restoration target, and the person who verified it. Do not paste database credentials, connection strings, service-role keys, or customer records into this document.

| Check | Evidence to record | Result |
|---|---|---|
| Backup/PITR availability | Backup identifier or PITR timestamp, retention window, and Supabase project reference | `<PASS/FAIL>` |
| Restore verification | Temporary restore target or controlled restore test, completion timestamp, and operator | `<PASS/FAIL>` |
| Schema sanity | Migration version, expected tables/indexes/policies, and row-count/orphan checks | `<PASS/FAIL>` |
| Tenant isolation | Authenticated two-workspace RLS test result and evidence link | `<PASS/FAIL/PENDING>` |
| Recovery objective | Measured or documented RPO/RTO for this release | `<RPO/RTO>` |
| Cleanup | Temporary restore target removed or retained under an approved incident/change record | `<PASS/FAIL>` |

## Operator attestation

> I verified that the recorded backup or PITR point can be restored for Supabase project `rjfbrfognxqkyhdrpibx`, that the restore contains the expected schema required by this release, and that the recovery evidence is stored in the approved release record.

Name: `<operator>`  
Role: `<role>`  
Timestamp: `<UTC timestamp>`  
Evidence link: `<approved ticket/runbook URL>`

Until all required checks are marked `PASS`, the release gate remains blocked. The repository’s `npm run verify:release` command will report a warning when `BACKUP_VERIFIED_AT` is not supplied; it does not create or verify backups itself.
