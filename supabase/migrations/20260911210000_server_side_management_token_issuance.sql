-- Shot 20: retire trigger-generated plaintext token issuance.
begin;

drop trigger if exists appointments_ensure_management_token on public.appointments;
revoke execute on function public.ensure_appointment_management_token_v1()
  from public, anon, authenticated;

comment on function public.ensure_appointment_management_token_v1() is
  'Legacy plaintext-token trigger retained temporarily for rollback only. Canonical issuance occurs server-side and stores digest-only state.';

commit;
