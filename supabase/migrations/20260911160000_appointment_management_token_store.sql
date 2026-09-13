-- Shot 15: dedicated digest-only appointment management token store.
begin;

create table if not exists public.appointment_management_tokens (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token_digest text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0,
  source text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(token_digest)
);

create index if not exists appointment_management_tokens_appointment_idx
  on public.appointment_management_tokens(appointment_id, revoked_at, expires_at);
create index if not exists appointment_management_tokens_workspace_idx
  on public.appointment_management_tokens(workspace_id, appointment_id);

alter table public.appointment_management_tokens enable row level security;
revoke all on table public.appointment_management_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.appointment_management_tokens to service_role;

comment on table public.appointment_management_tokens is
  'Server-only appointment management bearer-token digests. Raw bearer tokens must never be stored here.';

commit;
