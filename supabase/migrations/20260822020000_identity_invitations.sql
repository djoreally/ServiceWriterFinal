-- Phase 3: formal identity and invitation schema
-- Security contract: plaintext invitation tokens are never persisted; only SHA-256 digests are stored.

create extension if not exists pgcrypto;

-- customer_users already exists in the live database with workspace_id. Extend it idempotently.
create table if not exists public.customer_users (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, customer_id, user_id)
);

alter table public.customer_users
  add column if not exists is_primary boolean not null default false;
alter table public.customer_users
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists customer_users_one_primary_per_customer
  on public.customer_users (workspace_id, customer_id)
  where is_primary;

create index if not exists customer_users_user_workspace_idx
  on public.customer_users (user_id, workspace_id);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  invited_email citext not null,
  invited_role public.member_role not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_token_hash_length check (length(token_hash) = 64),
  constraint invitations_lifecycle_check check (accepted_at is null or revoked_at is null)
);

create unique index if not exists invitations_active_token_hash_key
  on public.invitations (token_hash)
  where accepted_at is null and revoked_at is null;

create index if not exists invitations_workspace_status_idx
  on public.invitations (workspace_id, expires_at, accepted_at, revoked_at);

create index if not exists invitations_email_idx
  on public.invitations (lower(invited_email::text));

create table if not exists public.invitation_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint invitation_events_type_check check (event_type in ('created', 'resent', 'accepted', 'revoked', 'expired'))
);

create index if not exists invitation_events_invitation_created_idx
  on public.invitation_events (invitation_id, created_at desc);

create index if not exists invitation_events_workspace_created_idx
  on public.invitation_events (workspace_id, created_at desc);

create or replace function public.set_identity_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customer_users_set_updated_at on public.customer_users;
create trigger customer_users_set_updated_at
before update on public.customer_users
for each row execute function public.set_identity_updated_at();

drop trigger if exists invitations_set_updated_at on public.invitations;
create trigger invitations_set_updated_at
before update on public.invitations
for each row execute function public.set_identity_updated_at();

alter table public.customer_users enable row level security;
alter table public.invitations enable row level security;
alter table public.invitation_events enable row level security;

revoke all on public.customer_users from anon, authenticated;
revoke all on public.invitations from anon, authenticated;
revoke all on public.invitation_events from anon, authenticated;
grant select, insert, update, delete on public.customer_users to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;
grant select, insert on public.invitation_events to authenticated;

comment on table public.customer_users is 'Links Supabase Auth identities to customer records; access is workspace-scoped through the customer record.';
comment on table public.invitations is 'Workspace-scoped invitations. Persist only SHA-256 token digests, never raw invitation tokens.';
comment on table public.invitation_events is 'Append-only invitation lifecycle audit events.';
