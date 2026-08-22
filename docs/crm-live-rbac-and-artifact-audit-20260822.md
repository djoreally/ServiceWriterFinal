# CRM Live RBAC and Artifact Audit — 2026-08-22

## Deployment smoke result

The ready production deployment is `https://service-writer-final.vercel.app` and is serving commit `a7583ae`. The live browser session loaded `/crm` successfully and showed the CRM shell, navigation group, and page title. The page remained at `Loading CRM workspace…` because the authenticated demo account `demo@servicewriter.app` has no `workspace_members` rows in the canonical database and the browser session has no selected workspace ID.

The repository smoke harness reported HTTP 200 and root mounting for `/crm`, but failed its body-visibility assertion (`body is hidden`). This should be treated as a smoke-harness/application-state issue requiring follow-up, not as proof that the CRM route is unavailable. The browser view showed the page visibly rendered.

## Live CRM RLS

All eleven CRM tables are present with Row Level Security enabled: `crm_permissions`, `crm_profiles`, `crm_activities`, `crm_leads`, `crm_tasks`, `crm_segments`, `crm_campaigns`, `crm_campaign_members`, `crm_loyalty_accounts`, `crm_loyalty_ledger`, and `crm_audit_events`.

The policy design is capability-based and workspace-scoped. Select policies use `has_crm_capability(workspace_id, 'crm.view')`. Profile writes require `crm.profile.write`; activities and tasks require `crm.task.write`; leads require `crm.lead.write`; segments require `crm.segment.manage`; campaign drafting requires `crm.campaign.draft`; campaign members require `crm.campaign.send`; loyalty writes require `crm.loyalty.adjust`; and permissions management is limited to workspace owners/admins through `has_workspace_role`.

There are no broad anonymous policies on these CRM tables. Audit events and the loyalty ledger do not grant authenticated delete privileges. Campaigns and profiles also do not expose broad delete policies.

## Live RPC review

`public.has_crm_capability(target_workspace_id uuid, required_capability text)` exists with the exact signature used by the Next.js bridge. It is `STABLE SECURITY DEFINER` with `search_path=public`, and is executable by `authenticated`. Its role shortcut grants CRM access to active `owner`, `admin`, and `manager` memberships; otherwise it checks `crm_permissions` for the requested workspace and capability.

Supabase security advisors flag this function because signed-in users can execute a SECURITY DEFINER function through the exposed public RPC endpoint. This is an intentional dependency of the current RLS design, but it is a production hardening item. The function should either move behind a non-exposed schema/API-only authorization path or be reviewed to ensure its boolean oracle and permission lookup are acceptable. The permission branch also does not independently require an active workspace membership, so stale permission rows should be addressed with a membership constraint, cleanup trigger, or an explicit active-membership check.

Other current Supabase security advisories concern existing `public` security-definer workspace/customer helper functions, `touch_service_records_updated_at` having a mutable search path, `citext` installed in `public`, and leaked-password protection being disabled. These are not introduced by the CRM route implementation but remain production-readiness findings.

## Untracked artifact classification

There are 61 Git-untracked paths. The main groups are:

| Group | Approximate size | Disposition | Risk |
|---|---:|---|---|
| `data/moms-mobile-oil-change/` | 1.3 MB | Cleaned/import-preparation CSVs, review files, profiles, and reports | Contains customer/vehicle/appointment PII; do not commit to a public repository. |
| `docs/` audit and backup evidence | 452 KB | SQL/JSON queries, backup inventories, migration payloads, release notes, and smoke evidence | Review for secrets and production identifiers before any commit; backup SQL may be sensitive. |
| `scripts/` audit and processing utilities | 196 KB | Python utilities for data cleaning, RLS audits, and backup generation | Generally source code, but inspect before committing because some scripts target production data. |
| `.tmp_audit_post.py`, `.tmp_post_rls.json` | approximately 26 KB | Temporary audit/posting artifacts | Keep out of version control; delete after confirming no longer needed. |

The content scan found secret-shaped terms in backup and audit documentation, but did not print or expose values. The customer data files include cleaned and review CSVs and should be handled as restricted PII. None of these untracked artifacts were included in the CRM commit.


## Hardening deployment status

After commit `96789b87` was pushed, the Vercel project showed the new deployment as **Building** while the prior `a7583ae` deployment remained the active Ready production deployment. The updated frontend cannot be live-smoke-tested until the new deployment changes from Building to Ready.
