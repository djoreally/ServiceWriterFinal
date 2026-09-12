begin;

create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from pgmq.list_queues() where queue_name='lifecycle_events') then perform pgmq.create('lifecycle_events'); end if;
  if not exists (select 1 from pgmq.list_queues() where queue_name='push_notifications') then perform pgmq.create('push_notifications'); end if;
  if not exists (select 1 from pgmq.list_queues() where queue_name='crm_projection') then perform pgmq.create('crm_projection'); end if;
  if not exists (select 1 from pgmq.list_queues() where queue_name='resend_reconciliation') then perform pgmq.create('resend_reconciliation'); end if;
  if not exists (select 1 from pgmq.list_queues() where queue_name='payment_reconciliation') then perform pgmq.create('payment_reconciliation'); end if;
end $$;

create or replace function public.enqueue_lifecycle_pgmq_bridge()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform pgmq.send(queue_name=>'lifecycle_events', msg=>jsonb_build_object('outbox_id',new.id));
  return new;
end;
$$;

revoke all on function public.enqueue_lifecycle_pgmq_bridge() from public,anon,authenticated;
grant execute on function public.enqueue_lifecycle_pgmq_bridge() to service_role;

drop trigger if exists lifecycle_event_outbox_enqueue_pgmq on public.lifecycle_event_outbox;
create trigger lifecycle_event_outbox_enqueue_pgmq
after insert on public.lifecycle_event_outbox
for each row execute function public.enqueue_lifecycle_pgmq_bridge();

create or replace function public.read_lifecycle_queue_v1(
  p_visibility_seconds integer default 120,
  p_limit integer default 5
)
returns table(msg_id bigint,read_ct bigint,enqueued_at timestamptz,vt timestamptz,message jsonb)
language sql
security definer
set search_path=''
as $$
  select q.msg_id,q.read_ct,q.enqueued_at,q.vt,q.message
  from pgmq.read(
    queue_name=>'lifecycle_events',
    vt=>greatest(30,least(coalesce(p_visibility_seconds,120),900)),
    qty=>greatest(1,least(coalesce(p_limit,5),25))
  ) q;
$$;

create or replace function public.archive_lifecycle_queue_v1(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path=''
as $$ select pgmq.archive('lifecycle_events',p_msg_id); $$;

create or replace function public.defer_lifecycle_queue_v1(p_msg_id bigint,p_seconds integer)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  perform pgmq.set_vt(
    queue_name=>'lifecycle_events',
    msg_id=>p_msg_id,
    vt_offset=>greatest(30,least(coalesce(p_seconds,300),86400))
  );
  return true;
end;
$$;

create or replace function public.claim_lifecycle_event_by_id_v1(
  p_id uuid,
  p_worker_id text
)
returns setof public.lifecycle_event_outbox
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  update public.lifecycle_event_outbox e
  set status='processing',
      attempts=e.attempts+1,
      locked_at=timezone('utc',now()),
      locked_by=p_worker_id,
      updated_at=timezone('utc',now())
  where e.id=p_id
    and (
      e.status in ('pending','failed')
      or (e.status='processing' and e.locked_at < timezone('utc',now()) - interval '10 minutes')
    )
  returning e.*;
end;
$$;

revoke all on function public.read_lifecycle_queue_v1(integer,integer) from public,anon,authenticated;
revoke all on function public.archive_lifecycle_queue_v1(bigint) from public,anon,authenticated;
revoke all on function public.defer_lifecycle_queue_v1(bigint,integer) from public,anon,authenticated;
revoke all on function public.claim_lifecycle_event_by_id_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.read_lifecycle_queue_v1(integer,integer) to service_role;
grant execute on function public.archive_lifecycle_queue_v1(bigint) to service_role;
grant execute on function public.defer_lifecycle_queue_v1(bigint,integer) to service_role;
grant execute on function public.claim_lifecycle_event_by_id_v1(uuid,text) to service_role;

select cron.schedule(
  'crm-projection-reconcile',
  '*/5 * * * *',
  $$select public.reconcile_crm_profiles_v1(null::uuid);$$
)
where not exists (select 1 from cron.job where jobname='crm-projection-reconcile');

-- lifecycle-worker-every-minute is scheduled separately after Vault contains
-- project_url and publishable_key. This migration intentionally never embeds secrets.

commit;
