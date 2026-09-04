# Service Writer Identity, Authentication, and RBAC Baseline

## Status

Phase B canonical identity contract for the production Service Writer application.

## Authentication authority

Supabase Auth is the only authentication authority. Server routes validate the active identity with `supabase.auth.getUser()` through `requireUser()`. Authorization must never be derived from browser-controlled role state, `user_metadata`, or `raw_user_meta_data`.

## Staff identity

Staff access is represented only by `workspace_members` and is scoped by both `workspace_id` and authenticated `user_id`. A staff authorization decision requires an active membership (`is_active = true`). Canonical staff roles are the live `member_role` enum: owner, admin, manager, service_advisor, technician, dispatcher, receptionist, fleet_manager, and viewer.

The `customer` enum value remains for invitation compatibility but customers are not staff members and must not be inserted into `workspace_members` for portal access.

## Customer identity

Customer portal identity is represented by `customer_users`, linking `workspace_id`, `customer_id`, and authenticated `user_id`. Customer authorization and staff authorization are separate trust domains.

## RLS authority

RLS is mandatory on `profiles`, `workspaces`, `workspace_members`, `customer_users`, `invitations`, and `invitation_events`. Browser and bearer-token requests rely on Supabase RLS in addition to server-side route authorization.

Canonical policy helpers are:

- `is_workspace_member(workspace_id)` — active staff membership.
- `is_workspace_admin(workspace_id)` — active owner/admin membership.
- `is_workspace_staff(workspace_id)` — active non-customer staff membership.
- `has_crm_capability(workspace_id, capability)` — CRM capability authorization.

The public helpers are security-invoker wrappers. Their privileged implementations remain in the private schema and must bind decisions to `auth.uid()` and active membership.

## Invitation lifecycle

Staff and customer invitations are stored in `invitations` with a SHA-256 token hash, normalized invited email, intended role, expiry, creator, workspace, and lifecycle timestamps. Raw invitation tokens must never be persisted.

`accept_invitation_v1` is the canonical acceptance transaction. It must require an authenticated user, match the authenticated email to the invited email, verify the token hash, reject expired/revoked/already-accepted invitations, create either the staff membership or customer identity link, consume the invitation, and append an `invitation_events` audit record.

`revoke_invitation_v1` is server-only/service-role callable and is not granted to browser roles.

## Server authorization boundary

`requireUser()` is the canonical identity validation entry point for authenticated APIs. `requireWorkspaceMember()` is the canonical workspace authorization primitive for role-gated server routes. Routes must not trust a workspace ID, role, or user ID supplied by the browser without resolving it against the authenticated Supabase user and live membership state.

## Phase B release invariants

A release must fail if any of the following are introduced:

1. Authorization based on `user_metadata` or `raw_user_meta_data`.
2. Workspace authorization that does not bind to authenticated `user.id`.
3. Workspace authorization that permits inactive membership.
4. Customer portal users treated as staff via `workspace_members`.
5. Raw invitation tokens stored in the database.
6. Invitation acceptance without authenticated email/token/expiry/revocation checks.
7. `revoke_invitation_v1` granted to `anon` or `authenticated`.
8. Core identity tables exposed without RLS.

## Live verification snapshot

Phase B audit verified the production Supabase project `rjfbrfognxqkyhdrpibx` against these invariants. Core identity tables are RLS-protected; staff/customer identities are separated; authorization helpers require active membership; `accept_invitation_v1` requires authentication and matching email/token state; and `revoke_invitation_v1` is limited to postgres/service-role execution.
