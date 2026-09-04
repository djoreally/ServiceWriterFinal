# Canonical Vercel Deployment Record

**Status:** Phase A architecture authority  
**Verified:** 2026-09-03

## Canonical production target

| Field | Certified record |
|---|---|
| Vercel project | `servicewriter.xyx` |
| Vercel project ID | `prj_LwYh6HJuUsB2LZG9eoKs23hDoJuw` |
| Repository | `djoreally/ServiceWriterFinal` |
| Production branch | `main` |
| Framework | Next.js |
| Node runtime | `24.x` |
| Production domains | `servicewriter.xyz`, `www.servicewriter.xyz`, `*.servicewriter.xyz` |
| Server API | Same deployment, `app/api/**` |
| Production Supabase | `rjfbrfognxqkyhdrpibx` |
| Tenant key | `workspace_id` |

The earlier `service-writer-final` deployment record was an historical pre-consolidation target and is **not** the current canonical production architecture. Do not use it as a release target, API origin, environment-variable authority, or rollback assumption without a new reviewed architecture decision.

## Exact-SHA evidence rule

Every release candidate must record all of the following from the same Vercel deployment:

1. Git branch and full commit SHA.
2. Vercel deployment ID and URL.
3. Project ID `prj_LwYh6HJuUsB2LZG9eoKs23hDoJuw`.
4. Framework/build success for the consolidated Next.js application.
5. Preview or production target.
6. Supabase environment binding.
7. Required smoke-test result for that release phase.

A READY deployment for another SHA does not certify the candidate.

## Verification commands

For an exact preview or production URL:

```bash
VERCEL_DEPLOYMENT_URL=https://<exact-deployment-hostname> \
DEPLOYMENT_PATHS=/,/login,/team/join \
npm run verify:deployment
```

Authenticated checks use the repository's authorized browser smoke procedure. Do not place credentials, service-role keys, or storage-state contents in command-line history or source control.

## Release evidence template

| Check | Evidence | Result |
|---|---|---|
| Git identity | Vercel metadata: branch + full SHA | `<record>` |
| Project identity | `servicewriter.xyx` / `prj_LwYh6HJuUsB2LZG9eoKs23hDoJuw` | `<PASS/FAIL>` |
| Build | Architecture prebuild + Next.js build | `<PASS/FAIL>` |
| Deployment state | Exact deployment reaches READY | `<PASS/FAIL>` |
| Supabase binding | Expected project ref and public/server variable consistency | `<PASS/FAIL>` |
| Public smoke | Release-approved public routes | `<PASS/FAIL>` |
| Authenticated smoke | Release-approved protected routes | `<PASS/FAIL/PENDING BY PHASE>` |
| Runtime errors | No unexplained architecture-level failure | `<PASS/FAIL/PENDING BY PHASE>` |

## Change control

Changing the canonical Vercel project, repository, production framework, server API location, or domain ownership is an architecture change. It must update this record, `docs/application-architecture-baseline.md`, `scripts/architecture-contract.json`, and architecture enforcement in the same reviewed PR.
