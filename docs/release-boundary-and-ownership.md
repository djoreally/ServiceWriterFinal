# Phase 0 Release Boundary and Ownership Decision Record

**Status:** Approved for implementation planning  
**Repository:** `djoreally/ServiceWriterFinal`  
**Primary branch:** `main`  
**Commit author:** `Djor Eally <djoreally@gmail.com>`

## Canonical systems

| System | Canonical target | Role |
|---|---|---|
| Source repository | `djoreally/ServiceWriterFinal` | Source of truth for the preserved Vite frontend, Next.js API bridge, migrations, tests, and deployment workflows. |
| Frontend deployment | Vercel project `service-writer-final` | Canonical frontend production candidate. Repeated successful deployment records were observed for this target. |
| Secondary deployment | Vercel project `servicewriter.xyx` | Non-canonical until ownership and rollback purpose are confirmed. Repeated failed deployment records were observed. |
| Database | Supabase project configured by production environment | Must be explicitly confirmed against Vercel Production before launch. |
| CI | GitHub Actions workflow `.github/workflows/ci.yml` | Required release gate once the GitHub account billing lock is cleared. |

## Architecture decision

The immediate release architecture is a **coordinated two-surface deployment**: the preserved Vite frontend remains the browser application, and the Next.js application under `apps/web-next` serves the server-side API bridge. The frontend must call the API through an explicit production `VITE_API_BASE_URL`; the API must validate Supabase sessions, workspace membership, and role permissions independently of frontend guards.

The long-term architecture may consolidate the browser application into Next.js, but that is not a prerequisite for the first controlled live test. No production launch may assume that a Vite static deployment automatically serves the Next.js API routes.

## Initial controlled-release scope

The first live release may expose authenticated read and low-risk operational workflows after staging certification. The following remain disabled or restricted until their specific acceptance tests pass:

- Broad workspace invitations.
- Live payment capture, refunds, and payment-link actions.
- Outbound SMS and email sends outside provider sandbox or approved canary recipients.
- Destructive deletes and irreversible administrative actions.
- Unverified offline synchronization for production technicians.
- Customer self-service actions that alter financial or service state.

## Ownership

| Responsibility | Owner requirement |
|---|---|
| Release approval | Named product/release owner records go/no-go decision. |
| Supabase schema and RLS | Named database owner validates migrations, backup, RLS, and restore. |
| Authentication and invitations | Named security/application owner validates Auth, role resolution, and invitation lifecycle. |
| Frontend and route access | Named frontend owner validates role navigation, responsive behavior, and API base URL. |
| Payments and messaging | Named integration owner validates Stripe, Resend, Twilio, webhooks, consent, and reconciliation. |
| Vercel and GitHub | Named deployment owner validates projects, environments, domain, CI, and rollback. |
| Incident response | Named on-call owner and escalation channel are recorded before canary. |

## Go/no-go conditions

A production canary cannot begin until the canonical Vercel project and Supabase project are confirmed, environment variables are mapped by surface, the database backup is verified, real staging RLS tests pass, authenticated smoke tests pass, the release commit passes local and remote CI, and rollback ownership is documented.

A release must stop immediately on cross-workspace data exposure, service-role exposure in a browser bundle, authentication bypass, duplicate financial mutation, failed migration verification, unexplained webhook signature failures, or an inability to roll back safely.

## Decision log

This record intentionally does not delete `servicewriter.xyx`. DNS, domain assignment, project ownership, and rollback responsibilities must be confirmed first. The `service-writer-final` target is the operational candidate because its deployment records consistently complete successfully, but final domain ownership remains a release checklist item.
