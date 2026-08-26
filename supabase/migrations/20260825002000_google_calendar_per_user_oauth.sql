begin;

create table if not exists public.google_calendar_sync_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null default 'primary',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz not null default now(),
  sync_enabled boolean not null default true,
  needs_reauth boolean not null default false,
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_sync_tokens_user_id_key unique (user_id)
);

create table if not exists public.appointment_calendar_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null default 'primary',
  google_event_id text not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_calendar_events_user_appointment_key unique (user_id, appointment_id),
  constraint appointment_calendar_events_user_event_key unique (user_id, calendar_id, google_event_id)
);

create index if not exists google_calendar_sync_tokens_user_idx on public.google_calendar_sync_tokens(user_id);
create index if not exists appointment_calendar_events_appointment_idx on public.appointment_calendar_events(appointment_id);
create index if not exists appointment_calendar_events_user_idx on public.appointment_calendar_events(user_id);

drop trigger if exists google_calendar_sync_tokens_updated_at on public.google_calendar_sync_tokens;
create trigger google_calendar_sync_tokens_updated_at before update on public.google_calendar_sync_tokens
for each row execute function public.set_identity_updated_at();

drop trigger if exists appointment_calendar_events_updated_at on public.appointment_calendar_events;
create trigger appointment_calendar_events_updated_at before update on public.appointment_calendar_events
for each row execute function public.set_updated_at();

alter table public.google_calendar_sync_tokens enable row level security;
alter table public.appointment_calendar_events enable row level security;

drop policy if exists google_calendar_sync_tokens_owner_select on public.google_calendar_sync_tokens;
create policy google_calendar_sync_tokens_owner_select on public.google_calendar_sync_tokens
for select to authenticated using (auth.uid() = user_id);
drop policy if exists google_calendar_sync_tokens_owner_write on public.google_calendar_sync_tokens;
create policy google_calendar_sync_tokens_owner_write on public.google_calendar_sync_tokens
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists appointment_calendar_events_owner_select on public.appointment_calendar_events;
create policy appointment_calendar_events_owner_select on public.appointment_calendar_events
for select to authenticated using (auth.uid() = user_id);
drop policy if exists appointment_calendar_events_owner_write on public.appointment_calendar_events;
create policy appointment_calendar_events_owner_write on public.appointment_calendar_events
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.google_calendar_sync_tokens to authenticated;
grant select, insert, update, delete on public.appointment_calendar_events to authenticated;
revoke all on public.google_calendar_sync_tokens from anon;
revoke all on public.appointment_calendar_events from anon;

commit;
