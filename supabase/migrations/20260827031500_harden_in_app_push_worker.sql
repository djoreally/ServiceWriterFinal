begin;

create or replace function public.claim_in_app_push_outbox(
  p_limit integer default 50,
  p_worker_id text default null
)
returns table (
  id uuid,
  notification_id uuid,
  subscription_id uuid,
  attempts integer,
  worker_id text,
  title text,
  message text,
  metadata jsonb,
  endpoint text,
  p256dh text,
  auth_key text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select o.id
    from public.in_app_notification_push_outbox o
    join public.tech_push_subscriptions s on s.id = o.subscription_id
    join public.in_app_notifications n on n.id = o.notification_id
    where o.status in ('pending', 'failed')
      and o.next_attempt_at <= timezone('utc', now())
      and o.attempts < 8
      and s.disabled_at is null
      and n.dismissed_at is null
    order by o.next_attempt_at, o.created_at
    for update of o skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), claimed as (
    update public.in_app_notification_push_outbox o
    set status = 'processing',
        attempts = o.attempts + 1,
        worker_id = coalesce(p_worker_id, 'push-worker'),
        locked_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    from candidates c
    where o.id = c.id
    returning o.*
  )
  select c.id, c.notification_id, c.subscription_id, c.attempts, c.worker_id,
         n.title, n.message, n.metadata,
         s.endpoint, s.p256dh, s.auth_key
  from claimed c
  join public.in_app_notifications n on n.id = c.notification_id
  join public.tech_push_subscriptions s on s.id = c.subscription_id
  where s.disabled_at is null and n.dismissed_at is null;
end;
$$;

create or replace function public.complete_in_app_push_outbox(
  p_id uuid,
  p_worker_id text,
  p_sent boolean,
  p_error text default null,
  p_retry_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
  should_discard boolean := p_error = 'subscription_gone';
begin
  update public.in_app_notification_push_outbox
  set status = case
      when p_sent then 'sent'
      when should_discard or attempts >= 8 then 'discarded'
      else 'failed'
    end,
    last_error = case when p_sent then null else left(coalesce(p_error, 'Push delivery failed'), 1000) end,
    sent_at = case when p_sent then timezone('utc', now()) else sent_at end,
    next_attempt_at = case when p_sent or should_discard then next_attempt_at else timezone('utc', now()) + make_interval(secs => greatest(30, least(coalesce(p_retry_seconds, 300), 86400))) end,
    locked_at = null,
    worker_id = null,
    updated_at = timezone('utc', now())
  where id = p_id
    and status = 'processing'
    and worker_id = p_worker_id;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

commit;
