-- Booking draft engine v1. Apply in staging after review; never apply to production ad hoc.
-- Drafts are distinct from confirmed appointments and abandoned-booking analytics.
create table if not exists public.booking_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  token_hash text not null unique,
  schema_version integer not null default 1 check (schema_version = 1),
  version integer not null default 0 check (version >= 0),
  status text not null default 'editing'
    check (status in ('editing','committing','committed','expired')),
  current_step text not null default 'customer'
    check (current_step in ('customer','location','vehicles','services','schedule','review')),
  completed_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(completed_steps) = 'array'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  appointment_id uuid references public.appointments(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_drafts_commit_consistency check (
    (status = 'committed' and appointment_id is not null)
    or (status <> 'committed' and appointment_id is null)
  )
);
create index if not exists booking_drafts_workspace_status_idx
  on public.booking_drafts(workspace_id,status,updated_at desc);
create index if not exists booking_drafts_expiry_idx
  on public.booking_drafts(expires_at) where status = 'editing';
create unique index if not exists booking_drafts_appointment_unique_idx
  on public.booking_drafts(appointment_id) where appointment_id is not null;
alter table public.booking_drafts enable row level security;
revoke all on public.booking_drafts from public, anon, authenticated;
-- All guest draft access must go through narrow, audited SECURITY DEFINER
-- functions or authenticated server endpoints that verify a hashed bearer token.
-- Never expose the token hash, raw payload, or generic CRUD to browser roles.
comment on table public.booking_drafts is
  'Private resumable booking drafts; guest access only through explicit capability-checked APIs.';
