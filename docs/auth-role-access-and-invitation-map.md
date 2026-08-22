# Service Writer Authentication, Role, Invitation, and Access Map

## Scope

This document defines the access model for the Service Writer platform. The unrelated Turo/Vinted phrases in the source transcript are treated as transcription noise and are not part of the product domain.

The model separates **workspace staff** from **customer identities**. Shop owners, office managers, dispatchers, fleet managers, and technicians are workspace members. Customers authenticate against a customer-facing identity linked to one or more customer records and are never granted workspace staff permissions.

## Role vocabulary

| Product role | Canonical authorization role | Identity boundary | Primary experience |
|---|---|---|---|
| Shop owner | `owner` | Workspace staff | Full shop administration, billing, reports, team, integrations, and data. |
| Office manager | `manager` | Workspace staff | Daily office operations, customer/vehicle records, quotes, invoices, payments, and team coordination without owner-only controls. |
| Dispatcher | `dispatcher` | Workspace staff | Scheduling, dispatch board, technician status, fleet operations, and operational messaging. |
| Fleet manager | `fleet_manager` | Workspace staff | Fleet customers, fleet vehicles, work orders, service schedules, utilization, and fleet reporting; no shop billing or platform administration by default. |
| Technician | `technician` | Workspace staff | Assigned work, service execution, checklists, photos, status transitions, and limited customer/vehicle context. |
| Customer | `customer` | Customer identity | Own vehicles, appointments, approvals, invoices, receipts, messages, and booking; no workspace-wide data. |
| Platform administrator | `admin` | Platform staff | Emergency support and platform operations. Must be separate from ordinary shop-owner permissions and preferably unavailable through normal invitations. |

The existing code uses `admin` in several owner-only route rules. The migration should preserve backward compatibility by treating `admin` as a platform/legacy owner-equivalent only during transition, then move shop-owner records to `owner` and reserve `admin` for platform administration.

## Workspace and identity rules

A user session alone never grants workspace access. Every staff request must resolve an active membership for the requested `workspace_id`. The selected workspace must come from memberships belonging to the authenticated user, not from an unvalidated client-only value.

Customers must not be inserted into `workspace_members` merely to give them login access. Use a separate customer identity link such as `customer_users` with `workspace_id`, `customer_id`, `user_id`, status, and verification timestamps. Customer authorization must require both the authenticated user and the linked customer record for the active workspace.

A user may belong to multiple workspaces. The session may remember a selected workspace, but every server-side read/write must re-check membership and role for that workspace. Removing or deactivating a membership immediately removes access without requiring a client logout.

## Role capabilities

| Capability area | Owner | Office manager | Dispatcher | Fleet manager | Technician | Customer |
|---|---:|---:|---:|---:|---:|---:|
| Workspace settings and integrations | Full | No | No | No | No | No |
| Team invitations and role changes | Full | Limited, optional policy | No | No | No | No |
| Customers and vehicles | Full | Full | Read/update operational fields | Fleet-scoped full | Assigned-job limited read | Own records only |
| Appointments | Full | Full | Full dispatch control | Fleet-scoped scheduling | Assigned jobs/status only | Own appointments |
| Quotes | Full | Full | Read-only by default | Fleet-scoped create/read if enabled | Read assigned quote context | Own quotes/approvals |
| Invoices and payments | Full | Full operational | No financial access by default | Fleet billing read-only if enabled | No write access | Own invoices/payments |
| Service records | Full | Full | Read operational | Fleet-scoped full | Assigned records create/update | Own completed-service read |
| Dispatch board | Full | Read | Full | Fleet-scoped view/control | Own assignments | No |
| Fleet OS | Full | Read/limited | Scheduling and tracking | Full fleet operations | Assigned fleet context | No |
| Messaging | Full | Full | Operational messages | Fleet customer messages | Job-related messages | Own thread only |
| Reports and analytics | Full | Operational reports | Dispatch reports | Fleet reports | Personal performance only | No internal reports |
| Platform administration | No, unless separately granted | No | No | No | No | No |

Every mutation must be enforced in the API and database. Hiding a button is not an authorization control.

## Screen and route map

### Shared authentication routes

| Route | Allowed identities | Behavior |
|---|---|---|
| `/login` | All | Email/password, magic link, or approved OAuth entry point. |
| `/accept-invitation` | Invited staff or customer | Token is single-use, expiring, hashed at rest, and bound to the intended email/workspace/role. |
| `/forgot-password` | All | Supabase Auth recovery flow. |
| `/select-workspace` | Staff with multiple memberships | Shows only active memberships returned by the server. |
| `/customer` | Customer | Customer dashboard shell only. |
| `/app` or `/dashboard` | Staff | Redirects to role-appropriate landing screen after server-side identity resolution. |

### Staff screens

