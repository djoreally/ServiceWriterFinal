-- Shot 6: make Google Calendar OAuth token storage server-only.
-- Prepared detached from main; apply only with the final certified release.

begin;

alter table public.google_calendar_sync_tokens enable row level security;

-- OAuth access and refresh tokens are integration secrets. The browser invokes
-- the authenticated Google Calendar function; it never needs direct table
-- access to token ciphertext or token lifecycle fields.
revoke all on table public.google_calendar_sync_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.google_calendar_sync_tokens to service_role;

drop policy if exists google_calendar_sync_tokens_owner_select on public.google_calendar_sync_tokens;
drop policy if exists google_calendar_sync_tokens_owner_write on public.google_calendar_sync_tokens;

comment on table public.google_calendar_sync_tokens is
  'Server-only encrypted Google Calendar OAuth state. Browser clients must use protected integration endpoints and never select token columns.';

commit;
