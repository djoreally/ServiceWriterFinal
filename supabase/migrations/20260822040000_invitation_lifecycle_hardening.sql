-- Phase 6: invitation lifecycle hardening
-- Raw invitation tokens remain outside the database; only token digests are persisted.

create table if not exists public.invitation_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  invited_email citext not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null,
  provider_message_id text,
  status text not null default 'accepted',
  created_at timestamptz not null default now(),
  constraint invitation_delivery_attempts_status_check check (status in ('accepted', 'failed'))
);

create index if not exists invitation_delivery_attempts_workspace_email_created_idx
  on public.invitation_delivery_attempts (workspace_id, lower(invited_email::text), created_at desc);

create index if not exists invitation_delivery_attempts_invitation_created_idx
  on public.invitation_delivery_attempts (invitation_id, created_at desc);

create unique index if not exists invitations_one_pending_per_workspace_email
  on public.invitations (workspace_id, lower(invited_email::text))
  where accepted_at is null and revoked_at is null;

alter table public.invitation_delivery_attempts enable row level security;
revoke all on public.invitation_delivery_attempts from anon, authenticated;
grant select, insert on public.invitation_delivery_attempts to authenticated;

drop policy if exists invitation_delivery_attempts_admin_select on public.invitation_delivery_attempts;
create policy invitation_delivery_attempts_admin_select on public.invitation_delivery_attempts
for select to authenticated
using (public.is_workspace_admin(workspace_id));

drop policy if exists invitation_delivery_attempts_admin_insert on public.invitation_delivery_attempts;
create policy invitation_delivery_attempts_admin_insert on public.invitation_delivery_attempts
for insert to authenticated
with check (public.is_workspace_admin(workspace_id) and actor_user_id = auth.uid());

comment on table public.invitation_delivery_attempts is 'Rate-limit and provider audit records for invitation email delivery; raw tokens are never stored.';
