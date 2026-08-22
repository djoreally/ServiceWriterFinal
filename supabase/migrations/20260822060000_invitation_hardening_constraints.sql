-- Phase 6 hardening: enforce invitation invariants at the database boundary.

alter table public.invitations
  drop constraint if exists invitations_customer_role_check;

alter table public.invitations
  add constraint invitations_customer_role_check
  check (invited_role <> 'customer'::public.member_role or customer_id is not null);

alter table public.invitations
  drop constraint if exists invitations_customer_workspace_fk;

alter table public.invitations
  add constraint invitations_customer_workspace_fk
  foreign key (workspace_id, customer_id)
  references public.customers (workspace_id, id)
  on delete restrict;

create index if not exists invitations_workspace_status_expiry_idx
  on public.invitations (workspace_id, expires_at)
  where accepted_at is null and revoked_at is null;

create index if not exists invitation_delivery_attempts_workspace_created_idx
  on public.invitation_delivery_attempts (workspace_id, created_at desc);

comment on constraint invitations_customer_role_check on public.invitations is
  'Customer invitations must reference a customer record.';
comment on constraint invitations_customer_workspace_fk on public.invitations is
  'Customer invitation links must remain inside the invitation workspace.';
