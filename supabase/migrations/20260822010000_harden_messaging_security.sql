-- Security hardening for the replacement template and messaging subsystem.
begin;

drop policy if exists webhook_events_staff_select on public.webhook_events;
create policy webhook_events_staff_select
  on public.webhook_events for select
  using (workspace_id is not null and public.is_workspace_staff(workspace_id));

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.is_workspace_member(uuid) from public, anon, authenticated;
revoke execute on function public.has_workspace_role(uuid, public.member_role[]) from public, anon, authenticated;
revoke execute on function public.is_workspace_staff(uuid) from public, anon, authenticated;
revoke execute on function public.is_workspace_admin(uuid) from public, anon, authenticated;
revoke execute on function public.is_customer_for_workspace(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_assigned_technician(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.messaging_apply_delivery_event(text, text, text, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.messaging_has_active_suppression(uuid, text, text, citext, text) from public, anon, authenticated;

grant execute on function public.messaging_apply_delivery_event(text, text, text, timestamptz, text, text) to service_role;
grant execute on function public.messaging_has_active_suppression(uuid, text, text, citext, text) to authenticated, service_role;

commit;
