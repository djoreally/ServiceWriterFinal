-- Shot 16: backfill existing plaintext appointment management links into digest storage.
begin;

insert into public.appointment_management_tokens (
  appointment_id,
  workspace_id,
  token_digest,
  issued_at,
  expires_at,
  source
)
select
  a.id,
  a.workspace_id,
  pg_catalog.encode(
    extensions.digest(a.metadata ->> 'management_token', 'sha256'),
    'hex'
  ),
  coalesce(a.created_at, now()),
  case
    when a.starts_at is not null then a.starts_at + interval '30 days'
    else now() + interval '90 days'
  end,
  'legacy_metadata_backfill'
from public.appointments a
where nullif(a.metadata ->> 'management_token','') is not null
on conflict (token_digest) do nothing;

comment on table public.appointment_management_tokens is
  'Server-only appointment management bearer-token digests. Legacy plaintext appointment links are backfilled here before plaintext metadata is removed.';

commit;
