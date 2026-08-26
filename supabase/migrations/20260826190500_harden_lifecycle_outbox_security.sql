begin;

-- Keep the queue service-role-only. The explicit deny policy documents the
-- intended posture for the Supabase security advisor while service_role bypasses
-- RLS for the worker.
drop policy if exists lifecycle_event_outbox_no_client_access on public.lifecycle_event_outbox;
create policy lifecycle_event_outbox_no_client_access
  on public.lifecycle_event_outbox
  for all
  to authenticated, anon
  using (false)
  with check (false);

revoke all on public.lifecycle_event_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.lifecycle_event_outbox to service_role;

revoke execute on function public.enqueue_lifecycle_event(uuid, text, text, uuid, text, citext, text, jsonb) from public, anon, authenticated;
revoke execute on function public.claim_lifecycle_events(integer, text) from public, anon, authenticated;
revoke execute on function public.complete_lifecycle_event(uuid, text, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.enqueue_lifecycle_event(uuid, text, text, uuid, text, citext, text, jsonb) to service_role;
grant execute on function public.claim_lifecycle_events(integer, text) to service_role;
grant execute on function public.complete_lifecycle_event(uuid, text, boolean, text, integer) to service_role;

commit;
