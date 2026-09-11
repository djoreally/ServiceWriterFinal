-- Shot 22: remove legacy plaintext appointment-management secrets.
begin;

update public.appointments
set metadata = coalesce(metadata,'{}'::jsonb) - 'management_token',
    updated_at = now()
where metadata ? 'management_token';

drop function if exists public.ensure_appointment_management_token_v1();

comment on table public.appointments is
  'Canonical appointments. Management bearer secrets are not stored in appointment metadata; digest-only state lives in appointment_management_tokens.';

commit;
