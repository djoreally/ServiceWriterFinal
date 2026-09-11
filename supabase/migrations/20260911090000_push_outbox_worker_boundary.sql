-- Shot 8: keep push-delivery queue worker-only.
-- Prepared detached from main; apply only with the final certified release.

begin;

alter table public.in_app_notification_push_outbox enable row level security;

revoke all on table public.in_app_notification_push_outbox
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.in_app_notification_push_outbox
  to service_role;

drop policy if exists in_app_notification_push_outbox_select_own
  on public.in_app_notification_push_outbox;

comment on table public.in_app_notification_push_outbox is
  'Worker-only push delivery queue. Browser clients must read user-facing notifications, never queue internals.';

commit;
