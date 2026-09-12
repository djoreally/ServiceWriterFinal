-- Shot 12: keep invitation delivery attempts server-only.
-- Prepared detached from main; apply only with the final certified release.

begin;

revoke all on table public.invitation_delivery_attempts
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.invitation_delivery_attempts
  to service_role;

drop policy if exists invitation_delivery_attempts_admin_select
  on public.invitation_delivery_attempts;
drop policy if exists invitation_delivery_attempts_admin_insert
  on public.invitation_delivery_attempts;

comment on table public.invitation_delivery_attempts is
  'Server-only invitation delivery/rate-limit evidence. Browser clients must not read or manufacture delivery attempts.';

commit;
