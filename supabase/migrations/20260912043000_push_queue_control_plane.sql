begin;

create or replace function public.enqueue_push_pgmq_bridge()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform pgmq.send(
    queue_name=>'push_notifications',
    msg=>jsonb_build_object('outbox_id',new.id)
  );
  return new;
end;
$$;

revoke all on function public.enqueue_push_pgmq_bridge() from public,anon,authenticated;
grant execute on function public.enqueue_push_pgmq_bridge() to service_role;

drop trigger if exists in_app_push_outbox_enqueue_pgmq on public.in_app_notification_push_outbox;
create trigger in_app_push_outbox_enqueue_pgmq
after insert on public.in_app_notification_push_outbox
for each row execute function public.enqueue_push_pgmq_bridge();

create or replace function public.read_push_queue_v1(
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
    queue_name=>'push_notifications',
    vt=>greatest(30,least(coalesce(p_visibility_seconds,120),900)),
    qty=>greatest(1,least(coalesce(p_limit,5),25))
  ) q;
$$;

create or replace function public.archive_push_queue_v1(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path=''
as $$ select pgmq.archive('push_notifications',p_msg_id); $$;

create or replace function public.defer_push_queue_v1(p_msg_id bigint,p_seconds integer)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  perform pgmq.set_vt(
    queue_name=>'push_notifications',
    msg_id=>p_msg_id,
    vt_offset=>greatest(30,least(coalesce(p_seconds,300),86400))
  );
  return true;
end;
$$;

create or replace function public.claim_push_event_by_id_v1(
  p_id uuid,
  p_worker_id text
)
returns setof public.in_app_notification_push_outbox
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  update public.in_app_notification_push_outbox o
  set status='processing',
      attempts=o.attempts+1,
      locked_at=timezone('utc',now()),
      locked_by=p_worker_id,
      updated_at=timezone('utc',now())
  where o.id=p_id
    and (
      o.status in ('pending','failed')
      or (o.status='processing' and o.locked_at < timezone('utc',now()) - interval '10 minutes')
    )
  returning o.*;
end;
$$;

revoke all on function public.read_push_queue_v1(integer,integer) from public,anon,authenticated;
revoke all on function public.archive_push_queue_v1(bigint) from public,anon,authenticated;
revoke all on function public.defer_push_queue_v1(bigint,integer) from public,anon,authenticated;
revoke all on function public.claim_push_event_by_id_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.read_push_queue_v1(integer,integer) to service_role;
grant execute on function public.archive_push_queue_v1(bigint) to service_role;
grant execute on function public.defer_push_queue_v1(bigint,integer) to service_role;
grant execute on function public.claim_push_event_by_id_v1(uuid,text) to service_role;

insert into pgmq.q_push_notifications(message)
select jsonb_build_object('outbox_id',o.id)
from public.in_app_notification_push_outbox o
where o.status in ('pending','failed')
  and coalesce(o.available_at,timezone('utc',now())) <= timezone('utc',now())
  and not exists (
    select 1
    from pgmq.q_push_notifications q
    where q.message->>'outbox_id'=o.id::text
  );

commit;
