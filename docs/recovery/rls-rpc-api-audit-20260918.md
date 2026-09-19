# RLS + RPC API Layer Forensic Audit — 2026-09-18

Status: **RED — active remediation**

Production project audited: `rjfbrfognxqkyhdrpibx`.

## Scope

This is a separate security/API-boundary audit covering:
- every public-schema table's RLS enablement, Data API grants, and policy count;
- policy role targeting, USING/WITH CHECK boundaries, workspace/customer scoping;
- every callable RPC, SECURITY DEFINER boundary, anonymous execution, authenticated execution, and trigger-only helper;
- public-booking/token RPCs vs internal RPCs;
- workspace helper functions used by RLS;
- direct Data API exposure that exists even when RLS blocks rows.

## Immediate findings

### Critical / high priority

1. **Accidental RPC exposure through PostgreSQL PUBLIC EXECUTE.**
   Multiple internal functions were callable by `anon` because function EXECUTE defaults to PUBLIC. Direct `REVOKE ... FROM anon` was insufficient while PUBLIC retained EXECUTE. Remediated by revoking PUBLIC and granting explicit roles.

2. **Anonymous SECURITY DEFINER surface.**
   Supabase advisor reported 27 anonymous-executable SECURITY DEFINER functions. Public booking/profile/catalog/token-management functions are intentionally anonymous and require endpoint-specific abuse review. Internal helpers are not allowed to remain anonymous.

3. **Reward lifecycle RPCs exposed anonymously.**
   `apply_booking_reward`, `cancel_booking_reward`, and `redeem_booking_reward` were callable anonymously even though they mutate loyalty/payment/appointment state. Anonymous EXECUTE has been revoked. `reserve_booking_reward` and `lookup_booking_rewards` remain under review because the public booking UX may require them, but email possession alone is a weak authorization boundary.

4. **Technician transition RPC exposed anonymously.**
   `technician_transition_job_v1` was SECURITY DEFINER and anon executable. Its body checks `auth.uid()`, but it should never have been an anonymous API endpoint. Anonymous EXECUTE revoked.

5. **Workspace authorization helper RPCs exposed anonymously.**
   `is_workspace_writer` and `is_workspace_financial_writer` were SECURITY DEFINER and anon executable. Anonymous EXECUTE revoked.

### RLS findings

- All inspected public application tables have RLS enabled.
- Four RLS-enabled tables have no policies:
  - `billing_price_catalog`
  - `google_insights_connections`
  - `provider_connection_secrets`
  - `technician_job_transition_idempotency`
  This is not automatically a vulnerability. Three are intentionally inaccessible to clients; `billing_price_catalog` requires product-intent classification before a policy is added.

- Many tables still have broad SQL grants to `anon`; RLS currently blocks access because their policies are authenticated/workspace-scoped. This is defense through RLS rather than least-privilege grants. We are auditing these grants separately before revoking them so public booking is not broken.

- Several older policies were created without an explicit `TO authenticated` role, so they apply to PUBLIC and rely on helper predicates returning false for anonymous callers. This is functionally restrictive but unnecessarily broad and creates advisor noise/attack surface. These policies should be recreated with explicit role targets where they are not public-booking policies.

### Public booking boundary under active review

Anonymous access is expected for some booking operations, but each SECURITY DEFINER endpoint must bind mutations to a non-forgeable capability. Current patterns include:
- booking slug + newly-created appointment + 30-minute age window;
- management token for cancellation/reschedule;
- provider/workspace + customer email for reward lookup/reservation.

The appointment-id + slug + age pattern limits scope but appointment UUID knowledge is still acting as part of the capability. Reward lookup/reservation based on customer email requires additional privacy/abuse review.

## Remediation already applied

- Removed anonymous execution from:
  - workspace writer/financial-writer helpers
  - technician job transition
  - reward apply/cancel/redeem
  - invoice/work-order/internal inventory/service-package RPCs
- Removed direct client execution from trigger-only helper functions.
- Corrected inherited PUBLIC EXECUTE and explicitly granted authenticated/service-role where intended.

Commits:
- `b24425a1` — restrict accidental RPC API surface
- `35b1dd31` — revoke inherited PUBLIC RPC execution

## Remaining audit gates

1. Classify every remaining anonymous RPC as PUBLIC_REQUIRED / TOKEN_REQUIRED / INTERNAL_ONLY.
2. Inspect every public booking mutator for IDOR/BOLA, replay, enumeration, rate/abuse exposure, and field-overwrite scope.
3. Audit reward lookup/reservation privacy boundary.
4. Recreate broad PUBLIC-targeted RLS policies with explicit roles where appropriate.
5. Audit all table grants against actual client access requirements.
6. Audit SECURITY DEFINER functions callable by authenticated users for explicit authorization checks.
7. Audit views for security_invoker or revoked client access.
8. Audit storage buckets/policies.
9. Re-run Supabase security advisor after every remediation batch.
10. Produce final zero-unclassified-endpoint matrix before GREEN.
