begin;

alter table public.message_logs
  add column if not exists last_delivery_occurred_at timestamptz;

create or replace function public.messaging_apply_delivery_event(
  target_provider text,
  target_provider_message_id text,
  target_status text,
  target_occurred_at timestamptz,
  target_failure_code text default null,
  target_failure_reason text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  updated_id uuid;
begin
  update public.message_logs
  set status = target_status,
      failure_code = case when target_status in ('sent', 'delivered', 'accepted') then null else coalesce(target_failure_code, failure_code) end,
      failure_reason = case when target_status in ('sent', 'delivered', 'accepted') then null else coalesce(target_failure_reason, failure_reason) end,
      delivered_at = case when target_status = 'delivered' then coalesce(delivered_at, target_occurred_at) else delivered_at end,
      sent_at = case when target_status in ('sent', 'delivered') then coalesce(sent_at, target_occurred_at) else sent_at end,
      failed_at = case when target_status in ('failed', 'bounced', 'complained', 'undeliverable') then coalesce(failed_at, target_occurred_at) when target_status in ('accepted', 'sent', 'delivered') then null else failed_at end,
      last_delivery_occurred_at = target_occurred_at,
      updated_at = timezone('utc', now())
  where provider = target_provider and provider_message_id = target_provider_message_id
    and status not in ('delivered', 'canceled')
    and (last_delivery_occurred_at is null or target_occurred_at >= last_delivery_occurred_at)
  returning id into updated_id;
  return updated_id;
end;
$$;

create or replace function public.messaging_record_delivery_suppression(
  target_workspace_id uuid,
  target_email citext,
  target_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  suppression_id uuid;
begin
  if target_workspace_id is null or target_email is null then return null; end if;
  select id into suppression_id from public.messaging_suppressions
    where workspace_id = target_workspace_id and email = target_email and active
    limit 1;
  if suppression_id is not null then return suppression_id; end if;
  insert into public.messaging_suppressions(workspace_id, channel, purpose, email, reason, source)
  values (target_workspace_id, 'email', null, target_email, case when target_reason = 'complained' then 'complaint' else 'hard_bounce' end, 'resend')
  returning id into suppression_id;
  return suppression_id;
end;
$$;

revoke execute on function public.messaging_record_delivery_suppression(uuid, citext, text) from public, anon, authenticated;
grant execute on function public.messaging_record_delivery_suppression(uuid, citext, text) to service_role;

commit;
