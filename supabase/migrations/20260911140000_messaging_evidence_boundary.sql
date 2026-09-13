-- Shot 13: make messaging evidence server-authored.
-- Prepared detached from main; apply only with the final certified release.

begin;

-- Delivery logs are operational evidence. Staff may read rows allowed by RLS,
-- but provider/send state is authored by trusted server workflows only.
revoke insert, update, delete on table public.message_logs from authenticated;
grant select on table public.message_logs to authenticated;
grant select, insert, update, delete on table public.message_logs to service_role;

drop policy if exists message_logs_staff_insert on public.message_logs;
drop policy if exists message_logs_admin_update on public.message_logs;

-- Consent and suppression rows affect whether communication is legally and
-- operationally eligible to send. Browser clients may inspect authorized rows,
-- but writes must flow through server-side consent/opt-out workflows.
revoke insert, update, delete on table public.messaging_consents from authenticated;
revoke insert, update, delete on table public.messaging_suppressions from authenticated;
grant select on table public.messaging_consents to authenticated;
grant select on table public.messaging_suppressions to authenticated;
grant select, insert, update, delete on table public.messaging_consents to service_role;
grant select, insert, update, delete on table public.messaging_suppressions to service_role;

drop policy if exists messaging_consents_staff_write on public.messaging_consents;
drop policy if exists messaging_suppressions_staff_write on public.messaging_suppressions;

comment on table public.message_logs is
  'Server-authored messaging delivery ledger; authorized workspace users may read but not forge provider/send state.';
comment on table public.messaging_consents is
  'Server-authored consent evidence; browser roles may read authorized records but cannot directly mutate consent state.';
comment on table public.messaging_suppressions is
  'Server-authored suppression evidence; browser roles may read authorized records but cannot directly mutate suppression state.';

commit;
