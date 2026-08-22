# Canonical Vercel Deployment Record

## Verified deployment target

| Field | Record |
|---|---|
| Canonical Vercel hostname | `https://service-writer-final.vercel.app` |
| Repository | `djoreally/ServiceWriterFinal` |
| Branch | `main` |
| Last recorded release commit | `a528cd07f246980ee0f1089c717cc72e041e5f62` |
| Probe method | `npm run verify:deployment` |
| Recorded probe result | **PASS** for `/`, `/login`, and `/team/join` with HTTP 200 and a React root marker |
| API health URL | `<set NEXT_API_HEALTH_URL if the API is deployed separately>` |
| Vercel project ID | `<operator to confirm in Vercel>` |
| Production custom domain | `<operator to confirm or mark none>` |
| Verification status | **URL verified; project ownership and production alias pending operator confirmation** |

The alternate hostname `https://servicewriterfinal.vercel.app` was previously observed as a Vercel `DEPLOYMENT_NOT_FOUND` response and must not be used as the production target unless the deployment owner explicitly reassigns and verifies it.

## Required Vercel evidence

The deployment owner must confirm that the canonical hostname belongs to the intended Vercel project, that the project’s Root Directory points to the correct application surface, and that Preview, Staging, and Production environment variables are scoped correctly. Record the deployment ID, deployment-created timestamp, Git SHA shown by Vercel, domain/alias mapping, and the result of the production health probe.

| Check | Command or evidence | Result |
|---|---|---|
| Public URL | `VERCEL_DEPLOYMENT_URL=https://service-writer-final.vercel.app npm run verify:deployment` | `<PASS/FAIL>` |
| Deployment identity | Vercel deployment details showing project, branch, and Git SHA | `<link/result>` |
| API bridge | `NEXT_API_HEALTH_URL=https://<api-origin>/api/v1/health` plus deployment verifier | `<PASS/FAIL/N/A>` |
| Auth protection | Authorized smoke-test storage state and `/api/v1/identity` result | `<PASS/FAIL/PENDING>` |
| Environment scope | Vercel variables reviewed for Preview/Staging/Production | `<PASS/FAIL/PENDING>` |
| Rollback alias | Last known-good deployment ID and alias procedure | `<deployment ID/procedure>` |

## Production environment command

Run only from an approved release environment after the deployment owner confirms the URL:

```bash
VERCEL_DEPLOYMENT_URL=https://service-writer-final.vercel.app \
DEPLOYMENT_PATHS=/,/login,/team/join \
NEXT_API_HEALTH_URL=https://<api-origin>/api/v1/health \
npm run verify:deployment
```

Do not add credentials to the command line. If Vercel Protection returns a redirect, use the approved authenticated smoke-test storage state rather than weakening protection. The deployment URL is not sufficient by itself to prove that authenticated production flows or server-only environment variables are configured correctly.
