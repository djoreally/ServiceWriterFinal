-- Shot 4: isolate provider credentials from browser-readable workspace settings.
-- Prepared detached from main; apply only with the final certified release.

alter table public.provider_connection_secrets
  add column if not exists credential_payload_encrypted text;

comment on column public.provider_connection_secrets.credential_payload_encrypted is
  'Server-only encrypted provider-specific credential payload. Never expose through browser clients or public RPCs.';

alter table public.provider_connection_secrets enable row level security;
revoke all on table public.provider_connection_secrets from anon, authenticated;
