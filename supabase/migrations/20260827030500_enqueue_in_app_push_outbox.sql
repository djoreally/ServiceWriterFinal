begin;

create or replace function public.enqueue_in_app_notification_pushes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.in_app_notification_push_outbox (notification_id, subscription_id)
  select new.id, s.id
  from public.tech_push_subscriptions s
  where s.user_id = new.user_id
    and (new.workspace_id is null or s.workspace_id = new.workspace_id or s.workspace_id is null)
    and s.disabled_at is null
  on conflict (notification_id, subscription_id) do nothing;
  return new;
end;
$$;

drop trigger if exists in_app_notifications_enqueue_push on public.in_app_notifications;
create trigger in_app_notifications_enqueue_push
after insert on public.in_app_notifications
for each row execute function public.enqueue_in_app_notification_pushes();

-- A device that subscribes after notifications already exist should not receive
-- historical notifications. Only future inserts enter the push outbox.
revoke all on function public.enqueue_in_app_notification_pushes() from public, anon, authenticated;
grant execute on function public.enqueue_in_app_notification_pushes() to service_role;

commit;