| Screen group | Owner | Office manager | Dispatcher | Fleet manager | Technician |
|---|---:|---:|---:|---:|---:|
| Dashboard | Yes | Yes | Dispatch summary | Fleet summary | Today’s jobs |
| Customers | Full | Full | Operational read | Fleet-scoped | Assigned-job context |
| Vehicles | Full | Full | Operational read | Fleet-scoped full | Assigned-job context |
| Appointments | Full | Full | Full | Fleet-scoped | Assigned jobs |
| Quotes | Full | Full | Read | Fleet-scoped | Read assigned context |
| Invoices/payments | Full | Full | Denied | Fleet billing read-only if enabled | Denied |
| Dispatch/command center | Full | Read | Full | Fleet-scoped | Status actions only |
| Fleet OS | Full | Read | Scheduling/tracking | Full | Assigned fleet context |
| Service records | Full | Full | Read | Fleet-scoped full | Assigned records |
| Messages | Full | Full | Operational | Fleet customer threads | Job threads |
| Team OS | Full | Limited view | Denied | Denied | Denied |
| Settings | Full | Denied or narrow profile settings | Denied | Denied | Profile/session settings |
| Reports | Full | Operational | Dispatch | Fleet | Personal only |

### Customer screens

Customers receive a separate shell with `/customer/dashboard`, `/customer/appointments`, `/customer/vehicles`, `/customer/approvals`, `/customer/invoices`, `/customer/messages`, and `/customer/profile`. Customer routes must never reuse staff route access rules merely by checking that a user is authenticated.

## Invitation rules

Only owners may invite all staff roles. Office managers may invite technicians and, if enabled by an owner policy, dispatchers or fleet managers. Dispatchers, fleet managers, technicians, and customers cannot invite staff.

A staff invitation contains `workspace_id`, normalized email, intended role, inviter, expiry, status, and a hash of a single-use token. The raw token appears only in the invitation URL and is never persisted. Accepting an invitation verifies the token, checks expiry/revocation, confirms the email, creates or links the Supabase Auth user, creates the membership transactionally, and consumes the invitation.

A customer invitation is created from an existing customer record and may only grant access to that customer’s own records. It must not accept an arbitrary customer ID from the browser without verifying that the inviter has permission over that customer.

Invitations must be idempotent for the same workspace, normalized email, and pending role. Re-inviting an existing active member is rejected. Changing a pending invitation requires explicit cancellation and a new token. Audit every create, resend, accept, revoke, and role-change event.

## Route-guard contract

The frontend route guard is a user-experience boundary only. The API route must independently perform:

1. Supabase session validation.
2. Workspace ID schema validation.
3. Active membership or customer-link lookup.
4. Role/capability authorization.
5. Resource-level ownership or assignment validation.
6. Consistent `401`, `403`, `404`, `409`, and `422` responses without leaking whether another tenant’s record exists.

Recommended policy functions are `is_workspace_member(workspace_id)`, `has_workspace_role(workspace_id, roles[])`, `is_workspace_staff(workspace_id)`, `is_workspace_admin(workspace_id)`, `is_customer_for_workspace(workspace_id, customer_id)`, `is_assigned_technician(workspace_id, record_id)`, and `is_fleet_manager_for_account(workspace_id, fleet_account_id)`.

## RLS design

Every tenant-owned table must have a non-null `workspace_id` and a composite foreign-key or ownership path that cannot be bypassed by changing a client-supplied workspace ID. RLS policies should use `auth.uid()` and security-definer helper functions with a locked `search_path`.

Staff policies should follow this pattern:

- Member select: active membership in the row workspace.
- Owner/manager write: role-specific mutation permission.
- Dispatcher write: dispatch and operational fields only.
- Fleet-manager write: rows linked to fleet accounts assigned to that manager’s workspace scope.
- Technician write: only assigned service/dispatch records and explicitly allowed execution fields.
- Customer select: only rows linked through `customer_users` for the authenticated user.
- Customer write: only narrowly scoped approval/profile/message operations.
- Webhook/service-role operations: service-role only, with route signature verification and no browser exposure.

RLS tests must include two workspaces, two staff users, one fleet manager, one technician, and two customers. Tests must prove both positive access and negative cross-tenant access.

## Recommended implementation sequence

1. Normalize role vocabulary and decide the compatibility treatment of current `admin` records.
2. Add `fleet_manager` to the workspace role type and update generated Supabase types.
3. Add `customer_users` and invitation tables if the current schema does not already provide equivalent links.
4. Add server-side identity resolution returning memberships, selected workspace, role, and customer links.
5. Add API routes for staff invitations, customer invitations, accept, resend, revoke, and role changes.
6. Extend the shared route-access policy with fleet-manager and customer route groups.
7. Add role-aware navigation and separate customer shell routes.
8. Add RLS policies and real Supabase tests before enabling production invitations.
9. Run staging tests for invitation acceptance, deactivation, workspace switching, customer isolation, fleet scoping, and session expiry.
10. Only then enable production integration testing for email invitations, messaging, payments, and live deployment.

## Launch acceptance criteria

Authentication is ready for live testing only when every role can sign in, resolve the correct workspace or customer identity, see only its allowed navigation, receive the correct API status for denied actions, and pass real Supabase RLS tests. Invitation acceptance must be replay-safe and auditable. No service-role or provider secret may appear in the Vite bundle, browser storage, or client-side logs.
